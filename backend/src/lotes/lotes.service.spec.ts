import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { LotesService } from './lotes.service.js';

function crearPrismaFalso() {
  return {
    proyecto: { findUnique: vi.fn() },
    lote: { findUnique: vi.fn(), create: vi.fn() },
  };
}

describe('LotesService.crear', () => {
  let prisma: ReturnType<typeof crearPrismaFalso>;
  let service: LotesService;

  beforeEach(() => {
    prisma = crearPrismaFalso();
    service = new LotesService(prisma as unknown as PrismaService);
  });

  it('rechaza si el proyecto no existe', async () => {
    prisma.proyecto.findUnique.mockResolvedValue(null);

    await expect(
      service.crear({ proyectoId: 'p-1', numero: 'L-1', area: '500', valorVenta: '80000000' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rechaza si el proyecto ya tiene un lote con ese número', async () => {
    prisma.proyecto.findUnique.mockResolvedValue({ id: 'p-1' });
    prisma.lote.findUnique.mockResolvedValue({ id: 'lote-existente' });

    await expect(
      service.crear({ proyectoId: 'p-1', numero: 'L-1', area: '500', valorVenta: '80000000' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('crea el lote cuando el proyecto existe y el número está libre', async () => {
    prisma.proyecto.findUnique.mockResolvedValue({ id: 'p-1' });
    prisma.lote.findUnique.mockResolvedValue(null);
    prisma.lote.create.mockResolvedValue({ id: 'lote-nuevo' });

    const dto = { proyectoId: 'p-1', numero: 'L-1', area: '500', valorVenta: '80000000' };
    const resultado = await service.crear(dto);

    expect(prisma.lote.create).toHaveBeenCalledWith({ data: dto });
    expect(resultado).toEqual({ id: 'lote-nuevo' });
  });
});
