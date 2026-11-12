import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { FechasDeCuotasInvalidas, generarPlanDePagos } from './plan-de-pagos.js';

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

describe('generarPlanDePagos con fecha de la primera cuota', () => {
  // Contrato real de ejemplo: $55.000.000, cuota inicial $16.500.000 (separación de $7.000.000 + $9.500.000 hasta el
  // 28/12/2026) y 12 cuotas mensuales a partir de febrero de 2027, los 5 de cada mes.
  const plan = () =>
    generarPlanDePagos({
      valorTotal: D('55000000'),
      cuotaInicial: D('16500000'),
      numeroCuotas: 12,
      tasaInteres: null,
      fechaVenta: new Date(2026, 10, 12),
      fechaPrimeraCuota: new Date(2027, 1, 5),
    });

  it('la primera cuota cae en la fecha del contrato y las demás el mismo día de cada mes', () => {
    const fechas = plan().map((c) => formatearFechaLocal(c.fechaVencimiento));
    expect(fechas[0]).toBe('2027-02-05');
    expect(fechas[1]).toBe('2027-03-05');
    expect(fechas[10]).toBe('2027-12-05');
    expect(fechas[11]).toBe('2028-01-05');
  });

  it('11 cuotas de $3.208.333 y la última absorbe el residuo para que la suma cuadre exacta', () => {
    const cuotas = plan();
    expect(cuotas.slice(0, 11).every((c) => c.valor.toString() === '3208333')).toBe(true);
    expect(cuotas[11].valor.toString()).toBe('3208337');
    expect(cuotas.reduce((suma, c) => suma.plus(c.valor), D('0')).toString()).toBe('38500000');
  });

  it('un día 31 se recorta al último día del mes y vuelve a 31 donde el mes lo tiene', () => {
    const cuotas = generarPlanDePagos({
      valorTotal: D('12000000'),
      cuotaInicial: D('0'),
      numeroCuotas: 4,
      tasaInteres: null,
      fechaVenta: new Date(2026, 0, 1),
      fechaPrimeraCuota: new Date(2026, 0, 31),
    });
    expect(cuotas.map((c) => formatearFechaLocal(c.fechaVencimiento))).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('sin fecha de la primera cuota se conserva el comportamiento de siempre (un mes después de la venta)', () => {
    const cuotas = generarPlanDePagos({
      valorTotal: D('12000000'),
      cuotaInicial: D('0'),
      numeroCuotas: 3,
      tasaInteres: null,
      fechaVenta: new Date(2026, 0, 15),
      fechaPrimeraCuota: null,
    });
    expect(cuotas.map((c) => formatearFechaLocal(c.fechaVencimiento))).toEqual(['2026-02-15', '2026-03-15', '2026-04-15']);
  });
});

describe('generarPlanDePagos con las fechas elegidas una por una', () => {
  // Contrato real de ejemplo: $54.000.000; cuota inicial $16.200.000; 2 cuotas de $18.900.000 el 15/08/2026 y el 15/12/2026.
  const plan = (fechas: Date[]) =>
    generarPlanDePagos({
      valorTotal: D('54000000'),
      cuotaInicial: D('16200000'),
      numeroCuotas: 2,
      tasaInteres: null,
      fechaVenta: new Date(2026, 0, 13),
      fechasCuotas: fechas,
    });

  it('cada cuota toma su fecha, aunque no sean meses consecutivos', () => {
    const cuotas = plan([new Date(2026, 7, 15), new Date(2026, 11, 15)]);
    expect(cuotas.map((c) => formatearFechaLocal(c.fechaVencimiento))).toEqual(['2026-08-15', '2026-12-15']);
    expect(cuotas.map((c) => c.valor.toString())).toEqual(['18900000', '18900000']);
  });

  it('manda sobre la fecha de la primera cuota si vienen las dos', () => {
    const cuotas = generarPlanDePagos({
      valorTotal: D('54000000'),
      cuotaInicial: D('16200000'),
      numeroCuotas: 2,
      tasaInteres: null,
      fechaVenta: new Date(2026, 0, 13),
      fechaPrimeraCuota: new Date(2026, 7, 15),
      fechasCuotas: [new Date(2026, 7, 15), new Date(2026, 11, 15)],
    });
    expect(formatearFechaLocal(cuotas[1].fechaVencimiento)).toBe('2026-12-15');
  });

  it('exige exactamente una fecha por cuota', () => {
    expect(() => plan([new Date(2026, 7, 15)])).toThrow(FechasDeCuotasInvalidas);
    expect(() => plan([new Date(2026, 7, 15), new Date(2026, 9, 15), new Date(2026, 11, 15)])).toThrow(/Hacen falta 2 fechas/);
  });

  it('rechaza fechas fuera de orden, anteriores a la venta o inválidas', () => {
    expect(() => plan([new Date(2026, 11, 15), new Date(2026, 7, 15)])).toThrow(/van en orden/);
    expect(() => plan([new Date(2025, 11, 1), new Date(2026, 11, 15)])).toThrow(/antes de la fecha de la venta/);
    expect(() => plan([new Date('no es una fecha'), new Date(2026, 11, 15)])).toThrow(/no es válida/);
  });

  it('permite dos cuotas el mismo día y la hora no cuenta', () => {
    const cuotas = plan([new Date(2026, 7, 15, 23, 59), new Date(2026, 7, 15, 1, 0)]);
    expect(cuotas.map((c) => formatearFechaLocal(c.fechaVencimiento))).toEqual(['2026-08-15', '2026-08-15']);
  });
});
