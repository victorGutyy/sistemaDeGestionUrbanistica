import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import {
  exigirAlcanceTotal,
  exigirProyecto,
  filtroCliente,
  filtroLote,
  filtroMovimiento,
  filtroProyecto,
  filtroVenta,
  puedeVerProyecto,
  tieneAlcanceTotal,
} from './alcance.js';
import { PERMISOS_KEY, ALCANCE_TOTAL_KEY } from './roles.decorator.js';
import { RolesGuard } from './roles.guard.js';

const TOTAL = usuarioDePrueba();
const SOCIO = usuarioDePrueba(['p-floresta']);

describe('alcance por proyecto (helpers)', () => {
  it('un usuario con alcance total no recibe ningún filtro', () => {
    expect(tieneAlcanceTotal(TOTAL)).toBe(true);
    expect(filtroProyecto(TOTAL)).toEqual({});
    expect(filtroLote(TOTAL)).toEqual({});
    expect(filtroVenta(TOTAL)).toEqual({});
    expect(filtroCliente(TOTAL)).toEqual({});
    expect(filtroMovimiento(TOTAL)).toEqual({});
  });

  it('un usuario restringido recibe filtros que limitan todo a sus proyectos', () => {
    expect(tieneAlcanceTotal(SOCIO)).toBe(false);
    expect(filtroProyecto(SOCIO)).toEqual({ id: { in: ['p-floresta'] } });
    expect(filtroLote(SOCIO)).toEqual({ proyectoId: { in: ['p-floresta'] } });
    expect(filtroVenta(SOCIO)).toEqual({ lote: { proyectoId: { in: ['p-floresta'] } } });
    // Un cliente solo se ve si tiene alguna venta dentro del alcance.
    expect(filtroCliente(SOCIO)).toEqual({ ventas: { some: { lote: { proyectoId: { in: ['p-floresta'] } } } } });
    expect(filtroMovimiento(SOCIO)).toEqual({ proyectoId: { in: ['p-floresta'] } });
  });

  it('un usuario restringido sin ningún proyecto no ve nada (nunca "todo" por una lista vacía)', () => {
    const sinProyectos = usuarioDePrueba([]);
    expect(tieneAlcanceTotal(sinProyectos)).toBe(false);
    expect(filtroProyecto(sinProyectos)).toEqual({ id: { in: [] } });
  });

  it('exigirProyecto responde 404 (no 403) para un proyecto ajeno, para no revelar que existe', () => {
    expect(() => exigirProyecto(SOCIO, 'p-arboleda', 'No existe')).toThrow(NotFoundException);
    expect(() => exigirProyecto(SOCIO, 'p-floresta', 'No existe')).not.toThrow();
    expect(() => exigirProyecto(TOTAL, 'p-cualquiera', 'No existe')).not.toThrow();
    expect(puedeVerProyecto(SOCIO, 'p-arboleda')).toBe(false);
  });

  it('exigirAlcanceTotal rechaza a quien está limitado a ciertos proyectos', () => {
    expect(() => exigirAlcanceTotal(SOCIO)).toThrow(ForbiddenException);
    expect(() => exigirAlcanceTotal(TOTAL)).not.toThrow();
  });
});

describe('RolesGuard con alcance restringido', () => {
  let reflector: { getAllAndOverride: ReturnType<typeof vi.fn> };
  let guard: RolesGuard;

  function contexto(usuario: ReturnType<typeof usuarioDePrueba>) {
    return {
      switchToHttp: () => ({ getRequest: () => ({ user: usuario }) }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext;
  }

  function ruta(metadatos: Record<string, unknown>) {
    reflector.getAllAndOverride.mockImplementation((clave: string) => metadatos[clave]);
  }

  beforeEach(() => {
    reflector = { getAllAndOverride: vi.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('una ruta marcada SoloAlcanceTotal (nómina, configuración…) rechaza a un usuario restringido aunque su rol tenga el permiso', () => {
    ruta({ [PERMISOS_KEY]: ['nomina.ver'], [ALCANCE_TOTAL_KEY]: true });
    const restringidoConPermiso = { ...SOCIO, permisos: ['nomina.ver'] };

    expect(() => guard.canActivate(contexto(restringidoConPermiso))).toThrow(ForbiddenException);
  });

  it('esa misma ruta sí deja pasar a quien tiene alcance total y el permiso', () => {
    ruta({ [PERMISOS_KEY]: ['nomina.ver'], [ALCANCE_TOTAL_KEY]: true });

    expect(guard.canActivate(contexto({ ...TOTAL, permisos: ['nomina.ver'] }))).toBe(true);
  });

  it('una ruta exceptuada (SoloAlcanceTotal(false)) sí la puede usar un usuario restringido con el permiso', () => {
    ruta({ [PERMISOS_KEY]: ['abonos.registrar'], [ALCANCE_TOTAL_KEY]: false });

    expect(guard.canActivate(contexto({ ...SOCIO, permisos: ['abonos.registrar'] }))).toBe(true);
  });

  it('una ruta de proyectos (sin la marca) deja pasar a un usuario restringido con el permiso', () => {
    ruta({ [PERMISOS_KEY]: ['proyectos.ver'] });

    expect(guard.canActivate(contexto({ ...SOCIO, permisos: ['proyectos.ver'] }))).toBe(true);
  });
});
