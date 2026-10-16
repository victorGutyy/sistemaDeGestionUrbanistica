import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EstadoLote, FormaPago } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { VentasService } from './ventas.service.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';

// Duplicamos aquí solo las llamadas a Prisma que usa VentasService.crear.
// No hace falta una base de datos real para probar las reglas de negocio
// (qué lote/cliente se busca, cuándo se rechaza, qué se guarda al final).
function crearPrismaFalso() {
  const tx = {
    lote: {
      findUnique: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    loteHistorial: {
      create: vi.fn(),
    },
    cliente: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
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

const USUARIO = usuarioDePrueba();

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
      }, USUARIO),
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
      }, USUARIO),
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
      }, USUARIO),
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
      }, USUARIO),
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
      }, USUARIO),
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
      }, USUARIO),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('en una venta de contado no genera cuotas y marca el lote como VENDIDO', async () => {
    tx.lote.findUnique.mockResolvedValue(LOTE_DISPONIBLE);
    tx.cliente.findFirst.mockResolvedValue({ id: 'cliente-1' });
    tx.venta.create.mockResolvedValue({ id: 'venta-1' });
    tx.venta.findUniqueOrThrow.mockResolvedValue({ id: 'venta-1' });

    await service.crear({
      loteId: 'lote-1',
      clienteId: 'cliente-1',
      formaPago: FormaPago.CONTADO,
      valorTotal: '1000000',
      cuotaInicial: '1000000',
    }, USUARIO);

    expect(tx.cuota.createMany).not.toHaveBeenCalled();
    // El cambio de estado va condicionado al estado leído (evita vender dos veces el mismo lote).
    expect(tx.lote.updateMany).toHaveBeenCalledWith({
      where: { id: 'lote-1', estado: EstadoLote.DISPONIBLE },
      data: { estado: EstadoLote.VENDIDO },
    });
    // Y deja el historial del lote con la venta que lo originó y el usuario.
    expect(tx.loteHistorial.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        loteId: 'lote-1',
        estadoAnterior: EstadoLote.DISPONIBLE,
        estadoNuevo: EstadoLote.VENDIDO,
        ventaId: 'venta-1',
        usuarioId: USUARIO.id,
      }),
    });
  });

  it('también se puede vender un lote que estaba SEPARADO', async () => {
    tx.lote.findUnique.mockResolvedValue({ ...LOTE_DISPONIBLE, estado: EstadoLote.SEPARADO });
    tx.cliente.findFirst.mockResolvedValue({ id: 'cliente-1' });
    tx.venta.create.mockResolvedValue({ id: 'venta-1' });
    tx.venta.findUniqueOrThrow.mockResolvedValue({ id: 'venta-1' });

    await service.crear(
      { loteId: 'lote-1', clienteId: 'cliente-1', formaPago: FormaPago.CONTADO, valorTotal: '1000000', cuotaInicial: '1000000' },
      USUARIO,
    );

    expect(tx.lote.updateMany).toHaveBeenCalledWith({
      where: { id: 'lote-1', estado: EstadoLote.SEPARADO },
      data: { estado: EstadoLote.VENDIDO },
    });
  });

  it.each([EstadoLote.ESCRITURADO, EstadoLote.DESISTIDO])('no se puede vender un lote %s', async (estado) => {
    tx.lote.findUnique.mockResolvedValue({ ...LOTE_DISPONIBLE, estado });

    await expect(
      service.crear(
        { loteId: 'lote-1', clienteId: 'cliente-1', formaPago: FormaPago.CONTADO, valorTotal: '1000000', cuotaInicial: '1000000' },
        USUARIO,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.venta.create).not.toHaveBeenCalled();
  });

  it('si otra persona vendió el lote en el mismo instante, la segunda venta falla con conflicto', async () => {
    tx.lote.findUnique.mockResolvedValue(LOTE_DISPONIBLE);
    tx.cliente.findFirst.mockResolvedValue({ id: 'cliente-1' });
    tx.venta.create.mockResolvedValue({ id: 'venta-2' });
    tx.lote.updateMany.mockResolvedValue({ count: 0 }); // otro ya lo había cambiado

    await expect(
      service.crear(
        { loteId: 'lote-1', clienteId: 'cliente-1', formaPago: FormaPago.CONTADO, valorTotal: '1000000', cuotaInicial: '1000000' },
        USUARIO,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.loteHistorial.create).not.toHaveBeenCalled();
  });

  it('en una venta financiada genera exactamente numeroCuotas cuotas', async () => {
    tx.lote.findUnique.mockResolvedValue(LOTE_DISPONIBLE);
    tx.cliente.findFirst.mockResolvedValue({ id: 'cliente-1' });
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
    }, USUARIO);

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
    }, USUARIO);

    expect(tx.cliente.create).toHaveBeenCalledWith({
      data: { nombre: 'Ana Pérez', documento: '123456789' },
    });
    expect(tx.venta.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ clienteId: 'cliente-nuevo' }) }),
    );
  });
});
