import { describe, expect, it } from 'vitest';
import { PERMISOS } from '../auth/permisos.js';
import { ALCANCE_TOTAL_KEY, PERMISOS_KEY } from '../auth/roles.decorator.js';
import { ImportacionSstController } from './importacion-sst.controller.js';

const permisoDe = (metodo: keyof ImportacionSstController) => Reflect.getMetadata(PERMISOS_KEY, ImportacionSstController.prototype[metodo]) as string[] | undefined;

// La carga de datos de SST, como la de ventas, es de toda la empresa y solo la hace quien tiene importacion.gestionar (el gerente).
describe('ImportacionSstController: permisos declarados (RF-SST-23)', () => {
  it.each(['plantilla', 'validar', 'confirmar', 'listar'] as const)('%s pide importacion.gestionar', (metodo) => {
    expect(permisoDe(metodo)).toEqual([PERMISOS.IMPORTACION_GESTIONAR]);
  });

  it('toda ruta del controlador declara un permiso', () => {
    const metodos = Object.getOwnPropertyNames(ImportacionSstController.prototype).filter((nombre) => nombre !== 'constructor');
    expect(metodos).toHaveLength(4);
    for (const metodo of metodos) {
      expect(permisoDe(metodo as keyof ImportacionSstController), metodo).toBeDefined();
    }
  });

  it('es solo para usuarios con alcance total', () => {
    expect(Reflect.getMetadata(ALCANCE_TOTAL_KEY, ImportacionSstController)).toBe(true);
  });
});
