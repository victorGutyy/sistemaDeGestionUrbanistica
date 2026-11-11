import { describe, expect, it } from 'vitest';
import { CLAVE_GERENTE, PERMISOS, ROLES_SISTEMA } from '../auth/permisos.js';
import { PERMISOS_KEY } from '../auth/roles.decorator.js';
import { NominaController } from './nomina.controller.js';

const permisoDe = (metodo: keyof NominaController) => Reflect.getMetadata(PERMISOS_KEY, NominaController.prototype[metodo]) as string[] | undefined;
const permisosDe = (clave: string) => ROLES_SISTEMA.find((rol) => rol.clave === clave)?.permisos ?? [];

describe('NominaController: permisos declarados (CC-05)', () => {
  it.each([
    ['crearPago', PERMISOS.NOMINA_GESTIONAR],
    ['liquidarQuincena', PERMISOS.NOMINA_GESTIONAR],
    ['listarPagos', PERMISOS.NOMINA_VER],
    ['listarCargos', PERMISOS.NOMINA_VER],
    ['crearCargo', PERMISOS.NOMINA_GESTIONAR],
    ['actualizarCargo', PERMISOS.NOMINA_GESTIONAR],
  ] as const)('%s pide %s', (metodo, permiso) => {
    expect(permisoDe(metodo)).toEqual([permiso]);
  });

  it('toda ruta del controlador declara un permiso', () => {
    const metodos = Object.getOwnPropertyNames(NominaController.prototype).filter((nombre) => nombre !== 'constructor');
    expect(metodos.length).toBeGreaterThanOrEqual(6);
    for (const metodo of metodos) expect(permisoDe(metodo as keyof NominaController), metodo).toBeDefined();
  });
});

// El administrador es quien liquida la nómina: comparte con el gerente el control de los cargos y sus valores día, sin tener
// que abrir Configuración (que sigue siendo solo del gerente).
describe('Quién administra los cargos de nómina', () => {
  it('el gerente y el administrador pueden crearlos y cambiarlos', () => {
    expect(permisosDe(CLAVE_GERENTE)).toContain(PERMISOS.NOMINA_GESTIONAR);
    expect(permisosDe('ADMINISTRADOR')).toContain(PERMISOS.NOMINA_GESTIONAR);
  });

  it('el administrador sigue sin poder editar la configuración de la empresa', () => {
    expect(permisosDe('ADMINISTRADOR')).not.toContain(PERMISOS.CONFIGURACION_EDITAR);
  });

  it('el contratista SST y Consulta no ven ni administran cargos (ni ningún dato de nómina)', () => {
    for (const clave of ['CONTRATISTA_SST', 'CONSULTA']) {
      expect(permisosDe(clave), clave).not.toContain(PERMISOS.NOMINA_VER);
      expect(permisosDe(clave), clave).not.toContain(PERMISOS.NOMINA_GESTIONAR);
    }
  });
});
