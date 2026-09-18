import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { TipoNovedad } from '../generated/prisma/enums.js';
import { calcularValorPagado } from './calculo-pago.js';

describe('calcularValorPagado', () => {
  it('devuelve el salario base cuando no hay novedades', () => {
    const valor = calcularValorPagado(new Prisma.Decimal('1500000'), []);
    expect(valor.toString()).toBe('1500000');
  });

  it('suma las horas extra al salario base', () => {
    const valor = calcularValorPagado(new Prisma.Decimal('1500000'), [
      { tipo: TipoNovedad.HORAS_EXTRA, valor: new Prisma.Decimal('120000') },
    ]);
    expect(valor.toString()).toBe('1620000');
  });

  it('resta descuentos e incapacidades', () => {
    const valor = calcularValorPagado(new Prisma.Decimal('1500000'), [
      { tipo: TipoNovedad.DESCUENTO, valor: new Prisma.Decimal('50000') },
      { tipo: TipoNovedad.INCAPACIDAD, valor: new Prisma.Decimal('30000') },
    ]);
    expect(valor.toString()).toBe('1420000');
  });

  it('combina varias novedades de distinto tipo', () => {
    const valor = calcularValorPagado(new Prisma.Decimal('2000000'), [
      { tipo: TipoNovedad.HORAS_EXTRA, valor: new Prisma.Decimal('200000') },
      { tipo: TipoNovedad.DESCUENTO, valor: new Prisma.Decimal('80000') },
    ]);
    expect(valor.toString()).toBe('2120000');
  });
});
