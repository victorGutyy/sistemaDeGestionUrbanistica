import { describe, expect, it } from 'vitest';
import { EstadoCuota } from '../generated/prisma/enums.js';
import { calcularReprogramacion, ReprogramacionInvalida, type CuotaDelPlan } from './ajustar-plan.js';

const d = (anio: number, mes: number, dia: number) => new Date(anio, mes - 1, dia);
const iso = (f: Date) => `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;

// Plan de ejemplo: cuota inicial + 6 cuotas mensuales, registradas con fechas de un mes después de la venta (el día 12).
function plan(estados: Partial<Record<number, EstadoCuota>> = {}): CuotaDelPlan[] {
  return [0, 1, 2, 3, 4, 5, 6].map((numero) => ({
    id: `c${numero}`,
    numero,
    fechaVencimiento: numero === 0 ? d(2026, 11, 12) : d(2026, 11 + numero, 12),
    estado: estados[numero] ?? EstadoCuota.PENDIENTE,
  }));
}

describe('reprogramar las fechas de un plan de pagos (CC-08)', () => {
  it('con la fecha de la primera cuota pendiente, las demás caen el mismo día de cada mes', () => {
    const cambios = calcularReprogramacion(plan(), { fechaPrimeraCuotaPendiente: d(2027, 2, 5) });
    expect(cambios.map((c) => [c.numero, iso(c.despues)])).toEqual([
      [1, '2027-02-05'],
      [2, '2027-03-05'],
      [3, '2027-04-05'],
      [4, '2027-05-05'],
      [5, '2027-06-05'],
      [6, '2027-07-05'],
    ]);
  });

  it('con la fecha límite de la cuota inicial cambia solo la cuota 0', () => {
    const cambios = calcularReprogramacion(plan(), { fechaCuotaInicial: d(2026, 12, 28) });
    expect(cambios).toHaveLength(1);
    expect(cambios[0]).toMatchObject({ numero: 0, cuotaId: 'c0' });
    expect(iso(cambios[0].despues)).toBe('2026-12-28');
  });

  it('las dos a la vez: cuota inicial y cuotas mensuales', () => {
    const cambios = calcularReprogramacion(plan(), { fechaCuotaInicial: d(2026, 12, 28), fechaPrimeraCuotaPendiente: d(2027, 2, 5) });
    expect(cambios.map((c) => c.numero)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('las cuotas ya pagadas no se tocan: la primera pendiente toma la fecha y las siguientes se cuentan desde ella', () => {
    const cambios = calcularReprogramacion(plan({ 1: EstadoCuota.PAGADA, 2: EstadoCuota.PAGADA }), { fechaPrimeraCuotaPendiente: d(2027, 3, 5) });
    expect(cambios.map((c) => c.numero)).toEqual([3, 4, 5, 6]);
    expect(iso(cambios[0].despues)).toBe('2027-03-05');
    expect(iso(cambios[3].despues)).toBe('2027-06-05');
  });

  it('una cuota con pagos parciales sí se puede reprogramar (sigue pendiente)', () => {
    const cambios = calcularReprogramacion(plan({ 1: EstadoCuota.PARCIAL }), { fechaPrimeraCuotaPendiente: d(2027, 2, 5) });
    expect(cambios[0].numero).toBe(1);
  });

  it('rechaza una fecha anterior a la de una cuota anterior ya pagada', () => {
    // La cuota 1 pagada vence en diciembre de 2026; mover la 2 a noviembre dejaría el plan al revés.
    expect(() => calcularReprogramacion(plan({ 1: EstadoCuota.PAGADA }), { fechaPrimeraCuotaPendiente: d(2026, 11, 1) })).toThrow(ReprogramacionInvalida);
  });

  it('rechaza reprogramar una cuota inicial ya pagada o cuando no quedan cuotas pendientes', () => {
    expect(() => calcularReprogramacion(plan({ 0: EstadoCuota.PAGADA }), { fechaCuotaInicial: d(2026, 12, 28) })).toThrow(/cuota inicial ya está pagada/);
    const todasPagadas = plan({ 1: EstadoCuota.PAGADA, 2: EstadoCuota.PAGADA, 3: EstadoCuota.PAGADA, 4: EstadoCuota.PAGADA, 5: EstadoCuota.PAGADA, 6: EstadoCuota.PAGADA });
    expect(() => calcularReprogramacion(todasPagadas, { fechaPrimeraCuotaPendiente: d(2027, 2, 5) })).toThrow(/No quedan cuotas pendientes/);
  });

  it('rechaza una petición vacía o que no cambia nada', () => {
    expect(() => calcularReprogramacion(plan(), {})).toThrow(ReprogramacionInvalida);
    expect(() => calcularReprogramacion(plan(), { fechaCuotaInicial: d(2026, 11, 12) })).toThrow(/nada que cambiar/);
  });

  it('un día 31 se recorta al último día del mes y vuelve a 31 donde el mes lo tiene', () => {
    const cambios = calcularReprogramacion(plan(), { fechaPrimeraCuotaPendiente: d(2027, 1, 31) });
    expect(cambios.slice(0, 4).map((c) => iso(c.despues))).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
  });

  it('ignora la hora del día de la fecha pedida', () => {
    const cambios = calcularReprogramacion(plan(), { fechaPrimeraCuotaPendiente: new Date(2027, 1, 5, 23, 40) });
    expect(iso(cambios[0].despues)).toBe('2027-02-05');
  });
});
