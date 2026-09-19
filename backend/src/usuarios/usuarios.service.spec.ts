import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { UsuariosService } from './usuarios.service.js';

function crearPrismaFalso() {
  return {
    usuario: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  };
}

describe('UsuariosService', () => {
  let prisma: ReturnType<typeof crearPrismaFalso>;
  let service: UsuariosService;

  beforeEach(() => {
    prisma = crearPrismaFalso();
    service = new UsuariosService(prisma as unknown as PrismaService);
  });

  it('rechaza crear un usuario con un correo que ya existe', async () => {
    prisma.usuario.findUnique.mockResolvedValue({ id: 'existente' });

    await expect(
      service.crear({ nombre: 'Juan', email: 'juan@x.com', password: '12345678', rol: 'ADMINISTRADOR' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('nunca guarda la contraseña en texto plano', async () => {
    prisma.usuario.findUnique.mockResolvedValue(null);
    prisma.usuario.create.mockResolvedValue({ id: '1' });

    await service.crear({ nombre: 'Juan', email: 'juan@x.com', password: '12345678', rol: 'ADMINISTRADOR' });

    const argumentos = prisma.usuario.create.mock.calls[0][0];
    expect(argumentos.data.passwordHash).not.toBe('12345678');
    expect(argumentos.data.passwordHash).toBeTruthy();
  });

  it('rechaza que un usuario cambie el estado de su propia cuenta', async () => {
    await expect(service.actualizarEstado('1', { estado: 'INACTIVO' }, '1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rechaza actualizar el estado de un usuario que no existe', async () => {
    prisma.usuario.findUnique.mockResolvedValue(null);

    await expect(service.actualizarEstado('2', { estado: 'INACTIVO' }, '1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
