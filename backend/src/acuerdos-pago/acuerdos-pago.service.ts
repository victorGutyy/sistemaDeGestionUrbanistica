import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { registrarAuditoria, soloCampos } from '../auditoria/auditoria.js';
import { filtroVenta } from '../auth/alcance.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { estadoDelAcuerdo, periodoDelAcuerdo, periodosSeMontan } from '../cartera/acuerdos-pago.js';
import { parsearFechaLocal } from '../common/fecha.util.js';
import type { Prisma } from '../generated/prisma/client.js';
import { EstadoVenta, FormaPago } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CrearAcuerdoPagoDto, FinalizarAcuerdoPagoDto } from './dto/acuerdo-pago.dto.js';

const INCLUIR_ACUERDO = {
  creadoPor: { select: { nombre: true } },
  finalizadoPor: { select: { nombre: true } },
} satisfies Prisma.AcuerdoPagoInclude;

type AcuerdoConAutores = Prisma.AcuerdoPagoGetPayload<{ include: typeof INCLUIR_ACUERDO }>;

const CAMPOS_AUDITADOS = ['ventaId', 'motivo', 'desde', 'hastaPrevista', 'finalizadoEn', 'motivoFin'] as const;

function diaDe(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
}

export function presentarAcuerdo(acuerdo: AcuerdoConAutores, hoy: Date) {
  return { ...acuerdo, estado: estadoDelAcuerdo(acuerdo, hoy) };
}

// Acuerdos de pago de una venta (CC-07). Mientras uno está vigente se pausan los recordatorios y los avisos de mora y
// no se causa interés de mora. No se borran: se finalizan, y quedan como historial. Cada cambio queda en la auditoría.
@Injectable()
export class AcuerdosPagoService {
  constructor(private readonly prisma: PrismaService) {}

  private async verificarVenta(ventaId: string, usuario: UsuarioAutenticado) {
    const venta = await this.prisma.venta.findFirst({ where: { id: ventaId, AND: [filtroVenta(usuario)] }, select: { id: true } });
    if (!venta) throw new NotFoundException(`No existe la venta ${ventaId}`);
  }

  async listar(ventaId: string, usuario: UsuarioAutenticado) {
    await this.verificarVenta(ventaId, usuario);
    const hoy = new Date();
    const acuerdos = await this.prisma.acuerdoPago.findMany({
      where: { ventaId },
      include: INCLUIR_ACUERDO,
      orderBy: [{ desde: 'desc' }, { createdAt: 'desc' }],
    });
    return acuerdos.map((acuerdo) => presentarAcuerdo(acuerdo, hoy));
  }

  async crear(ventaId: string, dto: CrearAcuerdoPagoDto, usuario: UsuarioAutenticado) {
    await this.verificarVenta(ventaId, usuario);
    const hoy = new Date();
    const desde = dto.desde ? parsearFechaLocal(dto.desde) : diaDe(hoy);
    const hasta = dto.hasta ? parsearFechaLocal(dto.hasta) : null;
    if (hasta && hasta.getTime() < desde.getTime()) {
      throw new BadRequestException('La fecha final no puede ser anterior a la inicial');
    }
    const motivo = dto.motivo.trim();
    if (motivo.length < 10) throw new BadRequestException('Explica el acuerdo con al menos 10 caracteres');

    const creado = await this.prisma.$transaction(async (tx) => {
      // Se bloquea la venta: dos personas que crean un acuerdo a la vez no pueden montarse uno sobre otro.
      await tx.$queryRaw`SELECT "id" FROM "Venta" WHERE "id" = ${ventaId} FOR UPDATE`;
      const venta = await tx.venta.findUnique({ where: { id: ventaId }, select: { estado: true, formaPago: true } });
      if (!venta) throw new NotFoundException(`No existe la venta ${ventaId}`);
      if (venta.estado !== EstadoVenta.ACTIVA) throw new ConflictException('Solo una venta activa puede tener un acuerdo de pago');
      if (venta.formaPago !== FormaPago.FINANCIADO) {
        throw new ConflictException('Solo una venta financiada tiene cuotas: no necesita un acuerdo de pago');
      }

      const nuevo = periodoDelAcuerdo({ desde, hastaPrevista: hasta, finalizadoEn: null });
      const existentes = await tx.acuerdoPago.findMany({ where: { ventaId } });
      const choque = existentes.find((existente) => periodosSeMontan(periodoDelAcuerdo(existente), nuevo));
      if (choque) {
        throw new ConflictException('La venta ya tiene un acuerdo de pago en esas fechas: finalízalo antes de registrar otro');
      }

      const acuerdo = await tx.acuerdoPago.create({
        data: { ventaId, motivo, desde, hastaPrevista: hasta, creadoPorId: usuario.id },
        include: INCLUIR_ACUERDO,
      });
      await registrarAuditoria(tx, {
        usuario,
        accion: 'ACUERDO_PAGO_CREAR',
        entidad: 'ACUERDO_PAGO',
        entidadId: acuerdo.id,
        resumen: 'Registró un acuerdo de pago: se pausan los avisos y no se causa interés de mora',
        despues: soloCampos(acuerdo, CAMPOS_AUDITADOS),
      });
      return acuerdo;
    });
    return presentarAcuerdo(creado, hoy);
  }

  // Finalizar: desde hoy se reanudan los avisos y el interés vuelve a contarse (sin efecto retroactivo). Un acuerdo que
  // todavía no empezó queda sin efecto.
  async finalizar(ventaId: string, acuerdoId: string, dto: FinalizarAcuerdoPagoDto, usuario: UsuarioAutenticado) {
    await this.verificarVenta(ventaId, usuario);
    const hoy = new Date();

    const actualizado = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Venta" WHERE "id" = ${ventaId} FOR UPDATE`;
      const actual = await tx.acuerdoPago.findFirst({ where: { id: acuerdoId, ventaId } });
      if (!actual) throw new NotFoundException(`No existe el acuerdo ${acuerdoId}`);
      if (estadoDelAcuerdo(actual, hoy) === 'FINALIZADO') throw new ConflictException('El acuerdo ya terminó');

      const finalizadoEn = diaDe(hoy).getTime() < diaDe(actual.desde).getTime() ? diaDe(actual.desde) : diaDe(hoy);
      const acuerdo = await tx.acuerdoPago.update({
        where: { id: actual.id },
        data: { finalizadoEn, motivoFin: dto.motivo?.trim() || null, finalizadoPorId: usuario.id },
        include: INCLUIR_ACUERDO,
      });
      await registrarAuditoria(tx, {
        usuario,
        accion: 'ACUERDO_PAGO_FINALIZAR',
        entidad: 'ACUERDO_PAGO',
        entidadId: acuerdo.id,
        resumen: 'Finalizó un acuerdo de pago: se reanudan los avisos y el interés',
        antes: soloCampos(actual, CAMPOS_AUDITADOS),
        despues: soloCampos(acuerdo, CAMPOS_AUDITADOS),
      });
      return acuerdo;
    });
    return presentarAcuerdo(actualizado, hoy);
  }
}
