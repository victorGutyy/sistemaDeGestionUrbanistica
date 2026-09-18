import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { TrabajadoresService } from './trabajadores.service.js';

function crearPrismaFalso() {
  return {
    trabajador: { findUnique: vi.fn(), create: vi.fn() },
  };
}

describe('TrabajadoresService', () => {
  let prisma: ReturnType<typeof crearPrismaFalso>;
  let service: TrabajadoresService;

  beforeEach(() => {
    prisma = crearPrismaFalso();
    service = new TrabajadoresService(prisma as unknown as PrismaService);
  });

  it('rechaza crear un trabajador con un documento que ya existe', async () => {
    prisma.trabajador.findUnique.mockResolvedValue({ id: 'existente' });

    await expect(
      service.crear({
        nombre: 'Juan Pérez',
        documento: '123',
        cargo: 'Operario',
        salarioBase: '1500000',
        fechaIngreso: '2026-01-01',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rechaza buscar un trabajador que no existe', async () => {
    prisma.trabajador.findUnique.mockResolvedValue(null);
    await expect(service.buscarPorId('x')).rejects.toBeInstanceOf(NotFoundException);
  });
});
