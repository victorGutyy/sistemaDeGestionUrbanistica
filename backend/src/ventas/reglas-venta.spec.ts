import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { FormaPago } from '../generated/prisma/enums.js';
import { aPesos, calcularCuotaInicial, cuotaInicialMinima, evaluarExcepcion, type ParametrosVenta } from './reglas-venta.js';

const D = (valor: string) => new Prisma.Decimal(valor);
const PARAMETROS: ParametrosVenta = { porcentajeCuotaInicial: D('30'), plazoMaximoMeses: 12, tasaFinanciacionMensual: D('0') };

describe('calcularCuotaInicial', () => {
  it('en una venta de contado la cuota inicial es el valor total', () => {
    expect(calcularCuotaInicial({ formaPago: FormaPago.CONTADO, valorTotal: D('80000000') }, PARAMETROS).toString()).toBe('80000000');
  });

  it('sin indicar nada usa el porcentaje configurado (30 %)', () => {
    expect(calcularCuotaInicial({ formaPago: FormaPago.FINANCIADO, valorTotal: D('80000000') }, PARAMETROS).toString()).toBe('24000000');
  });

  it('acepta el valor directo', () => {
    expect(
      calcularCuotaInicial({ formaPago: FormaPago.FINANCIADO, valorTotal: D('80000000'), cuotaInicial: D('10000000') }, PARAMETROS).toString(),
    ).toBe('10000000');
  });

  it('acepta un porcentaje y lo redondea a pesos enteros', () => {
    expect(
      calcularCuotaInicial({ formaPago: FormaPago.FINANCIADO, valorTotal: D('33333333'), cuotaInicialPorcentaje: D('30') }, PARAMETROS).toString(),
    ).toBe('10000000'); // 9,999,999.9 -> 10,000,000
  });

  it('rechaza indicar el valor y el porcentaje a la vez', () => {
    expect(() =>
      calcularCuotaInicial(
        { formaPago: FormaPago.FINANCIADO, valorTotal: D('80000000'), cuotaInicial: D('1'), cuotaInicialPorcentaje: D('30') },
        PARAMETROS,
      ),
    ).toThrow(BadRequestException);
  });
});

describe('evaluarExcepcion (RF-VEN-05)', () => {
  const base = { formaPago: FormaPago.FINANCIADO, valorTotal: D('100000000'), cuotaInicial: D('30000000'), numeroCuotas: 12 };

  it('exactamente el 30 % y 12 cuotas no es excepción (los límites están permitidos)', () => {
    expect(evaluarExcepcion(base, PARAMETROS)).toEqual({ esExcepcion: false, razones: [] });
  });

  it('cuota inicial de un peso menos del mínimo es excepción', () => {
    const resultado = evaluarExcepcion({ ...base, cuotaInicial: D('29999999') }, PARAMETROS);
    expect(resultado.esExcepcion).toBe(true);
    expect(resultado.razones).toHaveLength(1);
  });

  it('plazo de 13 cuotas con máximo 12 es excepción', () => {
    const resultado = evaluarExcepcion({ ...base, numeroCuotas: 13 }, PARAMETROS);
    expect(resultado.esExcepcion).toBe(true);
    expect(resultado.razones[0]).toMatch(/supera el máximo de 12/);
  });

  it('cuota inicial baja y plazo largo a la vez dan las dos razones', () => {
    expect(evaluarExcepcion({ ...base, cuotaInicial: D('10000000'), numeroCuotas: 24 }, PARAMETROS).razones).toHaveLength(2);
  });

  it('una venta de contado nunca es excepción', () => {
    expect(evaluarExcepcion({ ...base, formaPago: FormaPago.CONTADO, cuotaInicial: D('100000000'), numeroCuotas: null }, PARAMETROS).esExcepcion).toBe(false);
  });

  it('respeta un porcentaje distinto configurado por el gerente', () => {
    const exigente = { ...PARAMETROS, porcentajeCuotaInicial: D('40') };
    expect(evaluarExcepcion(base, exigente).esExcepcion).toBe(true);
    expect(cuotaInicialMinima(D('100000000'), exigente).toString()).toBe('40000000');
  });

  it('el porcentaje redondeado a pesos no genera una excepción falsa', () => {
    // 30 % de 33,333,333 = 9,999,999.9 -> el mínimo es 10,000,000 y esa cuota inicial pasa.
    const resultado = evaluarExcepcion(
      { formaPago: FormaPago.FINANCIADO, valorTotal: D('33333333'), cuotaInicial: D('10000000'), numeroCuotas: 12 },
      PARAMETROS,
    );
    expect(resultado.esExcepcion).toBe(false);
  });
});

describe('aPesos', () => {
  it('redondea a pesos enteros (mitad hacia arriba)', () => {
    expect(aPesos(D('666666.5')).toString()).toBe('666667');
    expect(aPesos(D('666666.49')).toString()).toBe('666666');
  });
});
