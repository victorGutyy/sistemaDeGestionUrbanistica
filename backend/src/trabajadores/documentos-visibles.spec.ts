import { describe, expect, it } from 'vitest';
import { PERMISOS } from '../auth/permisos.js';
import { puedeSubirTipoDocumento, tiposDocumentoVisibles } from './documentos-visibles.js';

const CONTRATISTA = [PERMISOS.SST_VER, PERMISOS.SST_GESTIONAR, PERMISOS.SST_DIAGNOSTICOS_VER];
const ADMINISTRADOR = [PERMISOS.NOMINA_VER, PERMISOS.NOMINA_GESTIONAR, PERMISOS.SST_VER, PERMISOS.SST_GESTIONAR];

describe('documentos del trabajador visibles por rol (RF-PER-06, RNF-SEG-05)', () => {
  it('el contratista SST ve solo certificados de afiliación y autorizaciones: no el contrato', () => {
    expect([...tiposDocumentoVisibles(CONTRATISTA)].sort()).toEqual(['AUTORIZACION_DATOS', 'CERTIFICADO_AFILIACION']);
  });

  it('quien ve la nómina ve todos los tipos', () => {
    expect([...tiposDocumentoVisibles(ADMINISTRADOR)].sort()).toEqual(['AUTORIZACION_DATOS', 'CERTIFICADO_AFILIACION', 'CONTRATO', 'OTRO']);
  });

  it('sin ningún permiso solo quedan los dos tipos de SST (y la ruta ya exige sst.ver)', () => {
    expect(tiposDocumentoVisibles([])).toHaveLength(2);
  });

  it('el contratista sube certificados y autorizaciones, no contratos ni otros documentos', () => {
    expect(puedeSubirTipoDocumento('CERTIFICADO_AFILIACION', CONTRATISTA)).toBe(true);
    expect(puedeSubirTipoDocumento('AUTORIZACION_DATOS', CONTRATISTA)).toBe(true);
    expect(puedeSubirTipoDocumento('CONTRATO', CONTRATISTA)).toBe(false);
    expect(puedeSubirTipoDocumento('OTRO', CONTRATISTA)).toBe(false);
  });

  it('el administrador sube todos los tipos', () => {
    for (const tipo of ['CERTIFICADO_AFILIACION', 'AUTORIZACION_DATOS', 'CONTRATO', 'OTRO'] as const) {
      expect(puedeSubirTipoDocumento(tipo, ADMINISTRADOR), tipo).toBe(true);
    }
  });

  it('un usuario de solo lectura de SST no sube nada', () => {
    for (const tipo of ['CERTIFICADO_AFILIACION', 'CONTRATO'] as const) {
      expect(puedeSubirTipoDocumento(tipo, [PERMISOS.SST_VER, PERMISOS.NOMINA_VER]), tipo).toBe(false);
    }
  });
});
