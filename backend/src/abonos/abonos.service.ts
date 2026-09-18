import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { parsearFechaLocal } from '../common/fecha.util.js';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoCuota } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { CrearAbonoDto } from './dto/crear-abono.dto.js';

function detectarContentType(rutaRelativa: string): string {
  const ruta = rutaRelativa.toLowerCase();
  if (ruta.endsWith('.pdf')) return 'application/pdf';
  if (ruta.endsWith('.png')) return 'image/png';
  return 'image/jpeg';
}

@Injectable()
export class AbonosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async crear(dto: CrearAbonoDto, comprobante?: Express.Multer.File) {
    const venta = await this.prisma.venta.findUnique({ where: { id: dto.ventaId } });
    if (!venta) {
      throw new NotFoundException(`No existe la venta ${dto.ventaId}`);
    }

    if (dto.cuotaId) {
      const cuota = await this.prisma.cuota.findUnique({ where: { id: dto.cuotaId } });
      if (!cuota || cuota.ventaId !== dto.ventaId) {
        throw new BadRequestException(`La cuota ${dto.cuotaId} no pertenece a la venta ${dto.ventaId}`);
      }
    }

    let comprobanteUrl: string | undefined;
    if (comprobante) {
      const { rutaRelativa } = await this.storage.guardar(
        `${venta.clienteId}/${venta.id}`,
        comprobante.originalname,
        comprobante.buffer,
      );
      comprobanteUrl = rutaRelativa;
    }

    return this.prisma.$transaction(async (tx) => {
      const abono = await tx.abono.create({
        data: {
          ventaId: dto.ventaId,
          cuotaId: dto.cuotaId,
          fecha: parsearFechaLocal(dto.fecha),
          valor: new Prisma.Decimal(dto.valor),
          medioPago: dto.medioPago,
          comprobanteUrl,
        },
      });

      if (dto.cuotaId) {
        await this.actualizarEstadoCuota(tx, dto.cuotaId);
      }

      return abono;
    });
  }

  private async actualizarEstadoCuota(tx: Prisma.TransactionClient, cuotaId: string) {
    const cuota = await tx.cuota.findUniqueOrThrow({ where: { id: cuotaId } });
    const abonos = await tx.abono.findMany({ where: { cuotaId } });
    const totalAbonado = abonos.reduce((acumulado, abono) => acumulado.plus(abono.valor), new Prisma.Decimal(0));

    const nuevoEstado = totalAbonado.greaterThanOrEqualTo(cuota.valor)
      ? EstadoCuota.PAGADA
      : totalAbonado.greaterThan(0)
        ? EstadoCuota.PARCIAL
        : EstadoCuota.PENDIENTE;

    if (nuevoEstado !== cuota.estado) {
      await tx.cuota.update({ where: { id: cuotaId }, data: { estado: nuevoEstado } });
    }
  }

  listarPorVenta(ventaId: string) {
    return this.prisma.abono.findMany({
      where: { ventaId },
      orderBy: { fecha: 'asc' },
    });
  }

  async obtenerComprobante(id: string) {
    const abono = await this.prisma.abono.findUnique({ where: { id } });
    if (!abono?.comprobanteUrl) {
      throw new NotFoundException(`El abono ${id} no tiene comprobante`);
    }

    const buffer = await this.storage.leer(abono.comprobanteUrl);
    return { buffer, contentType: detectarContentType(abono.comprobanteUrl) };
  }
}
