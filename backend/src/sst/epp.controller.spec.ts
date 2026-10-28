import { describe, expect, it } from 'vitest';
import { PERMISOS } from '../auth/permisos.js';
import { ALCANCE_TOTAL_KEY, PERMISOS_KEY } from '../auth/roles.decorator.js';
import { EppController } from './epp.controller.js';

// Ver es de sst.ver (lo usa el contratista, el administrador y el gerente); escribir, de sst.gestionar. Consulta no recibe
// ninguno de los dos. Aquí se fija cuál permiso exige cada ruta (RF-USR-11).
const permisoDe = (metodo: keyof EppController) => Reflect.getMetadata(PERMISOS_KEY, EppController.prototype[metodo]) as string[] | undefined;

describe('EppController: permisos declarados', () => {
  it.each(['listarElementos', 'reposiciones', 'listarEntregas', 'buscarEntrega', 'listarDocumentos', 'descargarDocumento'] as const)('%s pide solo sst.ver', (metodo) => {
    expect(permisoDe(metodo)).toEqual([PERMISOS.SST_VER]);
  });

  it.each(['crearElemento', 'actualizarElemento', 'registrarEntrega', 'anularEntrega', 'marcarFirma', 'subirDocumento'] as const)('%s pide sst.gestionar', (metodo) => {
    expect(permisoDe(metodo)).toEqual([PERMISOS.SST_GESTIONAR]);
  });

  it('toda ruta del controlador declara un permiso', () => {
    const metodos = Object.getOwnPropertyNames(EppController.prototype).filter((nombre) => nombre !== 'constructor');
    expect(metodos.length).toBeGreaterThanOrEqual(12);
    for (const metodo of metodos) {
      expect(permisoDe(metodo as keyof EppController), metodo).toBeDefined();
    }
  });

  it('es solo para usuarios con alcance total', () => {
    expect(Reflect.getMetadata(ALCANCE_TOTAL_KEY, EppController)).toBe(true);
  });
});
