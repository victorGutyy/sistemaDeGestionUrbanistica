import { describe, expect, it } from 'vitest';
import { calcularResumenAreas } from './areas.js';

describe('calcularResumenAreas (RF-PRY-04)', () => {
  it('calcula el área subdividida y la disponible', () => {
    const resumen = calcularResumenAreas('10000', ['500', '750.50', '300']);
    expect(resumen.areaTotal.toString()).toBe('10000');
    expect(resumen.areaSubdividida.toString()).toBe('1550.5');
    expect(resumen.areaDisponible.toString()).toBe('8449.5');
  });

  it('un proyecto sin lotes tiene todo el área disponible', () => {
    const resumen = calcularResumenAreas('2500.75', []);
    expect(resumen.areaSubdividida.toString()).toBe('0');
    expect(resumen.areaDisponible.toString()).toBe('2500.75');
  });

  it('si los lotes superan el área del proyecto, el disponible queda negativo (se nota, no se oculta)', () => {
    expect(calcularResumenAreas('1000', ['600', '500']).areaDisponible.toString()).toBe('-100');
  });

  it('suma decimales sin errores de punto flotante', () => {
    expect(calcularResumenAreas('1', ['0.1', '0.2']).areaSubdividida.toString()).toBe('0.3');
  });
});
