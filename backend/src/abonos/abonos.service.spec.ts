import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoCuota, MedioPago } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { AbonosService } from './abonos.service.js';

function crearPrismaFalso() {
  const tx = {
    cuota: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    abono: { create: vi.fn(), findMany: vi.fn() },
  };
  type Tx = typeof tx;

  const prisma = {
    venta: { findUnique: vi.fn() },
    cuota: { findUnique: vi.fn() },
    abono: { findMany: vi.fn(), findUnique: vi.fn() },
    $transaction: vi.fn((callback: (txArg: Tx) => unknown) => callback(tx)),
  };

  return { prisma, tx };
}

const VENTA = { id: 'venta-1', clienteId: 'cliente-1' };
const CUOTA = { id: 'cuota-1', ventaId: 'venta-1', valor: new Prisma.Decimal('5900000') };

describe('AbonosService.crear', () => {
  let prisma: ReturnType<typeof crearPrismaFalso>['prisma'];
  let tx: ReturnType<typeof crearPrismaFalso>['tx'];
  let storage: { guardar: ReturnType<typeof vi.fn>; leer: ReturnType<typeof vi.fn> };
  let service: AbonosService;

  beforeEach(() => {
    ({ prisma, tx } = crearPrismaFalso());
    storage = { guardar: vi.fn(), leer: vi.fn() };
    service = new AbonosService(prisma as unknown as PrismaService, storage as unknown as StorageService);
  });

  it('rechaza si la venta no existe', async () => {
    prisma.venta.findUnique.mockResolvedValue(null);

    await expect(
      service.crear({ ventaId: 'venta-x', fecha: '2026-02-01', valor: '100', medioPago: MedioPago.EFECTIVO }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rechaza si la cuota no pertenece a la venta indicada', async () => {
    prisma.venta.findUnique.mockResolvedValue(VENTA);
    prisma.cuota.findUnique.mockResolvedValue({ id: 'cuota-1', ventaId: 'otra-venta' });

    await expect(
      service.crear({
        ventaId: 'venta-1',
        cuotaId: 'cuota-1',
        fecha: '2026-02-01',
        valor: '100',
        medioPago: MedioPago.EFECTIVO,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sube el comprobante a la carpeta cliente/venta cuando viene un archivo', async () => {
    prisma.venta.findUnique.mockResolvedValue(VENTA);
    storage.guardar.mockResolvedValue({ rutaRelativa: 'cliente-1/venta-1/abc.pdf' });
    tx.abono.create.mockResolvedValue({ id: 'abono-1' });

    await service.crear(
      { ventaId: 'venta-1', fecha: '2026-02-01', valor: '100', medioPago: MedioPago.EFECTIVO },
      { originalname: 'comprobante.pdf', buffer: Buffer.from('x') } as Express.Multer.File,
    );

    expect(storage.guardar).toHaveBeenCalledWith('cliente-1/venta-1', 'comprobante.pdf', Buffer.from('x'));
    expect(tx.abono.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ comprobanteUrl: 'cliente-1/venta-1/abc.pdf' }) }),
    );
  });

  it('marca la cuota como PAGADA cuando los abonos cubren su valor completo', async () => {
    prisma.venta.findUnique.mockResolvedValue(VENTA);
    prisma.cuota.findUnique.mockResolvedValue(CUOTA);
    tx.abono.create.mockResolvedValue({ id: 'abono-1' });
    tx.cuota.findUniqueOrThrow.mockResolvedValue(CUOTA);
    tx.abono.findMany.mockResolvedValue([{ valor: new Prisma.Decimal('5900000') }]);

    await service.crear({
      ventaId: 'venta-1',
      cuotaId: 'cuota-1',
      fecha: '2026-02-01',
      valor: '5900000',
      medioPago: MedioPago.TRANSFERENCIA,
    });

    expect(tx.cuota.update).toHaveBeenCalledWith({ where: { id: 'cuota-1' }, data: { estado: EstadoCuota.PAGADA } });
  });

  it('marca la cuota como PARCIAL cuando los abonos no cubren su valor completo', async () => {
    prisma.venta.findUnique.mockResolvedValue(VENTA);
    prisma.cuota.findUnique.mockResolvedValue(CUOTA);
    tx.abono.create.mockResolvedValue({ id: 'abono-1' });
    tx.cuota.findUniqueOrThrow.mockResolvedValue(CUOTA);
    tx.abono.findMany.mockResolvedValue([{ valor: new Prisma.Decimal('2000000') }]);

    await service.crear({
      ventaId: 'venta-1',
      cuotaId: 'cuota-1',
      fecha: '2026-02-01',
      valor: '2000000',
      medioPago: MedioPago.EFECTIVO,
    });

    expect(tx.cuota.update).toHaveBeenCalledWith({ where: { id: 'cuota-1' }, data: { estado: EstadoCuota.PARCIAL } });
  });
});
