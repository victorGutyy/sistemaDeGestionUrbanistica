import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { auditoriaDe, auditoriasDe } from '../test-utils/auditoria.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import { ClientesService } from './clientes.service.js';

function crearPrismaFalso() {
  const tablas = {
    cliente: { findUnique: vi.fn(), create: vi.fn() },
    registroAuditoria: { create: vi.fn() },
  };
  // El cliente se crea en una transacción junto con su registro de auditoría.
  return { ...tablas, $transaction: vi.fn((accion: (tx: typeof tablas) => unknown) => accion(tablas)) };
}

const DTO = { nombre: 'Ana Pérez', documento: '1000000001', telefono: '3000000000' };

describe('ClientesService.crear', () => {
  it('crea el cliente y deja en la auditoría quién lo creó y con qué datos (RF-AUD-01)', async () => {
    const prisma = crearPrismaFalso();
    prisma.cliente.findUnique.mockResolvedValue(null);
    prisma.cliente.create.mockResolvedValue({ id: 'c-1', ...DTO, email: null, direccion: null });
    const usuario = usuarioDePrueba();

    await new ClientesService(prisma as unknown as PrismaService).crear(DTO, usuario);

    expect(auditoriaDe(prisma.registroAuditoria.create, 'CLIENTE_CREAR')).toMatchObject({
      entidad: 'CLIENTE',
      entidadId: 'c-1',
      usuarioId: usuario.id,
      despues: { nombre: 'Ana Pérez', documento: '1000000001' },
    });
  });

  it('un documento repetido se rechaza sin dejar nada en la auditoría', async () => {
    const prisma = crearPrismaFalso();
    prisma.cliente.findUnique.mockResolvedValue({ id: 'existente' });

    await expect(new ClientesService(prisma as unknown as PrismaService).crear(DTO, usuarioDePrueba())).rejects.toBeInstanceOf(ConflictException);
    expect(auditoriasDe(prisma.registroAuditoria.create)).toEqual([]);
  });
});
