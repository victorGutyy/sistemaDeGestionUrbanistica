import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { registrarAuditoria } from '../auditoria/auditoria.js';
import { filtroVenta } from '../auth/alcance.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { formatearFechaISO, parsearFechaLocal } from '../common/fecha.util.js';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoAbono, EstadoVenta, FormaPago } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { calcularReprogramacion, ReprogramacionInvalida, type CambioDeFecha } from './ajustar-plan.js';
import { calcularCambiosDeValor, ValoresInvalidos, type CambioDeValor, type CuotaConValor } from './ajustar-valores.js';
import { AjustarPlanDto } from './dto/ajustar-plan.dto.js';

// El cambio de una cuota, con su fecha y su valor (iguales antes y después si ese dato no cambia).
interface CambioDeCuota {
  cuotaId: string;
  numero: number;
  fechaAntes: Date;
  fechaDespues: Date;
  valorAntes: Prisma.Decimal;
  valorDespues: Prisma.Decimal;
  estadoDespues: string | null;
  cambiaFecha: boolean;
  cambiaValor: boolean;
}

const presentar = (cambios: CambioDeCuota[]) =>
  cambios.map((c) => ({
    cuotaId: c.cuotaId,
    numero: c.numero,
    antes: c.fechaAntes,
    despues: c.fechaDespues,
    valorAntes: c.valorAntes.toString(),
    valorDespues: c.valorDespues.toString(),
  }));
const paraAuditoria = (cambios: CambioDeCuota[], lado: 'antes' | 'despues') =>
  cambios.map((c) => ({
    numero: c.numero,
    fecha: formatearFechaISO(lado === 'antes' ? c.fechaAntes : c.fechaDespues),
    valor: (lado === 'antes' ? c.valorAntes : c.valorDespues).toString(),
  }));

// Une los cambios de fecha y de valor de una misma cuota.
function combinar(fechas: CambioDeFecha[], valores: CambioDeValor[], cuotas: (CuotaConValor & { fechaVencimiento: Date })[]): CambioDeCuota[] {
  const porId = new Map<string, CambioDeCuota>();
  const cuotaDe = (id: string) => cuotas.find((c) => c.id === id)!;
  const crear = (id: string, numero: number): CambioDeCuota => {
    const c = cuotaDe(id);
    return {
      cuotaId: id,
      numero,
      fechaAntes: c.fechaVencimiento,
      fechaDespues: c.fechaVencimiento,
      valorAntes: c.valor,
      valorDespues: c.valor,
      estadoDespues: null,
      cambiaFecha: false,
      cambiaValor: false,
    };
  };
  for (const f of fechas) {
    const c = porId.get(f.cuotaId) ?? crear(f.cuotaId, f.numero);
    c.fechaDespues = f.despues;
    c.cambiaFecha = true;
    porId.set(f.cuotaId, c);
  }
  for (const v of valores) {
    const c = porId.get(v.cuotaId) ?? crear(v.cuotaId, v.numero);
    c.valorDespues = v.despues;
    c.estadoDespues = v.estadoDespues;
    c.cambiaValor = true;
    porId.set(v.cuotaId, c);
  }
  return [...porId.values()].sort((a, b) => a.numero - b.numero);
}

// Ajustar el plan de pagos de una venta ya registrada (CC-08): las FECHAS y/o los VALORES de las cuotas que todavía no están
// pagadas. El total del plan no cambia (lo que se baja en una cuota se sube en otra), una cuota pagada no se toca y una con pagos
// parciales no puede quedar por debajo de lo pagado. Queda en la auditoría con su motivo, y a las cuotas que cambian se les libera
// el recordatorio para que el cliente reciba el de su nueva fecha o valor.
@Injectable()
export class AjustarPlanService {
  constructor(private readonly prisma: PrismaService) {}

