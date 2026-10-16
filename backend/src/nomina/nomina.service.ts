import { Injectable, NotFoundException } from '@nestjs/common';
import { validarCuentaDestino } from '../abonos/validar-pago.js';
import { exigirFechaAbiertaEnTx } from '../cierres-caja/fecha-abierta.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { parsearFechaLocal } from '../common/fecha.util.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { calcularValorPagado } from './calculo-pago.js';
import { CrearPagoNominaDto } from './dto/crear-pago-nomina.dto.js';

@Injectable()
export class NominaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracion: ConfiguracionService,
  ) {}

  async crearPago(dto: CrearPagoNominaDto) {
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
      return tx.pagoNomina.create({
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
    });
  }

  listarPagos(trabajadorId?: string) {
    return this.prisma.pagoNomina.findMany({
      where: { trabajadorId },
      include: { novedades: true, trabajador: true },
      orderBy: { fechaPago: 'desc' },
    });
  }
}
