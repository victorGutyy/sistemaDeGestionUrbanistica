import { describe, expect, it } from 'vitest';
import { CLAVE_GERENTE, esPermisoValido, PERMISOS, ROLES_SISTEMA, TODOS_LOS_PERMISOS } from './permisos.js';

describe('catálogo de permisos y roles del sistema', () => {
  const rol = (clave: string) => {
    const encontrado = ROLES_SISTEMA.find((r) => r.clave === clave);
    if (!encontrado) throw new Error(`Falta el rol ${clave}`);
    return encontrado;
  };

  it('el catálogo no tiene permisos repetidos', () => {
    expect(new Set(TODOS_LOS_PERMISOS).size).toBe(TODOS_LOS_PERMISOS.length);
  });

  it('todos los permisos de los roles del sistema existen en el catálogo', () => {
    for (const r of ROLES_SISTEMA) {
      for (const permiso of r.permisos) {
        expect(esPermisoValido(permiso), `${r.clave} -> ${permiso}`).toBe(true);
      }
    }
  });

  it('el gerente tiene todos los permisos', () => {
    expect([...rol(CLAVE_GERENTE).permisos].sort()).toEqual([...TODOS_LOS_PERMISOS].sort());
  });

  it('el administrador opera pero no gestiona usuarios, no edita la configuración ni cambia el estado de proyectos', () => {
    const { permisos } = rol('ADMINISTRADOR');
    expect(permisos).toContain(PERMISOS.ABONOS_REGISTRAR);
    expect(permisos).toContain(PERMISOS.NOMINA_GESTIONAR);
    expect(permisos).not.toContain(PERMISOS.USUARIOS_GESTIONAR);
    expect(permisos).not.toContain(PERMISOS.VENTAS_AUTORIZAR);
    expect(permisos).not.toContain(PERMISOS.VENTAS_DESISTIR);
    expect(permisos).not.toContain(PERMISOS.CONFIGURACION_EDITAR);
    expect(permisos).not.toContain(PERMISOS.PROYECTOS_CAMBIAR_ESTADO);
  });

  it('consulta solo tiene permisos de lectura de proyectos: nada de nómina, configuración ni escritura', () => {
    const { permisos } = rol('CONSULTA');
    expect(permisos.every((p) => p.endsWith('.ver'))).toBe(true);
    expect(permisos).not.toContain(PERMISOS.NOMINA_VER);
    expect(permisos).not.toContain(PERMISOS.CONFIGURACION_VER);
    expect(rol('CONSULTA').limitablePorProyecto).toBe(true);
  });

  it('solo el gerente autoriza las excepciones de venta', () => {
    expect(ROLES_SISTEMA.filter((r) => r.permisos.includes(PERMISOS.VENTAS_AUTORIZAR)).map((r) => r.clave)).toEqual([CLAVE_GERENTE]);
  });

  it('solo el gerente anula abonos y recibos (RF-REC-07)', () => {
    expect(ROLES_SISTEMA.filter((r) => r.permisos.includes(PERMISOS.ABONOS_ANULAR)).map((r) => r.clave)).toEqual([CLAVE_GERENTE]);
  });

  it('solo el gerente anula egresos e ingresos (RF-EGR-04)', () => {
    expect(ROLES_SISTEMA.filter((r) => r.permisos.includes(PERMISOS.FINANZAS_ANULAR)).map((r) => r.clave)).toEqual([CLAVE_GERENTE]);
  });

  it('el administrador ve y cierra la caja, pero solo el gerente aprueba los cierres (RF-CAJ-04)', () => {
    const { permisos } = rol('ADMINISTRADOR');
    expect(permisos).toContain(PERMISOS.CAJA_VER);
    expect(permisos).toContain(PERMISOS.CAJA_CERRAR);
    expect(permisos).not.toContain(PERMISOS.CAJA_APROBAR);
    expect(ROLES_SISTEMA.filter((r) => r.permisos.includes(PERMISOS.CAJA_APROBAR)).map((r) => r.clave)).toEqual([CLAVE_GERENTE]);
    expect(rol('CONSULTA').permisos.some((p) => p.startsWith('caja.'))).toBe(false);
  });

  it('solo el gerente registra desistimientos', () => {
    expect(ROLES_SISTEMA.filter((r) => r.permisos.includes(PERMISOS.VENTAS_DESISTIR)).map((r) => r.clave)).toEqual([CLAVE_GERENTE]);
  });

  it('solo el gerente puede gestionar usuarios', () => {
    const conPermiso = ROLES_SISTEMA.filter((r) => r.permisos.includes(PERMISOS.USUARIOS_GESTIONAR));
    expect(conPermiso.map((r) => r.clave)).toEqual([CLAVE_GERENTE]);
  });
});
