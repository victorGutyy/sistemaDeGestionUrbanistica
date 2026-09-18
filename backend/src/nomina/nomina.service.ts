import { Injectable, NotFoundException } from '@nestjs/common';
import { parsearFechaLocal } from '../common/fecha.util.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { calcularValorPagado } from './calculo-pago.js';
import { CrearPagoNominaDto } from './dto/crear-pago-nomina.dto.js';

@Injectable()
export class NominaService {
  constructor(private readonly prisma: PrismaService) {}

  async crearPago(dto: CrearPagoNominaDto) {
    const trabajador = await this.prisma.trabajador.findUnique({ where: { id: dto.trabajadorId } });
    if (!trabajador) {
      throw new NotFoundException(`No existe el trabajador ${dto.trabajadorId}`);
    }

    const novedades = (dto.novedades ?? []).map((novedad) => ({
      tipo: novedad.tipo,
      valor: new Prisma.Decimal(novedad.valor),
      descripcion: novedad.descripcion,
    }));

    const valorPagado = calcularValorPagado(trabajador.salarioBase, novedades);

    return this.prisma.pagoNomina.create({
      data: {
        trabajadorId: dto.trabajadorId,
        periodoInicio: parsearFechaLocal(dto.periodoInicio),
        periodoFin: parsearFechaLocal(dto.periodoFin),
        fechaPago: parsearFechaLocal(dto.fechaPago),
        salarioBase: trabajador.salarioBase,
        valorPagado,
        novedades: { create: novedades },
      },
      include: { novedades: true, trabajador: true },
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
