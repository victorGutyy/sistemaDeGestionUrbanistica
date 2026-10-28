import { describe, expect, it } from 'vitest';
import { exigeAfiliaciones, resolverCambioDeAfiliacion, TIPOS_AFILIACION_REQUERIDOS } from './afiliaciones.js';

const VIGENTE = { id: 'a-1', entidadId: 'eps-a', claseRiesgoId: null, fechaInicio: new Date(2026, 0, 15) };

describe('resolverCambioDeAfiliacion (RF-PER-04)', () => {
  it('sin afiliación vigente no hay nada que cerrar', () => {
    expect(resolverCambioDeAfiliacion(null, { entidadId: 'eps-a', claseRiesgoId: null, fechaInicio: new Date(2026, 0, 1) })).toEqual({ ok: true, cerrar: null });
  });

  it('cambiar de entidad cierra la vigente el día anterior al inicio de la nueva', () => {
    const resultado = resolverCambioDeAfiliacion(VIGENTE, { entidadId: 'eps-b', claseRiesgoId: null, fechaInicio: new Date(2026, 6, 1) });
    expect(resultado).toEqual({ ok: true, cerrar: { id: 'a-1', fechaFin: new Date(2026, 5, 30) } });
  });

  it('el día anterior se calcula bien al pasar de mes y de año', () => {
    const alMesAnterior = resolverCambioDeAfiliacion(VIGENTE, { entidadId: 'eps-b', claseRiesgoId: null, fechaInicio: new Date(2026, 2, 1) });
    expect(alMesAnterior).toMatchObject({ ok: true, cerrar: { fechaFin: new Date(2026, 1, 28) } });
    const alAnioAnterior = resolverCambioDeAfiliacion({ ...VIGENTE, fechaInicio: new Date(2025, 5, 1) }, { entidadId: 'eps-b', claseRiesgoId: null, fechaInicio: new Date(2026, 0, 1) });
    expect(alAnioAnterior).toMatchObject({ ok: true, cerrar: { fechaFin: new Date(2025, 11, 31) } });
  });

  it('registrar la misma entidad y la misma clase de riesgo no cambia nada: se rechaza', () => {
    const resultado = resolverCambioDeAfiliacion(VIGENTE, { entidadId: 'eps-a', claseRiesgoId: null, fechaInicio: new Date(2026, 6, 1) });
    expect(resultado).toMatchObject({ ok: false, error: expect.stringMatching(/ya tiene esa afiliación/) });
  });

  it('la misma ARL con otra clase de riesgo sí es un cambio', () => {
    const arl = { id: 'a-2', entidadId: 'arl-a', claseRiesgoId: 'clase-1', fechaInicio: new Date(2026, 0, 15) };
    expect(resolverCambioDeAfiliacion(arl, { entidadId: 'arl-a', claseRiesgoId: 'clase-3', fechaInicio: new Date(2026, 6, 1) })).toMatchObject({ ok: true, cerrar: { id: 'a-2' } });
  });

  it('la nueva debe empezar después de la vigente (ni el mismo día ni antes)', () => {
    for (const inicio of [new Date(2026, 0, 15), new Date(2026, 0, 10)]) {
      const resultado = resolverCambioDeAfiliacion(VIGENTE, { entidadId: 'eps-b', claseRiesgoId: null, fechaInicio: inicio });
      expect(resultado).toMatchObject({ ok: false, error: expect.stringContaining('15/01/2026') });
    }
  });
});

describe('afiliaciones exigidas', () => {
  it('se exigen las cinco: EPS, pensión, cesantías, ARL y caja', () => {
    expect([...TIPOS_AFILIACION_REQUERIDOS].sort()).toEqual(['AFP', 'ARL', 'CAJA', 'CESANTIAS', 'EPS']);
  });

  it('quien presta servicios por su cuenta no las necesita; los demás contratos sí', () => {
    expect(exigeAfiliaciones('PRESTACION_SERVICIOS')).toBe(false);
    for (const contrato of ['OBRA_LABOR', 'TERMINO_FIJO', 'TERMINO_INDEFINIDO'] as const) {
      expect(exigeAfiliaciones(contrato), contrato).toBe(true);
    }
  });
});
