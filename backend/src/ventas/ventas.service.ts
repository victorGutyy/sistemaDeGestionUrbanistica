import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { exigirProyecto, filtroCliente, filtroVenta } from '../auth/alcance.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { parsearFechaLocal } from '../common/fecha.util.js';
import { Prisma } from '../generated/prisma/client.js';
import { FormaPago } from '../generated/prisma/enums.js';
import { aplicarAccionLote } from '../lotes/aplicar-accion.js';
import { puedeAplicar } from '../lotes/estado-lote.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CrearVentaDto } from './dto/crear-venta.dto.js';
import { calcularEstadoCuenta } from './estado-cuenta.js';
import { generarPlanDePagos } from './plan-de-pagos.js';

@Injectable()
export class VentasService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(dto: CrearVentaDto, usuario: UsuarioAutenticado) {
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
      exigirProyecto(usuario, lote.proyectoId, `No existe el lote ${dto.loteId}`);
      // Se puede vender un lote disponible o separado; cualquier otro estado lo impide.
      if (!puedeAplicar(lote.estado, 'VENDER')) {
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
        // Con alcance restringido solo se pueden usar clientes que ya tienen ventas en sus proyectos.
        const cliente = await tx.cliente.findFirst({ where: { id: clienteId, ...filtroCliente(usuario) } });
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

      // El cambio de estado pasa por la máquina de estados: valida, deja historial y evita vender dos veces el mismo lote.
      await aplicarAccionLote(tx, lote, 'VENDER', usuario.id, { ventaId: venta.id });

      return tx.venta.findUniqueOrThrow({
        where: { id: venta.id },
        include: { cuotas: { orderBy: { numero: 'asc' } }, cliente: true, lote: true },
      });
    });
  }

  async buscarPorId(id: string, usuario: UsuarioAutenticado) {
    const venta = await this.prisma.venta.findFirst({
      where: { id, ...filtroVenta(usuario) },
      include: {
        cuotas: { orderBy: { numero: 'asc' } },
        abonos: true,
        cliente: true,
        lote: true,
      },
    });
    if (!venta) {
      throw new NotFoundException(`No existe la venta ${id}`);
    }

    return {
      ...venta,
      estadoCuenta: calcularEstadoCuenta(venta),
    };
  }

  listar(usuario: UsuarioAutenticado) {
    return this.prisma.venta.findMany({
      where: filtroVenta(usuario),
      include: { cliente: true, lote: true },
      orderBy: { fechaVenta: 'desc' },
    });
  }
}
