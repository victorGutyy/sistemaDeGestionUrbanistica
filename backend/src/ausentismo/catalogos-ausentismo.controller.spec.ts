import { describe, expect, it } from 'vitest';
import { PERMISOS } from '../auth/permisos.js';
import { ALCANCE_TOTAL_KEY, PERMISOS_KEY } from '../auth/roles.decorator.js';
import { CatalogosAusentismoController } from './catalogos-ausentismo.controller.js';

// Leer los catálogos es de sst.ver; los tipos (regla y porcentaje) los administra el gerente; los diagnósticos, quien
// gestiona el módulo SST. Consulta no recibe ninguno de los dos.
const permisoDe = (metodo: keyof CatalogosAusentismoController) => Reflect.getMetadata(PERMISOS_KEY, CatalogosAusentismoController.prototype[metodo]) as string[] | undefined;

describe('CatalogosAusentismoController: permisos declarados', () => {
  it.each(['listarTipos', 'listarDiagnosticos'] as const)('%s pide solo sst.ver', (metodo) => {
    expect(permisoDe(metodo)).toEqual([PERMISOS.SST_VER]);
  });

  it.each(['crearTipo', 'actualizarTipo'] as const)('%s pide configuracion.editar (el gerente)', (metodo) => {
    expect(permisoDe(metodo)).toEqual([PERMISOS.CONFIGURACION_EDITAR]);
  });

  it.each(['crearDiagnostico', 'actualizarDiagnostico'] as const)('%s pide sst.gestionar', (metodo) => {
    expect(permisoDe(metodo)).toEqual([PERMISOS.SST_GESTIONAR]);
  });

  it('toda ruta del controlador declara un permiso', () => {
    const metodos = Object.getOwnPropertyNames(CatalogosAusentismoController.prototype).filter((nombre) => nombre !== 'constructor');
    expect(metodos).toHaveLength(6);
    for (const metodo of metodos) {
      expect(permisoDe(metodo as keyof CatalogosAusentismoController), metodo).toBeDefined();
    }
  });

  it('es solo para usuarios con alcance total', () => {
    expect(Reflect.getMetadata(ALCANCE_TOTAL_KEY, CatalogosAusentismoController)).toBe(true);
  });
});
