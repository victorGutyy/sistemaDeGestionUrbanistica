import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { PERMISOS_KEY, SOLO_SESION_KEY } from './roles.decorator.js';
import { RolesGuard } from './roles.guard.js';

function crearContexto(permisos: string[]) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user: { permisos } }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

// Simula los decoradores de la ruta: clave -> valor.
function rutaCon(reflector: { getAllAndOverride: ReturnType<typeof vi.fn> }, metadatos: Record<string, unknown>) {
  reflector.getAllAndOverride.mockImplementation((clave: string) => metadatos[clave]);
}

describe('RolesGuard (permisos por rol)', () => {
  let reflector: { getAllAndOverride: ReturnType<typeof vi.fn> };
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: vi.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('deja pasar una ruta pública sin revisar permisos', () => {
    rutaCon(reflector, { [IS_PUBLIC_KEY]: true });
    expect(guard.canActivate(crearContexto([]))).toBe(true);
  });

  it('deja pasar una ruta @SoloSesion a cualquier usuario autenticado', () => {
    rutaCon(reflector, { [SOLO_SESION_KEY]: true });
    expect(guard.canActivate(crearContexto([]))).toBe(true);
  });

  it('deja pasar a quien tiene el permiso exigido', () => {
    rutaCon(reflector, { [PERMISOS_KEY]: ['ventas.crear'] });
    expect(guard.canActivate(crearContexto(['ventas.ver', 'ventas.crear']))).toBe(true);
  });

  it('rechaza a quien no tiene el permiso, aunque tenga otros del mismo módulo (Consulta que intenta guardar)', () => {
    rutaCon(reflector, { [PERMISOS_KEY]: ['ventas.crear'] });
    expect(() => guard.canActivate(crearContexto(['ventas.ver']))).toThrow(ForbiddenException);
  });

  it('si se exigen varios permisos, hacen falta todos', () => {
    rutaCon(reflector, { [PERMISOS_KEY]: ['a.uno', 'a.dos'] });
    expect(() => guard.canActivate(crearContexto(['a.uno']))).toThrow(ForbiddenException);
    expect(guard.canActivate(crearContexto(['a.uno', 'a.dos']))).toBe(true);
  });

  it('una ruta sin ninguna declaración se rechaza para todos (cerrado por defecto)', () => {
    rutaCon(reflector, {});
    expect(() => guard.canActivate(crearContexto(['ventas.ver', 'ventas.crear']))).toThrow(ForbiddenException);
  });

  it('una lista de permisos vacía tampoco abre la ruta', () => {
    rutaCon(reflector, { [PERMISOS_KEY]: [] });
    expect(() => guard.canActivate(crearContexto(['ventas.ver']))).toThrow(ForbiddenException);
  });
});
