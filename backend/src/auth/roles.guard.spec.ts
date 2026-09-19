import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RolesGuard } from './roles.guard.js';

function crearContexto(usuario: { rol: string }, method: string) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user: usuario, method }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: { getAllAndOverride: ReturnType<typeof vi.fn> };
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: vi.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('deja pasar una ruta pública sin revisar el rol', () => {
    reflector.getAllAndOverride.mockReturnValueOnce(true);
    expect(guard.canActivate(crearContexto({ rol: 'CONSULTA' }, 'POST'))).toBe(true);
  });

  it('bloquea a CONSULTA en una petición que no es GET', () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false).mockReturnValueOnce(undefined);
    expect(() => guard.canActivate(crearContexto({ rol: 'CONSULTA' }, 'POST'))).toThrow(ForbiddenException);
  });

  it('deja a CONSULTA hacer GET', () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false).mockReturnValueOnce(undefined);
    expect(guard.canActivate(crearContexto({ rol: 'CONSULTA' }, 'GET'))).toBe(true);
  });

  it('bloquea un rol que no está en la lista de @Roles(...)', () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false).mockReturnValueOnce(['PROPIETARIO']);
    expect(() => guard.canActivate(crearContexto({ rol: 'ADMINISTRADOR' }, 'PATCH'))).toThrow(ForbiddenException);
  });

  it('deja pasar un rol que sí está en la lista de @Roles(...)', () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false).mockReturnValueOnce(['PROPIETARIO']);
    expect(guard.canActivate(crearContexto({ rol: 'PROPIETARIO' }, 'PATCH'))).toBe(true);
  });

  it('deja pasar a ADMINISTRADOR en rutas sin restricción explícita', () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false).mockReturnValueOnce(undefined);
    expect(guard.canActivate(crearContexto({ rol: 'ADMINISTRADOR' }, 'POST'))).toBe(true);
  });
});
