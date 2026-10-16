import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// jwt-secret.ts exige JWT_SECRET al importarse: se fija antes de que carguen los imports.
vi.hoisted(() => {
  process.env.JWT_SECRET ??= 'secreto-de-prueba';
});
import type { PrismaService } from '../prisma/prisma.service.js';
import { JwtStrategy } from './jwt.strategy.js';

const ROL = { id: 'rol-1', clave: 'CONSULTA', nombre: 'Consulta', permisos: ['ventas.ver'], activo: true };

function usuario(sobrescribir: Record<string, unknown> = {}) {
  return { id: '1', email: 'a@x.com', nombre: 'A', estado: 'ACTIVO', sesionesValidasDesde: null, rol: ROL, ...sobrescribir };
}

describe('JwtStrategy', () => {
  let prisma: { usuario: { findUnique: ReturnType<typeof vi.fn> } };
  let strategy: JwtStrategy;

  beforeEach(() => {
    process.env.JWT_SECRET ??= 'secreto-de-prueba';
    prisma = { usuario: { findUnique: vi.fn() } };
    strategy = new JwtStrategy(prisma as unknown as PrismaService);
  });

  it('arma el usuario con el rol y los permisos que tiene HOY en la base de datos', async () => {
    prisma.usuario.findUnique.mockResolvedValue(usuario());

    expect(await strategy.validate({ sub: '1', iat: 1000 })).toEqual({
      id: '1',
      email: 'a@x.com',
      nombre: 'A',
      rol: { id: 'rol-1', clave: 'CONSULTA', nombre: 'Consulta' },
      permisos: ['ventas.ver'],
    });
  });

  it('un token deja de servir si el usuario ya no existe', async () => {
    prisma.usuario.findUnique.mockResolvedValue(null);
    await expect(strategy.validate({ sub: '1', iat: 1000 })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('un token deja de servir si el usuario fue desactivado, aunque no haya vencido', async () => {
    prisma.usuario.findUnique.mockResolvedValue(usuario({ estado: 'INACTIVO' }));
    await expect(strategy.validate({ sub: '1', iat: 1000 })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('un token deja de servir si el rol fue desactivado', async () => {
    prisma.usuario.findUnique.mockResolvedValue(usuario({ rol: { ...ROL, activo: false } }));
    await expect(strategy.validate({ sub: '1', iat: 1000 })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('un token emitido antes de restablecer la contraseña deja de servir; uno posterior sí', async () => {
    const restablecida = new Date('2026-10-15T12:00:00Z');
    const iatAntes = Math.floor(restablecida.getTime() / 1000) - 60;
    const iatDespues = Math.floor(restablecida.getTime() / 1000) + 60;
    prisma.usuario.findUnique.mockResolvedValue(usuario({ sesionesValidasDesde: restablecida }));

    await expect(strategy.validate({ sub: '1', iat: iatAntes })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(strategy.validate({ sub: '1', iat: iatDespues })).resolves.toMatchObject({ id: '1' });
  });
});
