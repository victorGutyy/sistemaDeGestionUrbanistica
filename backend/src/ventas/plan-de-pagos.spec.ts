import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { generarPlanDePagos } from './plan-de-pagos.js';

// Compara por fecha calendario local, no por instante UTC: `toISOString()`
// desplaza la fecha un día en zonas horarias negativas (p.ej. América/Bogotá).
function formatearFechaLocal(fecha: Date): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

const D = (valor: string) => new Prisma.Decimal(valor);

describe('generarPlanDePagos', () => {
  it('reparte el capital en partes iguales (en pesos enteros) y suma el interés fijo a cada cuota', () => {
    const cuotas = generarPlanDePagos({
      valorTotal: D('10000000'),
      cuotaInicial: D('2000000'),
      numeroCuotas: 12,
      tasaInteres: D('1.5'),
      fechaVenta: new Date(2026, 0, 15),
    });

    expect(cuotas).toHaveLength(12);
    // capitalFinanciado = 8,000,000 -> interés fijo = 8,000,000 * 1.5% = 120,000
    // capital por cuota = 8,000,000 / 12 = 666,666.67 -> 666,667 (pesos enteros)
    expect(cuotas[0].valor.toString()).toBe('786667');
  });

  it('ninguna cuota lleva centavos', () => {
    const cuotas = generarPlanDePagos({
      valorTotal: D('100000000'),
      cuotaInicial: D('30000001'),
      numeroCuotas: 7,
      tasaInteres: D('1.37'),
      fechaVenta: new Date(2026, 0, 15),
    });

    for (const cuota of cuotas) {
      expect(cuota.valor.decimalPlaces(), `cuota ${cuota.numero}`).toBe(0);
    }
  });

  it('la suma del capital de las cuotas cuadra exacto con lo financiado: la última absorbe el residuo del redondeo', () => {
    const valorTotal = D('10000000');
    const cuotaInicial = D('2000000');
    const capitalFinanciado = valorTotal.minus(cuotaInicial);

    const cuotas = generarPlanDePagos({
      valorTotal,
      cuotaInicial,
      numeroCuotas: 12,
      tasaInteres: D('1.5'),
      fechaVenta: new Date(2026, 0, 15),
    });

    const interesPorCuota = D('120000');
    const capitalTotalSumado = cuotas.reduce((acumulado, cuota) => acumulado.plus(cuota.valor.minus(interesPorCuota)), D('0'));

    expect(capitalTotalSumado.equals(capitalFinanciado)).toBe(true);
    // 11 cuotas de 666,667 + una última de 666,663
    expect(cuotas[11].valor.minus(interesPorCuota).toString()).toBe('666663');
  });

  it('sin interés (tasa nula) el valor de la venta se reparte exacto, y 8 millones en 12 cuotas no deja centavos', () => {
    const sinInteres = generarPlanDePagos({
      valorTotal: D('12000000'),
      cuotaInicial: D('0'),
      numeroCuotas: 12,
      tasaInteres: null,
      fechaVenta: new Date(2026, 0, 15),
    });
    expect(sinInteres[0].valor.toString()).toBe('1000000');

    const conResiduo = generarPlanDePagos({
      valorTotal: D('68000000'),
      cuotaInicial: D('20000000'),
      numeroCuotas: 12,
      tasaInteres: null,
      fechaVenta: new Date(2026, 0, 15),
    });
    const suma = conResiduo.reduce((total, cuota) => total.plus(cuota.valor), D('0'));
    expect(suma.toString()).toBe('48000000');
    expect(conResiduo.every((cuota) => cuota.valor.decimalPlaces() === 0)).toBe(true);
  });

  it('vencimientos mensuales consecutivos, recortando al fin de mes cuando no existe el mismo día', () => {
    const cuotas = generarPlanDePagos({
      valorTotal: D('3000000'),
      cuotaInicial: D('0'),
      numeroCuotas: 3,
      tasaInteres: null,
      fechaVenta: new Date(2026, 0, 31), // 31 de enero de 2026
    });

    expect(formatearFechaLocal(cuotas[0].fechaVencimiento)).toBe('2026-02-28');
    expect(formatearFechaLocal(cuotas[1].fechaVencimiento)).toBe('2026-03-31');
    expect(formatearFechaLocal(cuotas[2].fechaVencimiento)).toBe('2026-04-30');
  });

  it('rechaza un número de cuotas menor o igual a cero', () => {
    expect(() =>
      generarPlanDePagos({
        valorTotal: D('1000000'),
        cuotaInicial: D('0'),
        numeroCuotas: 0,
        tasaInteres: null,
        fechaVenta: new Date(2026, 0, 15),
      }),
    ).toThrow();
  });
});
