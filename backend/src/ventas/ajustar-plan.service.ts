import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { registrarAuditoria } from '../auditoria/auditoria.js';
import { filtroVenta } from '../auth/alcance.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { formatearFechaISO, parsearFechaLocal } from '../common/fecha.util.js';
import { EstadoVenta, FormaPago } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { calcularReprogramacion, ReprogramacionInvalida, type CambioDeFecha } from './ajustar-plan.js';
import { AjustarPlanDto } from './dto/ajustar-plan.dto.js';

const presentar = (cambios: CambioDeFecha[]) => cambios.map((c) => ({ cuotaId: c.cuotaId, numero: c.numero, antes: c.antes, despues: c.despues }));
const paraAuditoria = (cambios: CambioDeFecha[], lado: 'antes' | 'despues') => cambios.map((c) => ({ numero: c.numero, fecha: formatearFechaISO(c[lado]) }));

// Ajustar el plan de pagos de una venta ya registrada (CC-08): solo se reprograman FECHAS de cuotas que todavía no están
// pagadas. Los valores, lo pagado y el total de la venta no cambian. Queda en la auditoría con su motivo, y a las cuotas que
// cambian de fecha se les libera el recordatorio para que el cliente reciba el de su nueva fecha.
@Injectable()
export class AjustarPlanService {
  constructor(private readonly prisma: PrismaService) {}

  async ajustar(ventaId: string, dto: AjustarPlanDto, usuario: UsuarioAutenticado) {
    const visible = await this.prisma.venta.findFirst({ where: { id: ventaId, AND: [filtroVenta(usuario)] }, select: { id: true } });
    if (!visible) throw new NotFoundException(`No existe la venta ${ventaId}`);
    const motivo = dto.motivo.trim();
    if (motivo.length < 10) throw new BadRequestException('Explica el ajuste con al menos 10 caracteres');

    return this.prisma.$transaction(async (tx) => {
      // Se bloquea la venta: dos ajustes (o un abono) a la vez esperan su turno.
      await tx.$queryRaw`SELECT "id" FROM "Venta" WHERE "id" = ${ventaId} FOR UPDATE`;
      const venta = await tx.venta.findUnique({ where: { id: ventaId }, select: { estado: true, formaPago: true } });
      if (!venta) throw new NotFoundException(`No existe la venta ${ventaId}`);
      if (venta.estado !== EstadoVenta.ACTIVA) throw new ConflictException('Solo se ajusta el plan de una venta activa');
      if (venta.formaPago !== FormaPago.FINANCIADO) throw new ConflictException('Solo una venta financiada tiene plan de cuotas');

      const cuotas = await tx.cuota.findMany({ where: { ventaId }, orderBy: { numero: 'asc' }, select: { id: true, numero: true, fechaVencimiento: true, estado: true } });
      let cambios: CambioDeFecha[];
      try {
        cambios = calcularReprogramacion(cuotas, {
          fechaCuotaInicial: dto.fechaCuotaInicial ? parsearFechaLocal(dto.fechaCuotaInicial) : null,
          fechaPrimeraCuotaPendiente: dto.fechaPrimeraCuotaPendiente ? parsearFechaLocal(dto.fechaPrimeraCuotaPendiente) : null,
          fechasPorCuota: dto.fechasCuotas?.map((f) => ({ numero: f.numero, fecha: parsearFechaLocal(f.fecha) })) ?? null,
        });
      } catch (error) {
        if (error instanceof ReprogramacionInvalida) throw new BadRequestException(error.message);
        throw error;
      }

      if (dto.soloVistaPrevia) return { guardado: false, cambios: presentar(cambios) };

      for (const cambio of cambios) {
        await tx.cuota.update({ where: { id: cambio.cuotaId }, data: { fechaVencimiento: cambio.despues, recordatorioEnviadoEn: null } });
        if (cambio.numero === 0) await tx.venta.update({ where: { id: ventaId }, data: { fechaCuotaInicial: cambio.despues } });
      }
      await registrarAuditoria(tx, {
        usuario,
        accion: 'VENTA_AJUSTAR_PLAN',
        entidad: 'VENTA',
        entidadId: ventaId,
        resumen: `Ajustó las fechas del plan de pagos (${cambios.length} cuota${cambios.length === 1 ? '' : 's'}): ${motivo}`,
        antes: { fechas: paraAuditoria(cambios, 'antes') },
        despues: { fechas: paraAuditoria(cambios, 'despues'), motivo },
      });
      return { guardado: true, cambios: presentar(cambios) };
    });
  }
}
