import { describe, expect, it } from 'vitest';
import { aporteArl, auxilioTransporteAplica, auxilioTransporteDe, errorEnTramos, salarioMaximoConAuxilio } from './calculos.js';

// Valores de prueba (no son una referencia legal): el sistema los lee del parámetro legal del año.
const PARAMETROS = { smmlv: '1000000', auxilioTransporte: '150000', topeAuxilioSmmlv: '2' };

describe('auxilio de transporte (RF-PER-18)', () => {
  it('el salario máximo con auxilio es el tope por el salario mínimo', () => {
    expect(salarioMaximoConAuxilio(PARAMETROS).toString()).toBe('2000000');
  });

  it('un salario por debajo del tope tiene auxilio', () => {
    expect(auxilioTransporteAplica('1500000', PARAMETROS)).toBe(true);
    expect(auxilioTransporteDe('1500000', PARAMETROS).toString()).toBe('150000');
  });

  it('un salario exactamente igual al tope sí tiene auxilio', () => {
    expect(auxilioTransporteAplica('2000000', PARAMETROS)).toBe(true);
  });

  it('un salario un peso por encima del tope no tiene auxilio y el valor es cero', () => {
    expect(auxilioTransporteAplica('2000001', PARAMETROS)).toBe(false);
    expect(auxilioTransporteDe('2000001', PARAMETROS).toString()).toBe('0');
  });

  it('respeta un tope distinto al de dos salarios mínimos (es un parámetro, no una constante)', () => {
    const tresMinimos = { ...PARAMETROS, topeAuxilioSmmlv: '3' };
    expect(auxilioTransporteAplica('2500000', tresMinimos)).toBe(true);
    expect(auxilioTransporteAplica('3000001', tresMinimos)).toBe(false);
  });

  it('acepta decimales y números sin errores de punto flotante', () => {
    const conDecimales = { smmlv: '1750905', auxilioTransporte: '249095', topeAuxilioSmmlv: 2.5 };
    expect(salarioMaximoConAuxilio(conDecimales).toString()).toBe('4377262.5');
    expect(auxilioTransporteAplica(4377262.5, conDecimales)).toBe(true);
    expect(auxilioTransporteAplica('4377262.51', conDecimales)).toBe(false);
  });
});

describe('aporte a la ARL (RF-PER-18)', () => {
  it('multiplica la base por la tasa de la clase de riesgo (en porcentaje)', () => {
    expect(aporteArl('1000000', '6.96').toString()).toBe('69600');
    expect(aporteArl('2000000', '0.522').toString()).toBe('10440');
  });

  it('redondea a pesos enteros, hacia arriba desde la mitad', () => {
    // 1.750.905 x 0,522 % = 9.139,7241
    expect(aporteArl('1750905', '0.522').toString()).toBe('9140');
    // 1.000 x 0,5 % = 5 exactos; 1.010 x 0,5 % = 5,05 -> 5; 1.100 x 0,5 % = 5,5 -> 6
    expect(aporteArl('1000', '0.5').toString()).toBe('5');
    expect(aporteArl('1010', '0.5').toString()).toBe('5');
    expect(aporteArl('1100', '0.5').toString()).toBe('6');
  });

  it('con tasa cero o base cero el aporte es cero', () => {
    expect(aporteArl('1000000', '0').toString()).toBe('0');
    expect(aporteArl('0', '6.96').toString()).toBe('0');
  });
});

describe('tramos de días de una incapacidad', () => {
  it('acepta tramos en orden', () => {
    expect(errorEnTramos({ diasEmpleador: 2, diasTramo1Hasta: 90, diasTramo2Hasta: 180 })).toBeNull();
    expect(errorEnTramos({ diasEmpleador: 0, diasTramo1Hasta: 1, diasTramo2Hasta: 2 })).toBeNull();
  });

  it('rechaza días del empleador negativos', () => {
    expect(errorEnTramos({ diasEmpleador: -1, diasTramo1Hasta: 90, diasTramo2Hasta: 180 })).toMatch(/negativos/);
  });

  it('rechaza un primer tramo que no pasa de los días del empleador', () => {
    expect(errorEnTramos({ diasEmpleador: 90, diasTramo1Hasta: 90, diasTramo2Hasta: 180 })).toMatch(/empleador/);
  });

  it('rechaza un segundo tramo que no pasa del primero', () => {
    expect(errorEnTramos({ diasEmpleador: 2, diasTramo1Hasta: 180, diasTramo2Hasta: 90 })).toMatch(/segundo/);
    expect(errorEnTramos({ diasEmpleador: 2, diasTramo1Hasta: 90, diasTramo2Hasta: 90 })).toMatch(/segundo/);
  });
});
