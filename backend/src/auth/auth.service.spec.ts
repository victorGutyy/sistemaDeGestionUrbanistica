import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';

function crearPrismaFalso() {
  return {
    usuario: { findUnique: vi.fn() },
  };
}

function crearJwtFalso() {
  return { signAsync: vi.fn().mockResolvedValue('token-firmado') };
}

describe('AuthService', () => {
  let prisma: ReturnType<typeof crearPrismaFalso>;
  let jwtService: ReturnType<typeof crearJwtFalso>;
  let service: AuthService;

  beforeEach(() => {
    prisma = crearPrismaFalso();
    jwtService = crearJwtFalso();
    service = new AuthService(prisma as unknown as PrismaService, jwtService as never);
  });

  it('rechaza un correo que no existe', async () => {
    prisma.usuario.findUnique.mockResolvedValue(null);

    await expect(service.login({ email: 'nadie@x.com', password: '12345678' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rechaza un usuario inactivo aunque la contraseña sea correcta', async () => {
    const passwordHash = await bcrypt.hash('12345678', 12);
    prisma.usuario.findUnique.mockResolvedValue({
      id: '1',
      email: 'a@x.com',
      nombre: 'A',
      rol: 'ADMINISTRADOR',
      estado: 'INACTIVO',
      passwordHash,
    });

    await expect(service.login({ email: 'a@x.com', password: '12345678' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rechaza una contraseña incorrecta', async () => {
    const passwordHash = await bcrypt.hash('12345678', 12);
    prisma.usuario.findUnique.mockResolvedValue({
      id: '1',
      email: 'a@x.com',
      nombre: 'A',
      rol: 'ADMINISTRADOR',
      estado: 'ACTIVO',
      passwordHash,
    });

    await expect(service.login({ email: 'a@x.com', password: 'incorrecta' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('devuelve un token y los datos del usuario con credenciales correctas', async () => {
    const passwordHash = await bcrypt.hash('12345678', 12);
    prisma.usuario.findUnique.mockResolvedValue({
      id: '1',
      email: 'a@x.com',
      nombre: 'A',
      rol: 'PROPIETARIO',
      estado: 'ACTIVO',
      passwordHash,
    });

    const resultado = await service.login({ email: 'a@x.com', password: '12345678' });

    expect(resultado.accessToken).toBe('token-firmado');
    expect(resultado.usuario).toEqual({ id: '1', email: 'a@x.com', nombre: 'A', rol: 'PROPIETARIO' });
  });
});
