import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { TipoMovimiento } from '../generated/prisma/enums.js';
import { validarMovimientoMaquinaria, type DatosReglasMaquinaria } from './reglas-maquinaria.js';

const EGRESO: DatosReglasMaquinaria = {
  tipo: TipoMovimiento.GASTO,
  esProyectoMaquinaria: true,
  equipoId: 'equipo-1',
  tieneSoporte: true,
};
const ALQUILER: DatosReglasMaquinaria = {
  tipo: TipoMovimiento.INGRESO,
  esProyectoMaquinaria: true,
  equipoId: 'equipo-1',
  tieneSoporte: true,
  terceroNombre: 'Cliente de Prueba',
  terceroDocumento: '1000000001',
  periodoDesde: '2026-10-01',
  periodoHasta: '2026-10-15',
};

const rechaza = (datos: DatosReglasMaquinaria, mensaje: RegExp) => {
  expect(() => validarMovimientoMaquinaria(datos)).toThrow(BadRequestException);
  expect(() => validarMovimientoMaquinaria(datos)).toThrow(mensaje);
};

describe('validarMovimientoMaquinaria · proyecto de maquinaria', () => {
  it('un egreso de un equipo con soporte, y un alquiler completo, son válidos', () => {
    expect(() => validarMovimientoMaquinaria(EGRESO)).not.toThrow();
    expect(() => validarMovimientoMaquinaria(ALQUILER)).not.toThrow();
  });

  it('un movimiento general de la flota también es válido', () => {
    expect(() => validarMovimientoMaquinaria({ ...EGRESO, equipoId: null, flota: true })).not.toThrow();
  });

  it('exige el equipo o la flota, y no las dos cosas', () => {
    rechaza({ ...EGRESO, equipoId: null }, /Indica el equipo/);
    rechaza({ ...EGRESO, flota: true }, /no las dos cosas/);
  });

  it('exige soporte o motivo a los egresos y también a los ingresos', () => {
    rechaza({ ...EGRESO, tieneSoporte: false }, /soporte adjunto o el motivo/);
    rechaza({ ...ALQUILER, tieneSoporte: false }, /soporte adjunto o el motivo/);
    expect(() => validarMovimientoMaquinaria({ ...EGRESO, tieneSoporte: false, motivoSinSoporte: 'Se pagó en efectivo sin factura' })).not.toThrow();
    rechaza({ ...EGRESO, tieneSoporte: false, motivoSinSoporte: '   ' }, /soporte adjunto o el motivo/);
  });

  it('el alquiler exige cliente (nombre y documento) y período', () => {
    rechaza({ ...ALQUILER, terceroNombre: null }, /nombre y su documento/);
    rechaza({ ...ALQUILER, terceroDocumento: '  ' }, /nombre y su documento/);
    rechaza({ ...ALQUILER, periodoDesde: null }, /período alquilado/);
    rechaza({ ...ALQUILER, periodoHasta: null }, /período alquilado/);
  });

  it('el período no puede terminar antes de empezar, pero puede ser de un solo día', () => {
    rechaza({ ...ALQUILER, periodoDesde: '2026-10-15', periodoHasta: '2026-10-01' }, /termina antes de empezar/);
    expect(() => validarMovimientoMaquinaria({ ...ALQUILER, periodoDesde: '2026-10-15', periodoHasta: '2026-10-15' })).not.toThrow();
  });

  it('un egreso no lleva período alquilado', () => {
    rechaza({ ...EGRESO, periodoDesde: '2026-10-01', periodoHasta: '2026-10-02' }, /solo aplica a los ingresos/);
  });
});

describe('validarMovimientoMaquinaria · proyecto que no es de maquinaria', () => {
  const GENERAL: DatosReglasMaquinaria = { tipo: TipoMovimiento.GASTO, esProyectoMaquinaria: false, tieneSoporte: false, motivoSinSoporte: 'Sin factura' };

  it('un movimiento normal no cambia: no pide equipo ni exige soporte a los ingresos', () => {
    expect(() => validarMovimientoMaquinaria(GENERAL)).not.toThrow();
    expect(() => validarMovimientoMaquinaria({ ...GENERAL, tipo: TipoMovimiento.INGRESO, motivoSinSoporte: null })).not.toThrow();
  });

  it('rechaza equipo, flota o período fuera de la maquinaria', () => {
    rechaza({ ...GENERAL, equipoId: 'equipo-1' }, /Solo los proyectos de maquinaria/);
    rechaza({ ...GENERAL, flota: true }, /Solo los proyectos de maquinaria/);
    rechaza({ ...GENERAL, periodoDesde: '2026-10-01', periodoHasta: '2026-10-02' }, /Solo los proyectos de maquinaria/);
  });

  it('rechaza una categoría propia de la maquinaria fuera de un proyecto de maquinaria', () => {
    rechaza({ ...GENERAL, categoriaSoloMaquinaria: 'Combustible' }, /La categoría "Combustible" es propia de la maquinaria/);
  });
});
