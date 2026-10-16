import { HttpException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfiguracionService } from '../configuracion/configuracion.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';

const ROL = { id: 'rol-1', clave: 'ADMINISTRADOR', nombre: 'Administrador', permisos: ['ventas.ver'], activo: true };

function crearPrismaFalso() {
  return {
    usuario: { findUnique: vi.fn(), update: vi.fn() },
  };
}

function crearJwtFalso() {
  return { signAsync: vi.fn().mockResolvedValue('token-firmado') };
}

async function usuarioBase(sobrescribir: Record<string, unknown> = {}) {
  return {
    id: '1',
    email: 'a@x.com',
    nombre: 'A',
    estado: 'ACTIVO',
    passwordHash: await bcrypt.hash('12345678', 4),
    bloqueadoHasta: null,
    rol: ROL,
    ...sobrescribir,
  };
}

describe('AuthService', () => {
  let prisma: ReturnType<typeof crearPrismaFalso>;
  let jwtService: ReturnType<typeof crearJwtFalso>;
  let configuracion: { obtenerEmpresa: ReturnType<typeof vi.fn> };
  let service: AuthService;

  beforeEach(() => {
    prisma = crearPrismaFalso();
    jwtService = crearJwtFalso();
    configuracion = { obtenerEmpresa: vi.fn().mockResolvedValue({ intentosMaximosLogin: 5, minutosBloqueoLogin: 15 }) };
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as never,
      configuracion as unknown as ConfiguracionService,
    );
  });

  it('rechaza un correo que no existe', async () => {
    prisma.usuario.findUnique.mockResolvedValue(null);

    await expect(service.login({ email: 'nadie@x.com', password: '12345678' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rechaza un usuario inactivo aunque la contraseña sea correcta', async () => {
    prisma.usuario.findUnique.mockResolvedValue(await usuarioBase({ estado: 'INACTIVO' }));

    await expect(service.login({ email: 'a@x.com', password: '12345678' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rechaza a un usuario cuyo rol fue desactivado', async () => {
    prisma.usuario.findUnique.mockResolvedValue(await usuarioBase({ rol: { ...ROL, activo: false } }));

    await expect(service.login({ email: 'a@x.com', password: '12345678' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rechaza una contraseña incorrecta y suma un intento fallido', async () => {
    prisma.usuario.findUnique.mockResolvedValue(await usuarioBase());
    prisma.usuario.update.mockResolvedValue({ intentosFallidos: 1 });

    await expect(service.login({ email: 'a@x.com', password: 'incorrecta' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.usuario.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { intentosFallidos: { increment: 1 } } }),
    );
    // Con 1 intento de 5 todavía no se bloquea.
    expect(prisma.usuario.update).toHaveBeenCalledTimes(1);
  });

  it('bloquea la cuenta al llegar al máximo de intentos fallidos', async () => {
    prisma.usuario.findUnique.mockResolvedValue(await usuarioBase());
    prisma.usuario.update.mockResolvedValueOnce({ intentosFallidos: 5 }).mockResolvedValueOnce({});
    const antes = Date.now();

    await expect(service.login({ email: 'a@x.com', password: 'incorrecta' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    const bloqueo = prisma.usuario.update.mock.calls[1][0].data;
    expect(bloqueo.intentosFallidos).toBe(0);
    // 15 minutos hacia adelante (con holgura por el tiempo que tarda la prueba).
    expect(bloqueo.bloqueadoHasta.getTime() - antes).toBeGreaterThanOrEqual(15 * 60_000 - 1000);
    expect(bloqueo.bloqueadoHasta.getTime() - antes).toBeLessThan(15 * 60_000 + 5000);
  });

  it('con la cuenta bloqueada responde 429 sin revisar la contraseña, aunque sea la correcta', async () => {
    prisma.usuario.findUnique.mockResolvedValue(
      await usuarioBase({ bloqueadoHasta: new Date(Date.now() + 10 * 60_000) }),
    );

    const error = await service.login({ email: 'a@x.com', password: '12345678' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect(prisma.usuario.update).not.toHaveBeenCalled();
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('un bloqueo ya vencido deja ingresar de nuevo y limpia el contador', async () => {
    prisma.usuario.findUnique.mockResolvedValue(
      await usuarioBase({ bloqueadoHasta: new Date(Date.now() - 1000), intentosFallidos: 0 }),
    );

    const resultado = await service.login({ email: 'a@x.com', password: '12345678' });

    expect(resultado.accessToken).toBe('token-firmado');
    expect(prisma.usuario.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ intentosFallidos: 0, bloqueadoHasta: null }) }),
    );
  });

  it('devuelve un token que solo lleva el id, y los datos y permisos del usuario', async () => {
    prisma.usuario.findUnique.mockResolvedValue(await usuarioBase());

    const resultado = await service.login({ email: 'a@x.com', password: '12345678' });

    expect(jwtService.signAsync).toHaveBeenCalledWith({ sub: '1' });
    expect(resultado.usuario).toEqual({
      id: '1',
      email: 'a@x.com',
      nombre: 'A',
      rol: { id: 'rol-1', clave: 'ADMINISTRADOR', nombre: 'Administrador' },
      permisos: ['ventas.ver'],
    });
  });
});
