import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { FormaPago } from '../generated/prisma/enums.js';
import { aPesos, calcularCuotaInicial, evaluarExcepcion, type ParametrosVenta } from './reglas-venta.js';

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

describe('evaluarExcepcion (RF-VEN-05, ajustado por CC-04)', () => {
  const base = { formaPago: FormaPago.FINANCIADO, numeroCuotas: 12 };

  it('12 cuotas con máximo 12 no es excepción (el límite está permitido)', () => {
    expect(evaluarExcepcion(base, PARAMETROS)).toEqual({ esExcepcion: false, razones: [] });
  });

  it('plazo de 13 cuotas con máximo 12 es excepción', () => {
    const resultado = evaluarExcepcion({ ...base, numeroCuotas: 13 }, PARAMETROS);
    expect(resultado.esExcepcion).toBe(true);
    expect(resultado.razones).toHaveLength(1);
    expect(resultado.razones[0]).toMatch(/supera el máximo de 12/);
  });

  it('una venta de contado nunca es excepción', () => {
    expect(evaluarExcepcion({ formaPago: FormaPago.CONTADO, numeroCuotas: null }, PARAMETROS).esExcepcion).toBe(false);
  });

  it('respeta un plazo máximo distinto configurado por el gerente', () => {
    const corto = { ...PARAMETROS, plazoMaximoMeses: 6 };
    expect(evaluarExcepcion(base, corto).esExcepcion).toBe(true);
    expect(evaluarExcepcion({ ...base, numeroCuotas: 6 }, corto).esExcepcion).toBe(false);
  });
});

describe('aPesos', () => {
  it('redondea a pesos enteros (mitad hacia arriba)', () => {
    expect(aPesos(D('666666.5')).toString()).toBe('666667');
    expect(aPesos(D('666666.49')).toString()).toBe('666666');
  });
});
