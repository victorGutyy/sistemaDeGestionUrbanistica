import { describe, expect, it } from 'vitest';
import { PERMISOS } from '../auth/permisos.js';
import { ALCANCE_TOTAL_KEY, PERMISOS_KEY } from '../auth/roles.decorator.js';
import { ReportesSstController } from './reportes-sst.controller.js';

const permisoDe = (metodo: keyof ReportesSstController) => Reflect.getMetadata(PERMISOS_KEY, ReportesSstController.prototype[metodo]) as string[] | undefined;

// Los reportes de SST los usa quien usa el módulo (sst.ver). Qué se ve dentro de cada uno (los valores del ausentismo) lo
// decide el servicio, no la ruta: el contratista entra, pero sin valores.
describe('ReportesSstController: permisos declarados (RF-SST-22, RNF-SEG-08)', () => {
  it.each(['catalogo', 'generar', 'exportar'] as const)('%s pide solo sst.ver', (metodo) => {
    expect(permisoDe(metodo)).toEqual([PERMISOS.SST_VER]);
  });

  it('toda ruta del controlador declara un permiso', () => {
    const metodos = Object.getOwnPropertyNames(ReportesSstController.prototype).filter((nombre) => nombre !== 'constructor');
    expect(metodos).toHaveLength(3);
    for (const metodo of metodos) {
      expect(permisoDe(metodo as keyof ReportesSstController), metodo).toBeDefined();
    }
  });

  it('es solo para usuarios con alcance total', () => {
    expect(Reflect.getMetadata(ALCANCE_TOTAL_KEY, ReportesSstController)).toBe(true);
  });
});
