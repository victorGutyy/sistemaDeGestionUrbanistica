import { describe, expect, it } from 'vitest';
import { CLAVE_CONTRATISTA_SST, CLAVE_GERENTE, esPermisoValido, PERMISOS, ROLES_SISTEMA, TODOS_LOS_PERMISOS } from './permisos.js';

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

  it('solo el gerente consulta la auditoría (RF-AUD-02)', () => {
    expect(ROLES_SISTEMA.filter((r) => r.permisos.includes(PERMISOS.AUDITORIA_VER)).map((r) => r.clave)).toEqual([CLAVE_GERENTE]);
  });

  it('solo el gerente registra desistimientos', () => {
    expect(ROLES_SISTEMA.filter((r) => r.permisos.includes(PERMISOS.VENTAS_DESISTIR)).map((r) => r.clave)).toEqual([CLAVE_GERENTE]);
  });

  describe('seguridad y salud en el trabajo (CC-03, RF-USR-10 y RF-USR-11)', () => {
    const quienTiene = (permiso: string) => ROLES_SISTEMA.filter((r) => (r.permisos as string[]).includes(permiso)).map((r) => r.clave).sort();

    it('los diagnósticos los ven solo el gerente y el contratista SST: el administrador no', () => {
      expect(quienTiene(PERMISOS.SST_DIAGNOSTICOS_VER)).toEqual([CLAVE_CONTRATISTA_SST, CLAVE_GERENTE].sort());
      expect(rol('ADMINISTRADOR').permisos).not.toContain(PERMISOS.SST_DIAGNOSTICOS_VER);
    });

    it('los valores liquidados los ven el gerente y el administrador: el contratista SST no', () => {
      expect(quienTiene(PERMISOS.SST_VALORES_VER)).toEqual(['ADMINISTRADOR', CLAVE_GERENTE].sort());
      expect(rol(CLAVE_CONTRATISTA_SST).permisos).not.toContain(PERMISOS.SST_VALORES_VER);
    });

    it('el administrador ve y gestiona el módulo SST (salvo los diagnósticos)', () => {
      expect(rol('ADMINISTRADOR').permisos).toContain(PERMISOS.SST_VER);
      expect(rol('ADMINISTRADOR').permisos).toContain(PERMISOS.SST_GESTIONAR);
    });

    it('consulta no recibe ningún permiso de SST', () => {
      expect(rol('CONSULTA').permisos.some((p) => p.startsWith('sst.'))).toBe(false);
    });

    it('el contratista SST solo tiene permisos de SST: nada de dinero, nómina, proyectos ni configuración', () => {
      const { permisos, limitablePorProyecto } = rol(CLAVE_CONTRATISTA_SST);
      expect(permisos.length).toBeGreaterThan(0);
      expect(permisos.every((p) => p.startsWith('sst.'))).toBe(true);
      expect(permisos).toContain(PERMISOS.SST_VER);
      expect(permisos).toContain(PERMISOS.SST_GESTIONAR);
      expect(limitablePorProyecto).toBe(false);
    });

    it('el contratista SST es un rol del sistema con clave estable', () => {
      expect(CLAVE_CONTRATISTA_SST).toBe('CONTRATISTA_SST');
      expect(ROLES_SISTEMA.filter((r) => r.clave === CLAVE_CONTRATISTA_SST)).toHaveLength(1);
    });
  });

  it('solo el gerente puede gestionar usuarios', () => {
    const conPermiso = ROLES_SISTEMA.filter((r) => r.permisos.includes(PERMISOS.USUARIOS_GESTIONAR));
    expect(conPermiso.map((r) => r.clave)).toEqual([CLAVE_GERENTE]);
  });
});
