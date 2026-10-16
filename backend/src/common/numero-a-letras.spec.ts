import { describe, expect, it } from 'vitest';
import { valorEnLetras } from './numero-a-letras.js';

describe('valorEnLetras', () => {
  it.each([
    [0, 'CERO PESOS M/CTE'],
    [1, 'UN PESO M/CTE'],
    [2, 'DOS PESOS M/CTE'],
    [15, 'QUINCE PESOS M/CTE'],
    [21, 'VEINTIÚN PESOS M/CTE'],
    [22, 'VEINTIDÓS PESOS M/CTE'],
    [31, 'TREINTA Y UN PESOS M/CTE'],
    [99, 'NOVENTA Y NUEVE PESOS M/CTE'],
    [100, 'CIEN PESOS M/CTE'],
    [101, 'CIENTO UN PESOS M/CTE'],
    [150, 'CIENTO CINCUENTA PESOS M/CTE'],
    [999, 'NOVECIENTOS NOVENTA Y NUEVE PESOS M/CTE'],
    [1000, 'MIL PESOS M/CTE'],
    [1001, 'MIL UN PESOS M/CTE'],
    [2000, 'DOS MIL PESOS M/CTE'],
    [21000, 'VEINTIÚN MIL PESOS M/CTE'],
    [31000, 'TREINTA Y UN MIL PESOS M/CTE'],
    [100000, 'CIEN MIL PESOS M/CTE'],
    [786667, 'SETECIENTOS OCHENTA Y SEIS MIL SEISCIENTOS SESENTA Y SIETE PESOS M/CTE'],
    [1000000, 'UN MILLÓN DE PESOS M/CTE'],
    [1000001, 'UN MILLÓN UN PESOS M/CTE'],
    [1500000, 'UN MILLÓN QUINIENTOS MIL PESOS M/CTE'],
    [2000000, 'DOS MILLONES DE PESOS M/CTE'],
    [21000000, 'VEINTIÚN MILLONES DE PESOS M/CTE'],
    [45000000, 'CUARENTA Y CINCO MILLONES DE PESOS M/CTE'],
    [80000000, 'OCHENTA MILLONES DE PESOS M/CTE'],
    [100000000, 'CIEN MILLONES DE PESOS M/CTE'],
    [123456789, 'CIENTO VEINTITRÉS MILLONES CUATROCIENTOS CINCUENTA Y SEIS MIL SETECIENTOS OCHENTA Y NUEVE PESOS M/CTE'],
    [1000000000, 'MIL MILLONES DE PESOS M/CTE'],
    [2100000000, 'DOS MIL CIEN MILLONES DE PESOS M/CTE'],
  ])('%d → %s', (valor, esperado) => {
    expect(valorEnLetras(valor)).toBe(esperado);
  });

  it('acepta el valor como texto o Decimal', () => {
    expect(valorEnLetras('30000000')).toBe('TREINTA MILLONES DE PESOS M/CTE');
    expect(valorEnLetras({ toString: () => '5000' })).toBe('CINCO MIL PESOS M/CTE');
  });

  it('rechaza centavos y valores negativos', () => {
    expect(() => valorEnLetras(10.5)).toThrow(RangeError);
    expect(() => valorEnLetras(-1)).toThrow(RangeError);
    expect(() => valorEnLetras('abc')).toThrow(RangeError);
  });
});
