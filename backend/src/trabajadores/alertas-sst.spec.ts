import { describe, expect, it } from 'vitest';
import { calcularAlertas, type TrabajadorParaAlertas } from './alertas-sst.js';

const COMPLETO = ['EPS', 'AFP', 'CESANTIAS', 'ARL', 'CAJA'] as const;

const trabajador = (cambios: Partial<TrabajadorParaAlertas> & { id: string }): TrabajadorParaAlertas => ({
  nombre: `Trabajador ${cambios.id}`,
  documento: `doc-${cambios.id}`,
  estado: 'ACTIVO',
  tipoContrato: 'OBRA_LABOR',
  autorizaDatosSalud: true,
  afiliacionesVigentes: COMPLETO,
  tieneCertificadoAfiliacion: true,
  ...cambios,
});

describe('calcularAlertas', () => {
  it('un trabajador con todo en regla no genera alertas', () => {
    const { resumen, trabajadores } = calcularAlertas([trabajador({ id: '1' })]);
    expect(trabajadores).toEqual([]);
    expect(resumen).toEqual({ trabajadoresRevisados: 1, conAlertas: 0, sinAfiliacionCompleta: 0, sinCertificadoAfiliacion: 0, sinAutorizacionSalud: 0 });
  });

  it('señala exactamente qué afiliaciones faltan', () => {
    const { trabajadores } = calcularAlertas([trabajador({ id: '1', afiliacionesVigentes: ['EPS', 'AFP'] })]);
    expect(trabajadores).toHaveLength(1);
    expect(trabajadores[0].afiliacionesFaltantes.sort()).toEqual(['ARL', 'CAJA', 'CESANTIAS']);
    expect(trabajadores[0].sinCertificadoAfiliacion).toBe(false);
  });

  it('señala la falta de certificado y de autorización de datos de salud, cada una por separado', () => {
    const { trabajadores, resumen } = calcularAlertas([
      trabajador({ id: '1', tieneCertificadoAfiliacion: false }),
      trabajador({ id: '2', autorizaDatosSalud: false }),
    ]);
    expect(trabajadores.map((t) => [t.trabajadorId, t.sinCertificadoAfiliacion, t.sinAutorizacionSalud])).toEqual([
      ['1', true, false],
      ['2', false, true],
    ]);
    expect(resumen).toMatchObject({ conAlertas: 2, sinAfiliacionCompleta: 0, sinCertificadoAfiliacion: 1, sinAutorizacionSalud: 1 });
  });

  it('no revisa a los retirados ni a quienes prestan servicios por su cuenta', () => {
    const { resumen, trabajadores } = calcularAlertas([
      trabajador({ id: '1', estado: 'INACTIVO', afiliacionesVigentes: [], tieneCertificadoAfiliacion: false, autorizaDatosSalud: false }),
      trabajador({ id: '2', tipoContrato: 'PRESTACION_SERVICIOS', afiliacionesVigentes: [], tieneCertificadoAfiliacion: false }),
      trabajador({ id: '3' }),
    ]);
    expect(trabajadores).toEqual([]);
    expect(resumen.trabajadoresRevisados).toBe(1);
  });

  it('ordena los trabajadores con alertas por nombre', () => {
    const { trabajadores } = calcularAlertas([
      trabajador({ id: '1', nombre: 'Zuleta', autorizaDatosSalud: false }),
      trabajador({ id: '2', nombre: 'Álvarez', autorizaDatosSalud: false }),
      trabajador({ id: '3', nombre: 'Mejía', autorizaDatosSalud: false }),
    ]);
    expect(trabajadores.map((t) => t.nombre)).toEqual(['Álvarez', 'Mejía', 'Zuleta']);
  });

  it('un trabajador sin ninguna afiliación cuenta una sola vez en el resumen', () => {
    const { resumen } = calcularAlertas([trabajador({ id: '1', afiliacionesVigentes: [], tieneCertificadoAfiliacion: false, autorizaDatosSalud: false })]);
    expect(resumen).toEqual({ trabajadoresRevisados: 1, conAlertas: 1, sinAfiliacionCompleta: 1, sinCertificadoAfiliacion: 1, sinAutorizacionSalud: 1 });
  });
});
