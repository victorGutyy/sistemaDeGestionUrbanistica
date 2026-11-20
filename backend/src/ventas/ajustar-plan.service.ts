import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { registrarAuditoria } from '../auditoria/auditoria.js';
import { filtroVenta } from '../auth/alcance.js';
import { PERMISOS } from '../auth/permisos.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { formatearFechaISO, parsearFechaLocal } from '../common/fecha.util.js';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoAbono, EstadoCuota, EstadoVenta, FormaPago } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AmpliacionInvalida, calcularCuotasNuevas } from './ampliar-plan.js';
import { calcularReprogramacion, ReprogramacionInvalida, type CambioDeFecha } from './ajustar-plan.js';
import { calcularCambiosDeValor, ValoresInvalidos, type CambioDeValor, type CuotaConValor } from './ajustar-valores.js';
import { AjustarPlanDto } from './dto/ajustar-plan.dto.js';

// El cambio de una cuota, con su fecha y su valor (iguales antes y después si ese dato no cambia). Una cuota NUEVA (al ampliar el
// plazo) no existía: su valor de antes es 0 y su fecha es la de su creación.
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
  nueva: boolean;
}

type CuotaDelAjuste = CuotaConValor & { fechaVencimiento: Date };

const presentar = (cambios: CambioDeCuota[]) =>
  cambios.map((c) => ({
    cuotaId: c.cuotaId,
    numero: c.numero,
    antes: c.fechaAntes,
    despues: c.fechaDespues,
    valorAntes: c.valorAntes.toString(),
    valorDespues: c.valorDespues.toString(),
    nueva: c.nueva,
  }));
const paraAuditoria = (cambios: CambioDeCuota[], lado: 'antes' | 'despues') =>
  cambios
    .filter((c) => lado === 'despues' || !c.nueva)
    .map((c) => ({
      numero: c.numero,
      fecha: formatearFechaISO(lado === 'antes' ? c.fechaAntes : c.fechaDespues),
      valor: (lado === 'antes' ? c.valorAntes : c.valorDespues).toString(),
      ...(c.nueva ? { nueva: true } : {}),
    }));

