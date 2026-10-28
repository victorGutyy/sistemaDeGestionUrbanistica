import { describe, expect, it } from 'vitest';
import { PERMISOS } from '../auth/permisos.js';
import { ALCANCE_TOTAL_KEY, PERMISOS_KEY } from '../auth/roles.decorator.js';
import { TrabajadoresController } from './trabajadores.controller.js';

// Dos puertas: la de nómina (con salarios) y la del módulo SST (sin ellos, para el contratista). Aquí se fija cuál
// permiso exige cada ruta, porque de eso depende qué ve cada rol (RF-USR-11, RNF-SEG-08).
const permisoDe = (metodo: keyof TrabajadoresController) => Reflect.getMetadata(PERMISOS_KEY, TrabajadoresController.prototype[metodo]) as string[] | undefined;

describe('TrabajadoresController: permisos declarados', () => {
  it.each([
    ['crear', PERMISOS.NOMINA_GESTIONAR],
    ['listar', PERMISOS.NOMINA_VER],
    ['buscarPorId', PERMISOS.NOMINA_VER],
    ['actualizar', PERMISOS.NOMINA_GESTIONAR],
    ['retirar', PERMISOS.NOMINA_GESTIONAR],
    ['reactivar', PERMISOS.NOMINA_GESTIONAR],
    ['registrarAfiliacion', PERMISOS.NOMINA_GESTIONAR],
    ['cerrarAfiliacion', PERMISOS.NOMINA_GESTIONAR],
  ] as const)('%s pide %s (con salarios: no es para el contratista)', (metodo, permiso) => {
    expect(permisoDe(metodo)).toEqual([permiso]);
  });

  it.each(['listarSst', 'alertasSst', 'fichaSst', 'listarAfiliaciones', 'listarDocumentos', 'descargarDocumento'] as const)('%s pide solo sst.ver', (metodo) => {
    expect(permisoDe(metodo)).toEqual([PERMISOS.SST_VER]);
  });

  it.each(['autorizacionSalud', 'subirDocumento'] as const)('%s pide sst.gestionar', (metodo) => {
    expect(permisoDe(metodo)).toEqual([PERMISOS.SST_GESTIONAR]);
  });

  it('ninguna ruta del módulo SST pide permisos de nómina, y viceversa: el contratista nunca llega al salario', () => {
    for (const metodo of ['listarSst', 'alertasSst', 'fichaSst', 'listarAfiliaciones', 'listarDocumentos', 'descargarDocumento', 'autorizacionSalud', 'subirDocumento'] as const) {
      expect(permisoDe(metodo)?.every((p) => p.startsWith('sst.')), metodo).toBe(true);
    }
  });

  it('toda ruta del controlador declara un permiso', () => {
    const metodos = Object.getOwnPropertyNames(TrabajadoresController.prototype).filter((nombre) => nombre !== 'constructor');
    expect(metodos.length).toBeGreaterThan(10);
    for (const metodo of metodos) {
      expect(permisoDe(metodo as keyof TrabajadoresController), metodo).toBeDefined();
    }
  });

  it('es solo para usuarios con alcance total (el personal es de la empresa, no de un proyecto)', () => {
    expect(Reflect.getMetadata(ALCANCE_TOTAL_KEY, TrabajadoresController)).toBe(true);
  });
});
