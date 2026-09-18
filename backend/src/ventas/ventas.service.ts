import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { parsearFechaLocal } from '../common/fecha.util.js';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoLote, FormaPago } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CrearVentaDto } from './dto/crear-venta.dto.js';
import { calcularEstadoCuenta } from './estado-cuenta.js';
import { generarPlanDePagos } from './plan-de-pagos.js';

@Injectable()
export class VentasService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(dto: CrearVentaDto) {
    if (!dto.clienteId && !dto.clienteNuevo) {
      throw new BadRequestException('Debes enviar clienteId o clienteNuevo');
    }
    if (dto.clienteId && dto.clienteNuevo) {
      throw new BadRequestException('Envía solo uno de los dos: clienteId o clienteNuevo, no ambos');
    }

    const valorTotal = new Prisma.Decimal(dto.valorTotal);
    const cuotaInicial = new Prisma.Decimal(dto.cuotaInicial);
    const tasaInteres = dto.tasaInteres ? new Prisma.Decimal(dto.tasaInteres) : null;
    const fechaVenta = dto.fechaVenta ? parsearFechaLocal(dto.fechaVenta) : new Date();

    if (cuotaInicial.greaterThan(valorTotal)) {
      throw new BadRequestException('La cuota inicial no puede ser mayor al valor total');
    }
    if (dto.formaPago === FormaPago.FINANCIADO && !dto.numeroCuotas) {
      throw new BadRequestException('Una venta financiada necesita numeroCuotas');
    }

    return this.prisma.$transaction(async (tx) => {
      const lote = await tx.lote.findUnique({ where: { id: dto.loteId } });
      if (!lote) {
        throw new NotFoundException(`No existe el lote ${dto.loteId}`);
      }
      if (lote.estado !== EstadoLote.DISPONIBLE) {
        throw new ConflictException(`El lote ${lote.numero} no está disponible (estado: ${lote.estado})`);
      }

      let clienteId = dto.clienteId;
      if (dto.clienteNuevo) {
        const clienteExistente = await tx.cliente.findUnique({
          where: { documento: dto.clienteNuevo.documento },
        });
        if (clienteExistente) {
          throw new ConflictException(
            `Ya existe un cliente con el documento ${dto.clienteNuevo.documento}`,
          );
        }
        const clienteCreado = await tx.cliente.create({ data: dto.clienteNuevo });
        clienteId = clienteCreado.id;
      } else if (clienteId) {
        const cliente = await tx.cliente.findUnique({ where: { id: clienteId } });
        if (!cliente) {
          throw new NotFoundException(`No existe el cliente ${clienteId}`);
        }
      }

      const venta = await tx.venta.create({
        data: {
          loteId: dto.loteId,
          clienteId: clienteId!,
          valorTotal,
          cuotaInicial,
          numeroCuotas: dto.formaPago === FormaPago.FINANCIADO ? dto.numeroCuotas : null,
          tasaInteres: dto.formaPago === FormaPago.FINANCIADO ? tasaInteres : null,
          formaPago: dto.formaPago,
          fechaVenta,
        },
      });

      if (dto.formaPago === FormaPago.FINANCIADO && dto.numeroCuotas) {
        const plan = generarPlanDePagos({
          valorTotal,
          cuotaInicial,
          numeroCuotas: dto.numeroCuotas,
          tasaInteres,
          fechaVenta,
        });

        await tx.cuota.createMany({
          data: plan.map((cuota) => ({
            ventaId: venta.id,
            numero: cuota.numero,
            fechaVencimiento: cuota.fechaVencimiento,
            valor: cuota.valor,
          })),
        });
      }

      await tx.lote.update({
        where: { id: dto.loteId },
        data: { estado: EstadoLote.VENDIDO },
      });

      return tx.venta.findUniqueOrThrow({
        where: { id: venta.id },
        include: { cuotas: { orderBy: { numero: 'asc' } }, cliente: true, lote: true },
      });
    });
  }

  async buscarPorId(id: string) {
    const venta = await this.prisma.venta.findUniqueOrThrow({
      where: { id },
      include: {
        cuotas: { orderBy: { numero: 'asc' } },
        abonos: true,
        cliente: true,
        lote: true,
      },
    });

    return {
      ...venta,
      estadoCuenta: calcularEstadoCuenta(venta),
    };
  }

  listar() {
    return this.prisma.venta.findMany({
      include: { cliente: true, lote: true },
      orderBy: { fechaVenta: 'desc' },
    });
  }
}