// Une los cambios de fecha y de valor de una misma cuota (y las cuotas nuevas, que solo traen valor).
function combinar(fechas: CambioDeFecha[], valores: CambioDeValor[], cuotas: CuotaDelAjuste[], idsNuevas: Set<string>): CambioDeCuota[] {
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
      nueva: idsNuevas.has(id),
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
// pagadas, y AMPLIAR el plazo agregando cuotas al final. El total del plan no cambia (lo que se baja en una cuota se sube en otra),
// una cuota pagada no se toca y una con pagos parciales no puede quedar por debajo de lo pagado. Queda en la auditoría con su motivo,
// y a las cuotas que cambian se les libera el recordatorio para que el cliente reciba el de su nueva fecha o valor.
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
    const pideAmpliar = dto.numeroCuotas !== undefined;
    if (!pideFechas && !pideValores && !pideAmpliar) throw new BadRequestException('Indica qué se ajusta: las fechas, los valores, el número de cuotas o varias cosas');
    if (pideAmpliar && !pideValores) {
      throw new BadRequestException('Para ampliar el plazo indica el valor de las cuotas: lo que falta por pagar se reparte entre las cuotas que quedan');
    }

    // Pasar del plazo máximo configurado es una excepción, igual que al registrar la venta: exige un permiso propio (el gerente lo tiene
    // siempre; el administrador, de forma temporal durante la migración desde Excel). Cuando se usa, la auditoría lo deja anotado.
    let plazoMaximo: number | undefined;
    let superaPlazoMaximo = false;
    if (pideAmpliar) {
      const empresa = await this.prisma.configuracionEmpresa.findUnique({ where: { id: 1 }, select: { plazoMaximoMeses: true } });
      plazoMaximo = empresa?.plazoMaximoMeses;
      superaPlazoMaximo = plazoMaximo !== undefined && dto.numeroCuotas! > plazoMaximo;
      if (superaPlazoMaximo && !usuario.permisos.includes(PERMISOS.VENTAS_EXCEDER_PLAZO)) {
        throw new ForbiddenException(`Un plazo de ${dto.numeroCuotas} cuotas supera el máximo configurado (${plazoMaximo}): ampliarlo por encima del máximo lo autoriza el gerente`);
      }
    }

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
      const cuotas: CuotaDelAjuste[] = filas.map((c) => ({
        id: c.id,
        numero: c.numero,
        fechaVencimiento: c.fechaVencimiento,
        estado: c.estado,
        valor: c.valor,
        pagado: c.aplicaciones.reduce((suma, a) => suma.plus(a.valor), new Prisma.Decimal(0)),
      }));
      const cuotasActuales = Math.max(0, ...cuotas.filter((c) => c.numero >= 1).map((c) => c.numero));

      // Con la ampliación, las fechas de números mayores a los actuales son de las cuotas nuevas; las demás, de las existentes.
      const fechasElegidas = dto.fechasCuotas ?? [];
      const fechasExistentes = pideAmpliar ? fechasElegidas.filter((f) => f.numero <= cuotasActuales) : fechasElegidas;
      const fechasNuevas = pideAmpliar ? fechasElegidas.filter((f) => f.numero > cuotasActuales) : [];
      const pideFechasExistentes = Boolean(dto.fechaCuotaInicial || dto.fechaPrimeraCuotaPendiente || fechasExistentes.length);

      let cambios: CambioDeCuota[];
      let virtuales: CuotaDelAjuste[] = [];
      try {
        const cambiosFecha = pideFechasExistentes
          ? calcularReprogramacion(
              cuotas,
              {
                fechaCuotaInicial: dto.fechaCuotaInicial ? parsearFechaLocal(dto.fechaCuotaInicial) : null,
                fechaPrimeraCuotaPendiente: dto.fechaPrimeraCuotaPendiente ? parsearFechaLocal(dto.fechaPrimeraCuotaPendiente) : null,
                fechasPorCuota: fechasExistentes.length ? fechasExistentes.map((f) => ({ numero: f.numero, fecha: parsearFechaLocal(f.fecha) })) : null,
              },
              { permitirSinCambios: pideValores || pideAmpliar },
            )
          : [];

        const pedidos = (dto.valoresCuotas ?? []).map((v) => ({ numero: v.numero, valor: new Prisma.Decimal(v.valor) }));
        if (pideAmpliar) {
          // Las cuotas nuevas siguen a la última existente, ya con sus cambios de fecha aplicados.
          const fechaFinal = new Map(cuotas.map((c) => [c.numero, c.fechaVencimiento]));
          for (const cambio of cambiosFecha) fechaFinal.set(cambio.numero, cambio.despues);
          const nuevas = calcularCuotasNuevas(
            cuotas.filter((c) => c.numero >= 1).map((c) => ({ numero: c.numero, fechaVencimiento: fechaFinal.get(c.numero)! })),
            dto.numeroCuotas!,
            fechasNuevas.map((f) => ({ numero: f.numero, fecha: parsearFechaLocal(f.fecha) })),
          );
          // Una cuota nueva nace con valor 0 y el valor que se pide entra por el mismo control de total fijo de las demás.
          virtuales = nuevas.map((n) => ({
            id: `nueva-${n.numero}`,
            numero: n.numero,
            fechaVencimiento: n.fecha,
            estado: EstadoCuota.PENDIENTE,
            valor: new Prisma.Decimal(0),
            pagado: new Prisma.Decimal(0),
          }));
          for (const nueva of virtuales) {
            if (!pedidos.some((p) => p.numero === nueva.numero)) throw new AmpliacionInvalida(`Indica el valor de la cuota ${nueva.numero}, que es nueva`);
          }
        }

        const cuotasConNuevas = [...cuotas, ...virtuales];
        const cambiosValor = pideValores ? calcularCambiosDeValor(cuotasConNuevas, pedidos) : [];
        cambios = combinar(cambiosFecha, cambiosValor, cuotasConNuevas, new Set(virtuales.map((v) => v.id)));
        if (cambios.length === 0) throw new ReprogramacionInvalida('Esos valores ya son los del plan: no hay nada que cambiar');
      } catch (error) {
        if (error instanceof ReprogramacionInvalida || error instanceof ValoresInvalidos || error instanceof AmpliacionInvalida) throw new BadRequestException(error.message);
        throw error;
      }

      const totalCuotas = cuotas.reduce((suma, c) => suma.plus(c.valor), new Prisma.Decimal(0)).toString();
      const numeroCuotasDespues = pideAmpliar ? dto.numeroCuotas! : cuotasActuales;
      if (dto.soloVistaPrevia) return { guardado: false, totalCuotas, numeroCuotasAntes: cuotasActuales, numeroCuotasDespues, cambios: presentar(cambios) };

      for (const cambio of cambios) {
        if (cambio.nueva) {
          await tx.cuota.create({
            data: { ventaId, numero: cambio.numero, fechaVencimiento: cambio.fechaDespues, valor: cambio.valorDespues, estado: EstadoCuota.PENDIENTE },
          });
          continue;
        }
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
      // El "financiada en N cuotas" de la venta sigue al plan.
      if (pideAmpliar) await tx.venta.update({ where: { id: ventaId }, data: { numeroCuotas: numeroCuotasDespues } });

      const nFechas = cambios.filter((c) => c.cambiaFecha).length;
      const nValores = cambios.filter((c) => c.cambiaValor && !c.nueva).length;
      const nNuevas = cambios.filter((c) => c.nueva).length;
      const partes = [
        nFechas > 0 ? `fechas de ${nFechas}` : '',
        nValores > 0 ? `valores de ${nValores}` : '',
        nNuevas > 0 ? `plazo de ${cuotasActuales} a ${numeroCuotasDespues} cuotas (${nNuevas} nueva${nNuevas === 1 ? '' : 's'})` : '',
      ]
        .filter(Boolean)
        .join(' y ');
      await registrarAuditoria(tx, {
        usuario,
        accion: 'VENTA_AJUSTAR_PLAN',
        entidad: 'VENTA',
        entidadId: ventaId,
        resumen: `Ajustó el plan de pagos (${partes})${superaPlazoMaximo ? ` — supera el plazo máximo de ${plazoMaximo} cuotas` : ''}: ${motivo}`,
        antes: { numeroCuotas: cuotasActuales, cuotas: paraAuditoria(cambios, 'antes'), totalCuotas },
        despues: {
          numeroCuotas: numeroCuotasDespues,
          cuotas: paraAuditoria(cambios, 'despues'),
          totalCuotas,
          motivo,
          ...(superaPlazoMaximo ? { superaPlazoMaximo: true, plazoMaximo } : {}),
        },
      });
      return { guardado: true, totalCuotas, numeroCuotasAntes: cuotasActuales, numeroCuotasDespues, cambios: presentar(cambios) };
    });
  }
}
