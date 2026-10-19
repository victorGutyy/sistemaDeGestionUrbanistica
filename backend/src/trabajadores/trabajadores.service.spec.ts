import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import { TrabajadoresService } from './trabajadores.service.js';
import { auditoriaDe } from '../test-utils/auditoria.js';

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
      }, usuarioDePrueba()),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rechaza buscar un trabajador que no existe', async () => {
    prisma.trabajador.findUnique.mockResolvedValue(null);
    await expect(service.buscarPorId('x')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('TrabajadoresService: auditoría (RF-AUD-01)', () => {
  it('crear un trabajador deja quién lo creó y con qué datos', async () => {
    const tablas = { trabajador: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 't-1', nombre: 'Juan Pérez', documento: '123', cargo: 'Operario', salarioBase: '1500000', fechaIngreso: new Date(2026, 0, 1), estado: 'ACTIVO' }) }, registroAuditoria: { create: vi.fn() } };
    const prisma = { ...tablas, $transaction: vi.fn((accion: (tx: typeof tablas) => unknown) => accion(tablas)) };
    const servicio = new TrabajadoresService(prisma as unknown as PrismaService);

    await servicio.crear({ nombre: 'Juan Pérez', documento: '123', cargo: 'Operario', salarioBase: '1500000', fechaIngreso: '2026-01-01' }, usuarioDePrueba());

    expect(auditoriaDe(tablas.registroAuditoria.create, 'TRABAJADOR_CREAR')).toMatchObject({ entidad: 'TRABAJADOR', entidadId: 't-1', despues: { nombre: 'Juan Pérez', cargo: 'Operario' } });
  });
});
