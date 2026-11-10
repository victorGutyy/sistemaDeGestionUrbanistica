import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { TipoNovedad } from '../generated/prisma/enums.js';
import { calcularPagoPorDias, calcularValorPagado, MAXIMO_DIAS_POR_PAGO, MAXIMO_HORAS_EXTRA_POR_PAGO } from './calculo-pago.js';

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

  it('un anticipo resta igual que un descuento (CC-05)', () => {
    const valor = calcularValorPagado(new Prisma.Decimal('1500000'), [{ tipo: TipoNovedad.ANTICIPO, valor: new Prisma.Decimal('200000') }]);
    expect(valor.toString()).toBe('1300000');
  });
});

describe('calcularPagoPorDias (CC-05)', () => {
  const D = (valor: string) => new Prisma.Decimal(valor);

  it('liquida días por valor día, sin horas extra ni novedades', () => {
    const r = calcularPagoPorDias({ dias: D('15'), valorDia: D('60000') });
    expect(r.valorDias.toString()).toBe('900000');
    expect(r.valorHorasExtra.toString()).toBe('0');
    expect(r.valorDevengado.toString()).toBe('900000');
    expect(r.valorPagado.toString()).toBe('900000');
  });

  it('admite medios días', () => {
    const r = calcularPagoPorDias({ dias: D('7.5'), valorDia: D('60000') });
    expect(r.valorDias.toString()).toBe('450000');
  });

  it('redondea al peso más cercano, la mitad hacia arriba', () => {
    // 0,5 día x 100.001 = 50.000,5 -> 50.001
    expect(calcularPagoPorDias({ dias: D('0.5'), valorDia: D('100001') }).valorDias.toString()).toBe('50001');
    // 1,5 días x 66.667 = 100.000,5 -> 100.001
    expect(calcularPagoPorDias({ dias: D('1.5'), valorDia: D('66667') }).valorDias.toString()).toBe('100001');
  });

  it('suma las horas extra con la tarifa digitada al devengado', () => {
    const r = calcularPagoPorDias({ dias: D('10'), valorDia: D('50000'), horasExtra: D('4'), valorHoraExtra: D('9000') });
    expect(r.valorDias.toString()).toBe('500000');
    expect(r.valorHorasExtra.toString()).toBe('36000');
    expect(r.valorDevengado.toString()).toBe('536000');
    expect(r.valorPagado.toString()).toBe('536000');
  });

  it('acepta horas extra con un decimal y las redondea a pesos', () => {
    const r = calcularPagoPorDias({ dias: D('1'), valorDia: D('50000'), horasExtra: D('2.5'), valorHoraExtra: D('7001') });
    expect(r.valorHorasExtra.toString()).toBe('17503'); // 17.502,5 -> 17.503
  });

  it('el devengado (costo de la obra) no baja con descuentos y anticipos, pero lo pagado sí', () => {
    const r = calcularPagoPorDias({
      dias: D('12'),
      valorDia: D('50000'),
      novedades: [
        { tipo: TipoNovedad.ANTICIPO, valor: D('100000') },
        { tipo: TipoNovedad.DESCUENTO, valor: D('20000') },
      ],
    });
    expect(r.valorDevengado.toString()).toBe('600000');
    expect(r.valorPagado.toString()).toBe('480000');
  });

  it('las horas extra en pesos de una novedad suman al pagado', () => {
    const r = calcularPagoPorDias({ dias: D('10'), valorDia: D('50000'), novedades: [{ tipo: TipoNovedad.HORAS_EXTRA, valor: D('30000') }] });
    expect(r.valorPagado.toString()).toBe('530000');
  });

  it('rechaza un pago que quedaría negativo por descuentos y anticipos', () => {
    expect(() => calcularPagoPorDias({ dias: D('1'), valorDia: D('50000'), novedades: [{ tipo: TipoNovedad.ANTICIPO, valor: D('50001') }] })).toThrow(/superan lo devengado/);
  });

  it('un pago que queda exactamente en cero se permite', () => {
    const r = calcularPagoPorDias({ dias: D('1'), valorDia: D('50000'), novedades: [{ tipo: TipoNovedad.ANTICIPO, valor: D('50000') }] });
    expect(r.valorPagado.toString()).toBe('0');
  });

  it.each(['0', '-1', '7.25', '0.3', '31.5'])('rechaza los días %s', (dias) => {
    expect(() => calcularPagoPorDias({ dias: D(dias), valorDia: D('50000') })).toThrow(BadRequestException);
  });

  it('acepta el máximo de días y rechaza uno más', () => {
    expect(() => calcularPagoPorDias({ dias: D(String(MAXIMO_DIAS_POR_PAGO)), valorDia: D('50000') })).not.toThrow();
    expect(() => calcularPagoPorDias({ dias: D(String(MAXIMO_DIAS_POR_PAGO + 1)), valorDia: D('50000') })).toThrow(/no pueden pasar de/);
  });

  it.each(['0', '-50000'])('rechaza el valor día %s', (valorDia) => {
    expect(() => calcularPagoPorDias({ dias: D('5'), valorDia: D(valorDia) })).toThrow(/valor del día/);
  });

  it('exige tarifa cuando hay horas extra', () => {
    expect(() => calcularPagoPorDias({ dias: D('5'), valorDia: D('50000'), horasExtra: D('3') })).toThrow(/sin tarifa/);
  });

  it('rechaza horas extra negativas, con más de un decimal o sobre el máximo', () => {
    const base = { dias: D('5'), valorDia: D('50000'), valorHoraExtra: D('9000') };
    expect(() => calcularPagoPorDias({ ...base, horasExtra: D('-1') })).toThrow(/negativas/);
    expect(() => calcularPagoPorDias({ ...base, horasExtra: D('2.25') })).toThrow(/un solo decimal/);
    expect(() => calcularPagoPorDias({ ...base, horasExtra: D(String(MAXIMO_HORAS_EXTRA_POR_PAGO + 1)) })).toThrow(/no pueden pasar de/);
  });

  it('rechaza una tarifa de hora extra negativa', () => {
    expect(() => calcularPagoPorDias({ dias: D('5'), valorDia: D('50000'), horasExtra: D('1'), valorHoraExtra: D('-1') })).toThrow(/no puede ser negativo/);
  });

  it('una misma persona en dos obras de la quincena suma sus días en pagos separados', () => {
    // Cada obra es un pago propio: lo que cuesta cada obra es su devengado, y la caja ve un pago por obra.
    const obraA = calcularPagoPorDias({ dias: D('9'), valorDia: D('55000') });
    const obraB = calcularPagoPorDias({ dias: D('6'), valorDia: D('55000') });
    expect(obraA.valorDevengado.toString()).toBe('495000');
    expect(obraB.valorDevengado.toString()).toBe('330000');
    expect(obraA.valorPagado.plus(obraB.valorPagado).toString()).toBe('825000');
  });
});