  async ajustar(ventaId: string, dto: AjustarPlanDto, usuario: UsuarioAutenticado) {
    const visible = await this.prisma.venta.findFirst({ where: { id: ventaId, AND: [filtroVenta(usuario)] }, select: { id: true } });
    if (!visible) throw new NotFoundException(`No existe la venta ${ventaId}`);
    const motivo = dto.motivo.trim();
    if (motivo.length < 10) throw new BadRequestException('Explica el ajuste con al menos 10 caracteres');
    const pideFechas = Boolean(dto.fechaCuotaInicial || dto.fechaPrimeraCuotaPendiente || dto.fechasCuotas?.length);
    const pideValores = Boolean(dto.valoresCuotas?.length);
    if (!pideFechas && !pideValores) throw new BadRequestException('Indica qué se ajusta: las fechas, los valores o los dos');

    return this.prisma.$transaction(async (tx) => {
      // Se bloquea la venta: dos ajustes (o un abono) a la vez esperan su turno.
      await tx.$queryRaw`SELECT "id" FROM "Venta" WHERE "id" = ${ventaId} FOR UPDATE`;
      const venta = await tx.venta.findUnique({ where: { id: ventaId }, select: { estado: true, formaPago: true } });
      if (!venta) throw new NotFoundException(`No existe la venta ${ventaId}`);
      if (venta.estado !== EstadoVenta.ACTIVA) throw new ConflictException('Solo se ajusta el plan de una venta activa');
      if (venta.formaPago !== FormaPago.FINANCIADO) throw new ConflictException('Solo una venta financiada tiene plan de cuotas');

      const filas = await tx.cuota.findMany({
        where: { ventaId },
        orderBy: { numero: 'asc' },
        select: {
          id: true,
          numero: true,
          fechaVencimiento: true,
          valor: true,
          estado: true,
          aplicaciones: { where: { abono: { estado: EstadoAbono.ACTIVO } }, select: { valor: true } },
        },
      });
      const cuotas = filas.map((c) => ({
        id: c.id,
        numero: c.numero,
        fechaVencimiento: c.fechaVencimiento,
        estado: c.estado,
        valor: c.valor,
        pagado: c.aplicaciones.reduce((suma, a) => suma.plus(a.valor), new Prisma.Decimal(0)),
      }));

      let cambios: CambioDeCuota[];
      try {
        const cambiosFecha = pideFechas
          ? calcularReprogramacion(
              cuotas,
              {
                fechaCuotaInicial: dto.fechaCuotaInicial ? parsearFechaLocal(dto.fechaCuotaInicial) : null,
                fechaPrimeraCuotaPendiente: dto.fechaPrimeraCuotaPendiente ? parsearFechaLocal(dto.fechaPrimeraCuotaPendiente) : null,
                fechasPorCuota: dto.fechasCuotas?.map((f) => ({ numero: f.numero, fecha: parsearFechaLocal(f.fecha) })) ?? null,
              },
              { permitirSinCambios: pideValores },
            )
          : [];
        const cambiosValor = pideValores ? calcularCambiosDeValor(cuotas, dto.valoresCuotas!.map((v) => ({ numero: v.numero, valor: new Prisma.Decimal(v.valor) }))) : [];
        cambios = combinar(cambiosFecha, cambiosValor, cuotas);
        if (cambios.length === 0) throw new ReprogramacionInvalida('Esos valores ya son los del plan: no hay nada que cambiar');
      } catch (error) {
        if (error instanceof ReprogramacionInvalida || error instanceof ValoresInvalidos) throw new BadRequestException(error.message);
        throw error;
      }

      const totalCuotas = cuotas.reduce((suma, c) => suma.plus(c.valor), new Prisma.Decimal(0)).toString();
      if (dto.soloVistaPrevia) return { guardado: false, totalCuotas, cambios: presentar(cambios) };

      for (const cambio of cambios) {
        await tx.cuota.update({
          where: { id: cambio.cuotaId },
          data: {
            ...(cambio.cambiaFecha ? { fechaVencimiento: cambio.fechaDespues } : {}),
            ...(cambio.cambiaValor ? { valor: cambio.valorDespues, estado: cambio.estadoDespues as never } : {}),
            recordatorioEnviadoEn: null,
          },
        });
        if (cambio.numero === 0) {
          // La cuota inicial de la venta tiene que coincidir con la cuota 0 del plan.
          await tx.venta.update({
            where: { id: ventaId },
            data: { ...(cambio.cambiaFecha ? { fechaCuotaInicial: cambio.fechaDespues } : {}), ...(cambio.cambiaValor ? { cuotaInicial: cambio.valorDespues } : {}) },
          });
        }
      }
      const nFechas = cambios.filter((c) => c.cambiaFecha).length;
      const nValores = cambios.filter((c) => c.cambiaValor).length;
      const partes = [nFechas > 0 ? `fechas de ${nFechas}` : '', nValores > 0 ? `valores de ${nValores}` : ''].filter(Boolean).join(' y ');
      await registrarAuditoria(tx, {
        usuario,
        accion: 'VENTA_AJUSTAR_PLAN',
        entidad: 'VENTA',
        entidadId: ventaId,
        resumen: `Ajustó el plan de pagos (${partes} cuota${nFechas + nValores === 1 ? '' : 's'}): ${motivo}`,
        antes: { cuotas: paraAuditoria(cambios, 'antes'), totalCuotas },
        despues: { cuotas: paraAuditoria(cambios, 'despues'), totalCuotas, motivo },
      });
      return { guardado: true, totalCuotas, cambios: presentar(cambios) };
    });
  }
}
