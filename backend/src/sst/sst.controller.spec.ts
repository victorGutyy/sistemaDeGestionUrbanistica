import { describe, expect, it } from 'vitest';
import { PERMISOS } from '../auth/permisos.js';
import { ALCANCE_TOTAL_KEY, PERMISOS_KEY } from '../auth/roles.decorator.js';
import { SstController } from './sst.controller.js';

const permisoDe = (metodo: keyof SstController) => Reflect.getMetadata(PERMISOS_KEY, SstController.prototype[metodo]) as string[] | undefined;

describe('SstController: permisos declarados', () => {
  it('el resumen y el historial de avisos piden solo sst.ver', () => {
    expect(permisoDe('resumen')).toEqual([PERMISOS.SST_VER]);
    expect(permisoDe('listarAvisos')).toEqual([PERMISOS.SST_VER]);
  });

  it('enviar los avisos ahora pide sst.gestionar', () => {
    expect(permisoDe('ejecutarAvisos')).toEqual([PERMISOS.SST_GESTIONAR]);
  });

  it('toda ruta declara un permiso y es solo para alcance total', () => {
    const metodos = Object.getOwnPropertyNames(SstController.prototype).filter((nombre) => nombre !== 'constructor');
    expect(metodos).toHaveLength(3);
    for (const metodo of metodos) {
      expect(permisoDe(metodo as keyof SstController), metodo).toBeDefined();
    }
    expect(Reflect.getMetadata(ALCANCE_TOTAL_KEY, SstController)).toBe(true);
  });
});
