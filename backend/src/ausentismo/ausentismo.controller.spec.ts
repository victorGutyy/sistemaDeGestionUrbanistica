import { describe, expect, it } from 'vitest';
import { PERMISOS } from '../auth/permisos.js';
import { ALCANCE_TOTAL_KEY, PERMISOS_KEY } from '../auth/roles.decorator.js';
import { AusentismoController } from './ausentismo.controller.js';

// Ver el módulo es de sst.ver y registrar, de sst.gestionar. Qué se ve dentro de cada respuesta (diagnósticos y valores) lo
// decide el servicio. Corregir la liquidación exige gestionar Y poder ver valores; los certificados, poder ver diagnósticos.
const permisoDe = (metodo: keyof AusentismoController) => Reflect.getMetadata(PERMISOS_KEY, AusentismoController.prototype[metodo]) as string[] | undefined;

describe('AusentismoController: permisos declarados (RF-USR-11, RNF-SEG-08)', () => {
  it.each(['listar', 'buscar', 'resumen', 'listarRecobros'] as const)('%s pide solo sst.ver', (metodo) => {
    expect(permisoDe(metodo)).toEqual([PERMISOS.SST_VER]);
  });

  it.each(['registrar', 'actualizar', 'anular', 'subirDocumento'] as const)('%s pide sst.gestionar', (metodo) => {
    expect(permisoDe(metodo)).toEqual([PERMISOS.SST_GESTIONAR]);
  });

  it.each(['corregirLiquidacion', 'actualizarRecobro'] as const)('%s (mueve valores) pide gestionar y poder ver los valores', (metodo) => {
    expect(permisoDe(metodo)).toEqual([PERMISOS.SST_GESTIONAR, PERMISOS.SST_VALORES_VER]);
  });

  it.each(['novedades', 'novedadesExcel'] as const)('%s (lo que se entrega a la nómina trae valores) pide sst.ver y poder ver los valores', (metodo) => {
    expect(permisoDe(metodo)).toEqual([PERMISOS.SST_VER, PERMISOS.SST_VALORES_VER]);
  });

  it.each(['listarDocumentos', 'descargarDocumento'] as const)('%s (el certificado trae el diagnóstico) pide poder ver diagnósticos', (metodo) => {
    expect(permisoDe(metodo)).toEqual([PERMISOS.SST_VER, PERMISOS.SST_DIAGNOSTICOS_VER]);
  });

  it('toda ruta del controlador declara un permiso', () => {
    const metodos = Object.getOwnPropertyNames(AusentismoController.prototype).filter((nombre) => nombre !== 'constructor');
    expect(metodos).toHaveLength(14);
    for (const metodo of metodos) {
      expect(permisoDe(metodo as keyof AusentismoController), metodo).toBeDefined();
    }
  });

  it('es solo para usuarios con alcance total', () => {
    expect(Reflect.getMetadata(ALCANCE_TOTAL_KEY, AusentismoController)).toBe(true);
  });
});
