import { describe, expect, it } from 'vitest';
import { PERMISOS } from '../auth/permisos.js';
import { ALCANCE_TOTAL_KEY, PERMISOS_KEY } from '../auth/roles.decorator.js';
import { CapacitacionesController } from './capacitaciones.controller.js';
import { PlanTrabajoController } from './plan-trabajo.controller.js';

// Ver es de sst.ver; escribir, de sst.gestionar. Consulta no recibe ninguno de los dos (RF-USR-11).
function permisoDe<T extends object>(controlador: { prototype: T }, metodo: keyof T) {
  return Reflect.getMetadata(PERMISOS_KEY, controlador.prototype[metodo] as object) as string[] | undefined;
}

describe('PlanTrabajoController: permisos declarados', () => {
  it.each(['listar', 'buscar', 'listarDocumentos', 'descargarDocumento'] as const)('%s pide solo sst.ver', (metodo) => {
    expect(permisoDe(PlanTrabajoController, metodo)).toEqual([PERMISOS.SST_VER]);
  });

  it.each(['crear', 'copiar', 'actualizar', 'subirDocumento'] as const)('%s pide sst.gestionar', (metodo) => {
    expect(permisoDe(PlanTrabajoController, metodo)).toEqual([PERMISOS.SST_GESTIONAR]);
  });

  it('toda ruta declara un permiso y es solo para alcance total', () => {
    const metodos = Object.getOwnPropertyNames(PlanTrabajoController.prototype).filter((nombre) => nombre !== 'constructor');
    expect(metodos.length).toBeGreaterThanOrEqual(8);
    for (const metodo of metodos) {
      expect(permisoDe(PlanTrabajoController, metodo as keyof PlanTrabajoController), metodo).toBeDefined();
    }
    expect(Reflect.getMetadata(ALCANCE_TOTAL_KEY, PlanTrabajoController)).toBe(true);
  });
});

describe('CapacitacionesController: permisos declarados', () => {
  it.each(['listar', 'buscar', 'listarDocumentos', 'descargarDocumento'] as const)('%s pide solo sst.ver', (metodo) => {
    expect(permisoDe(CapacitacionesController, metodo)).toEqual([PERMISOS.SST_VER]);
  });

  it.each(['crear', 'actualizar', 'registrarAsistentes', 'actualizarAsistencia', 'anularAsistencia', 'subirDocumento'] as const)('%s pide sst.gestionar', (metodo) => {
    expect(permisoDe(CapacitacionesController, metodo)).toEqual([PERMISOS.SST_GESTIONAR]);
  });

  it('toda ruta declara un permiso y es solo para alcance total', () => {
    const metodos = Object.getOwnPropertyNames(CapacitacionesController.prototype).filter((nombre) => nombre !== 'constructor');
    expect(metodos.length).toBeGreaterThanOrEqual(10);
    for (const metodo of metodos) {
      expect(permisoDe(CapacitacionesController, metodo as keyof CapacitacionesController), metodo).toBeDefined();
    }
    expect(Reflect.getMetadata(ALCANCE_TOTAL_KEY, CapacitacionesController)).toBe(true);
  });
});
