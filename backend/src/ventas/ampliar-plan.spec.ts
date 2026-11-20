import { describe, expect, it } from 'vitest';
import { AmpliacionInvalida, calcularCuotasNuevas, MAXIMO_CUOTAS_DEL_PLAN } from './ampliar-plan.js';

const d = (anio: number, mes: number, dia: number) => new Date(anio, mes - 1, dia);
const iso = (f: Date) => `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;

// Plan mensual de 11 cuotas, del 30/09/2026 al 30/07/2027 (febrero cae el 28 por no tener día 30).
const ONCE = Array.from({ length: 11 }, (_, i) => {
  const mes = 9 + i;
  const fecha = mes > 12 ? (mes - 12 === 2 ? d(2027, 2, 28) : d(2027, mes - 12, 30)) : d(2026, mes, 30);
  return { numero: i + 1, fechaVencimiento: fecha };
});

describe('calcularCuotasNuevas (ampliar el plazo)', () => {
  it('pasar de 11 a 14 cuotas agrega la 12, la 13 y la 14, los 30 de cada mes', () => {
    const nuevas = calcularCuotasNuevas(ONCE, 14);
    expect(nuevas.map((n) => n.numero)).toEqual([12, 13, 14]);
    expect(nuevas.map((n) => iso(n.fecha))).toEqual(['2027-08-30', '2027-09-30', '2027-10-30']);
  });

  it('el día 31 vuelve a 31 después de un mes corto (sigue la serie de la primera cuota, no la de la anterior)', () => {
    const plan = [
      { numero: 1, fechaVencimiento: d(2026, 12, 31) },
      { numero: 2, fechaVencimiento: d(2027, 1, 31) },
      { numero: 3, fechaVencimiento: d(2027, 2, 28) },
    ];
    const nuevas = calcularCuotasNuevas(plan, 5);
    expect(nuevas.map((n) => iso(n.fecha))).toEqual(['2027-03-31', '2027-04-30']);
  });

  it('las fechas elegidas por quien ajusta mandan, y las demás siguen desde la última elegida', () => {
    const nuevas = calcularCuotasNuevas(ONCE, 14, [{ numero: 13, fecha: d(2027, 10, 15) }]);
    expect(nuevas.map((n) => iso(n.fecha))).toEqual(['2027-08-30', '2027-10-15', '2027-10-30']);
  });

  it('si la serie dejaría una cuota antes de la anterior, cae un mes después de la anterior', () => {
    // Plan irregular: dos cuotas el 15/08 y el 15/12, y se amplía a 4.
    const irregular = [
      { numero: 1, fechaVencimiento: d(2026, 8, 15) },
      { numero: 2, fechaVencimiento: d(2026, 12, 15) },
    ];
    const nuevas = calcularCuotasNuevas(irregular, 4);
    // La serie desde la primera daría el 15/10 y el 15/11, antes de la última (15/12): se sigue desde ella.
    expect(nuevas.map((n) => iso(n.fecha))).toEqual(['2027-01-15', '2027-02-15']);
  });

  it('rechaza un número que no sea mayor al de cuotas actuales', () => {
    expect(() => calcularCuotasNuevas(ONCE, 11)).toThrow(/ya tiene 11 cuotas/);
    expect(() => calcularCuotasNuevas(ONCE, 8)).toThrow(AmpliacionInvalida);
  });

  it('rechaza números que no son enteros positivos o que pasan del tope', () => {
    expect(() => calcularCuotasNuevas(ONCE, 0)).toThrow(/entero mayor a cero/);
    expect(() => calcularCuotasNuevas(ONCE, 14.5)).toThrow(/entero mayor a cero/);
    expect(() => calcularCuotasNuevas(ONCE, MAXIMO_CUOTAS_DEL_PLAN + 1)).toThrow(/no puede pasar de/);
  });

  it('rechaza fechas de cuotas que no son nuevas, repetidas, inválidas o fuera de orden', () => {
    expect(() => calcularCuotasNuevas(ONCE, 14, [{ numero: 5, fecha: d(2027, 9, 1) }])).toThrow(/no es una de las cuotas nuevas/);
    expect(() => calcularCuotasNuevas(ONCE, 14, [{ numero: 15, fecha: d(2027, 9, 1) }])).toThrow(/no es una de las cuotas nuevas/);
    expect(() => calcularCuotasNuevas(ONCE, 14, [{ numero: 12, fecha: d(2027, 9, 1) }, { numero: 12, fecha: d(2027, 9, 2) }])).toThrow(/repetida/);
    expect(() => calcularCuotasNuevas(ONCE, 14, [{ numero: 12, fecha: new Date('x') }])).toThrow(/no es válida/);
    expect(() => calcularCuotasNuevas(ONCE, 14, [{ numero: 12, fecha: d(2027, 7, 1) }])).toThrow(/antes que la cuota 11/);
    expect(() => calcularCuotasNuevas(ONCE, 14, [{ numero: 12, fecha: d(2027, 9, 30) }, { numero: 13, fecha: d(2027, 9, 1) }])).toThrow(/antes que la cuota 12/);
  });

  it('una venta sin cuotas mensuales no se puede ampliar', () => {
    expect(() => calcularCuotasNuevas([], 3)).toThrow(/no tiene cuotas mensuales/);
  });
});
