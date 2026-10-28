import { describe, expect, it } from 'vitest';
import { PERMISOS } from '../auth/permisos.js';
import { ALCANCE_TOTAL_KEY, PERMISOS_KEY } from '../auth/roles.decorator.js';
import { SeguridadSocialController } from './seguridad-social.controller.js';

// Una ruta sin permiso declarado se rechaza para todos, pero conviene fijar CUÁL permiso exige cada una: leer los
// catálogos es del módulo SST y escribirlos es del gerente (RF-USR-11).
const permisoDe = (metodo: keyof SeguridadSocialController) => Reflect.getMetadata(PERMISOS_KEY, SeguridadSocialController.prototype[metodo]) as string[] | undefined;

describe('SeguridadSocialController: permisos declarados', () => {
  it('leer los catálogos pide solo sst.ver', () => {
    expect(permisoDe('catalogos')).toEqual([PERMISOS.SST_VER]);
  });

  it.each(['crearParametro', 'actualizarParametro', 'validarParametro', 'crearEntidad', 'actualizarEntidad', 'actualizarClaseRiesgo'] as const)(
    '%s pide configuracion.editar (solo el gerente)',
    (metodo) => {
      expect(permisoDe(metodo)).toEqual([PERMISOS.CONFIGURACION_EDITAR]);
    },
  );

  it('toda ruta del controlador declara un permiso', () => {
    const metodos = Object.getOwnPropertyNames(SeguridadSocialController.prototype).filter((nombre) => nombre !== 'constructor');
    expect(metodos.length).toBeGreaterThan(0);
    for (const metodo of metodos) {
      expect(permisoDe(metodo as keyof SeguridadSocialController), metodo).toBeDefined();
    }
  });

  it('es solo para usuarios con alcance total (no para los limitados a ciertos proyectos)', () => {
    expect(Reflect.getMetadata(ALCANCE_TOTAL_KEY, SeguridadSocialController)).toBe(true);
  });
});
