import { describe, expect, it } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';
import { generarPlanDePagos } from './plan-de-pagos.js';

// Compara por fecha calendario local, no por instante UTC: `toISOString()`
// desplaza la fecha un día en zonas horarias negativas (p.ej. América/Bogotá).
function formatearFechaLocal(fecha: Date): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

describe('generarPlanDePagos', () => {
  it('reparte el capital en partes iguales y suma el interés fijo a cada cuota', () => {
    const cuotas = generarPlanDePagos({
      valorTotal: new Prisma.Decimal('10000000'),
      cuotaInicial: new Prisma.Decimal('2000000'),
      numeroCuotas: 12,
      tasaInteres: new Prisma.Decimal('1.5'),
      fechaVenta: new Date(2026, 0, 15),
    });

    expect(cuotas).toHaveLength(12);
    // capitalFinanciado = 8,000,000 -> interés fijo = 8,000,000 * 1.5% = 120,000
    expect(cuotas[0].valor.toString()).toBe('786666.67');
  });

  it('no pierde centavos de redondeo: la suma de capital de las cuotas cuadra exacto', () => {
    const valorTotal = new Prisma.Decimal('10000000');
    const cuotaInicial = new Prisma.Decimal('2000000');
    const capitalFinanciado = valorTotal.minus(cuotaInicial);

    const cuotas = generarPlanDePagos({
      valorTotal,
      cuotaInicial,
      numeroCuotas: 12,
      tasaInteres: new Prisma.Decimal('1.5'),
      fechaVenta: new Date(2026, 0, 15),
    });

    const interesPorCuota = new Prisma.Decimal('120000');
    const capitalTotalSumado = cuotas.reduce(
      (acumulado, cuota) => acumulado.plus(cuota.valor.minus(interesPorCuota)),
      new Prisma.Decimal(0),
    );

    expect(capitalTotalSumado.equals(capitalFinanciado)).toBe(true);
  });

  it('no genera interés cuando la venta no lo tiene (tasaInteres null)', () => {
    const cuotas = generarPlanDePagos({
      valorTotal: new Prisma.Decimal('12000000'),
      cuotaInicial: new Prisma.Decimal('0'),
      numeroCuotas: 12,
      tasaInteres: null,
      fechaVenta: new Date(2026, 0, 15),
    });

    expect(cuotas[0].valor.toString()).toBe('1000000');
  });

  it('vencimientos mensuales consecutivos, recortando al fin de mes cuando no existe el mismo día', () => {
    const cuotas = generarPlanDePagos({
      valorTotal: new Prisma.Decimal('3000000'),
      cuotaInicial: new Prisma.Decimal('0'),
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
        valorTotal: new Prisma.Decimal('1000000'),
        cuotaInicial: new Prisma.Decimal('0'),
        numeroCuotas: 0,
        tasaInteres: null,
        fechaVenta: new Date(2026, 0, 15),
      }),
    ).toThrow();
  });
});
