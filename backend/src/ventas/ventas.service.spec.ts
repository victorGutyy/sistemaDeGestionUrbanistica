import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EstadoLote, FormaPago } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { VentasService } from './ventas.service.js';

// Duplicamos aquí solo las llamadas a Prisma que usa VentasService.crear.
// No hace falta una base de datos real para probar las reglas de negocio
// (qué lote/cliente se busca, cuándo se rechaza, qué se guarda al final).
function crearPrismaFalso() {
  const tx = {
    lote: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    cliente: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    venta: {
      create: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    cuota: {
      createMany: vi.fn(),
    },
  };

  type Tx = typeof tx;
  const prisma = {
    ...tx,
    $transaction: vi.fn((callback: (txArg: Tx) => unknown) => callback(tx)),
  };

  return { prisma, tx };
}

const LOTE_DISPONIBLE = { id: 'lote-1', numero: 'L-1', estado: EstadoLote.DISPONIBLE };

describe('VentasService.crear', () => {
  let prisma: ReturnType<typeof crearPrismaFalso>['prisma'];
  let tx: ReturnType<typeof crearPrismaFalso>['tx'];
  let service: VentasService;

  beforeEach(() => {
    ({ prisma, tx } = crearPrismaFalso());
    service = new VentasService(prisma as unknown as PrismaService);
  });

  it('rechaza si no se envía ni clienteId ni clienteNuevo', async () => {
    await expect(
      service.crear({
        loteId: 'lote-1',
        formaPago: FormaPago.CONTADO,
        valorTotal: '1000000',
        cuotaInicial: '1000000',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza si se envían clienteId y clienteNuevo a la vez', async () => {
    await expect(
      service.crear({
        loteId: 'lote-1',
        clienteId: 'cliente-1',
        clienteNuevo: { nombre: 'Ana', documento: '123' },
        formaPago: FormaPago.CONTADO,
        valorTotal: '1000000',
        cuotaInicial: '1000000',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza si la cuota inicial es mayor al valor total', async () => {
    await expect(
      service.crear({
        loteId: 'lote-1',
        clienteId: 'cliente-1',
        formaPago: FormaPago.CONTADO,
        valorTotal: '1000000',
        cuotaInicial: '2000000',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza una venta financiada sin numeroCuotas', async () => {
    await expect(
      service.crear({
        loteId: 'lote-1',
        clienteId: 'cliente-1',
        formaPago: FormaPago.FINANCIADO,
        valorTotal: '1000000',
        cuotaInicial: '200000',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza si el lote no existe', async () => {
    tx.lote.findUnique.mockResolvedValue(null);

    await expect(
      service.crear({
        loteId: 'lote-inexistente',
        clienteId: 'cliente-1',
        formaPago: FormaPago.CONTADO,
        valorTotal: '1000000',
        cuotaInicial: '1000000',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rechaza si el lote no está DISPONIBLE', async () => {
    tx.lote.findUnique.mockResolvedValue({ ...LOTE_DISPONIBLE, estado: EstadoLote.VENDIDO });

    await expect(
      service.crear({
        loteId: 'lote-1',
        clienteId: 'cliente-1',
        formaPago: FormaPago.CONTADO,
        valorTotal: '1000000',
        cuotaInicial: '1000000',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('en una venta de contado no genera cuotas y marca el lote como VENDIDO', async () => {
    tx.lote.findUnique.mockResolvedValue(LOTE_DISPONIBLE);
    tx.cliente.findUnique.mockResolvedValue({ id: 'cliente-1' });
    tx.venta.create.mockResolvedValue({ id: 'venta-1' });
    tx.venta.findUniqueOrThrow.mockResolvedValue({ id: 'venta-1' });

    await service.crear({
      loteId: 'lote-1',
      clienteId: 'cliente-1',
      formaPago: FormaPago.CONTADO,
      valorTotal: '1000000',
      cuotaInicial: '1000000',
    });

    expect(tx.cuota.createMany).not.toHaveBeenCalled();
    expect(tx.lote.update).toHaveBeenCalledWith({
      where: { id: 'lote-1' },
      data: { estado: EstadoLote.VENDIDO },
    });
  });

  it('en una venta financiada genera exactamente numeroCuotas cuotas', async () => {
    tx.lote.findUnique.mockResolvedValue(LOTE_DISPONIBLE);
    tx.cliente.findUnique.mockResolvedValue({ id: 'cliente-1' });
    tx.venta.create.mockResolvedValue({ id: 'venta-1' });
    tx.venta.findUniqueOrThrow.mockResolvedValue({ id: 'venta-1' });

    await service.crear({
      loteId: 'lote-1',
      clienteId: 'cliente-1',
      formaPago: FormaPago.FINANCIADO,
      valorTotal: '10000000',
      cuotaInicial: '2000000',
      numeroCuotas: 12,
      tasaInteres: '1.5',
    });

    expect(tx.cuota.createMany).toHaveBeenCalledTimes(1);
    const { data: cuotasCreadas } = tx.cuota.createMany.mock.calls[0][0];
    expect(cuotasCreadas).toHaveLength(12);
  });

  it('crea el cliente nuevo dentro de la misma transacción cuando no existe', async () => {
    tx.lote.findUnique.mockResolvedValue(LOTE_DISPONIBLE);
    tx.cliente.findUnique.mockResolvedValue(null);
    tx.cliente.create.mockResolvedValue({ id: 'cliente-nuevo' });
    tx.venta.create.mockResolvedValue({ id: 'venta-1' });
    tx.venta.findUniqueOrThrow.mockResolvedValue({ id: 'venta-1' });

    await service.crear({
      loteId: 'lote-1',
      clienteNuevo: { nombre: 'Ana Pérez', documento: '123456789' },
      formaPago: FormaPago.CONTADO,
      valorTotal: '1000000',
      cuotaInicial: '1000000',
    });

    expect(tx.cliente.create).toHaveBeenCalledWith({
      data: { nombre: 'Ana Pérez', documento: '123456789' },
    });
    expect(tx.venta.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ clienteId: 'cliente-nuevo' }) }),
    );
  });
});
