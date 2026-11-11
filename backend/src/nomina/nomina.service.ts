import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { validarCuentaDestino } from '../abonos/validar-pago.js';
import { registrarAuditoria } from '../auditoria/auditoria.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { formatearCOP } from '../common/formato.util.js';
import { exigirFechaAbiertaEnTx } from '../cierres-caja/fecha-abierta.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { parsearFechaLocal } from '../common/fecha.util.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { calcularValorPagado } from './calculo-pago.js';
import { CrearPagoNominaDto } from './dto/crear-pago-nomina.dto.js';
import type { LiquidarQuincenaDto } from './dto/liquidar-quincena.dto.js';
import { liquidarQuincenaEnTx, prepararLiquidacion } from './liquidar-quincena.js';

@Injectable()
export class NominaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracion: ConfiguracionService,
  ) {}

  async crearPago(dto: CrearPagoNominaDto, usuario: UsuarioAutenticado) {
    const trabajador = await this.prisma.trabajador.findUnique({ where: { id: dto.trabajadorId } });
    if (!trabajador) {
      throw new NotFoundException(`No existe el trabajador ${dto.trabajadorId}`);
    }

    // El medio y la cuenta de salida quedan registrados: el cierre de caja necesita saber cuánto salió en efectivo.
    await this.configuracion.exigirMedioPagoActivo(dto.medioPago);
    const cuentaId = await validarCuentaDestino(this.prisma, dto.medioPago, dto.cuentaId, 'de donde salió el dinero');

    const novedades = (dto.novedades ?? []).map((novedad) => ({
      tipo: novedad.tipo,
      valor: new Prisma.Decimal(novedad.valor),
      descripcion: novedad.descripcion,
    }));

    const valorPagado = calcularValorPagado(trabajador.salarioBase, novedades);

    const fechaPago = parsearFechaLocal(dto.fechaPago);
    return this.prisma.$transaction(async (tx) => {
      // Un día que ya pertenece a un cierre de caja cerrado o aprobado no admite pagos nuevos.
      await exigirFechaAbiertaEnTx(tx, fechaPago);
      const pago = await tx.pagoNomina.create({
        data: {
          trabajadorId: dto.trabajadorId,
          periodoInicio: parsearFechaLocal(dto.periodoInicio),
          periodoFin: parsearFechaLocal(dto.periodoFin),
          fechaPago,
          salarioBase: trabajador.salarioBase,
          valorPagado,
          medioPago: dto.medioPago,
          cuentaId,
          novedades: { create: novedades },
        },
        include: { novedades: true, trabajador: true },
      });
      await registrarAuditoria(tx, {
        usuario,
        accion: 'NOMINA_REGISTRAR_PAGO',
        entidad: 'NOMINA',
        entidadId: pago.id,
        resumen: `Registró un pago de nómina de ${formatearCOP(valorPagado)} a ${trabajador.nombre}`,
        despues: {
          trabajadorId: dto.trabajadorId,
          periodoInicio: dto.periodoInicio,
          periodoFin: dto.periodoFin,
          fechaPago: dto.fechaPago,
          salarioBase: trabajador.salarioBase,
          valorPagado,
          medioPago: dto.medioPago,
          cuentaId,
          novedades: novedades.map((novedad) => ({ tipo: novedad.tipo, valor: novedad.valor, descripcion: novedad.descripcion })),
        },
      });
      return pago;
    });
  }

  // CC-05: los pagos de una obra durante una quincena, en una sola operación (o se guardan todos o ninguno).
  async liquidarQuincena(dto: LiquidarQuincenaDto, usuario: UsuarioAutenticado) {
    // El medio y la cuenta de salida quedan registrados: el cierre de caja necesita saber cuánto salió en efectivo.
    await this.configuracion.exigirMedioPagoActivo(dto.medioPago);
    const cuentaId = await validarCuentaDestino(this.prisma, dto.medioPago, dto.cuentaId, 'de donde salió el dinero');
    const liquidacion = prepararLiquidacion(dto, cuentaId);
    return this.prisma.$transaction((tx) => liquidarQuincenaEnTx(tx, liquidacion, usuario));
  }

  listarPagos(filtros: { trabajadorId?: string; proyectoId?: string; periodoInicio?: string; periodoFin?: string } = {}) {
    const formato = /^\d{4}-\d{2}-\d{2}$/;
    for (const [campo, valor] of [['periodoInicio', filtros.periodoInicio], ['periodoFin', filtros.periodoFin]] as const) {
      if (valor !== undefined && !formato.test(valor)) throw new BadRequestException(`${campo} debe tener el formato YYYY-MM-DD`);
    }
    return this.prisma.pagoNomina.findMany({
      where: {
        trabajadorId: filtros.trabajadorId,
        proyectoId: filtros.proyectoId,
        periodoInicio: filtros.periodoInicio ? parsearFechaLocal(filtros.periodoInicio) : undefined,
        periodoFin: filtros.periodoFin ? parsearFechaLocal(filtros.periodoFin) : undefined,
      },
      include: { novedades: true, trabajador: true, proyecto: { select: { id: true, nombre: true } } },
      orderBy: { fechaPago: 'desc' },
    });
  }
}
