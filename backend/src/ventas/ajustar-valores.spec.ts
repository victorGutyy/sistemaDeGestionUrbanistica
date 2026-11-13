import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoCuota } from '../generated/prisma/enums.js';
import { calcularCambiosDeValor, estadoSegunPagado, ValoresInvalidos, type CuotaConValor } from './ajustar-valores.js';

const D = (v: string | number) => new Prisma.Decimal(v);

// Plan de ejemplo: cuota inicial pagada, la cuota 1 pagada, y las cuotas 2 a 4 pendientes. Suma total: $54.000.000.
function plan(extra: Partial<Record<number, Partial<CuotaConValor>>> = {}): CuotaConValor[] {
  const base: CuotaConValor[] = [
    { id: 'c0', numero: 0, estado: EstadoCuota.PAGADA, valor: D(16_200_000), pagado: D(16_200_000) },
    { id: 'c1', numero: 1, estado: EstadoCuota.PAGADA, valor: D(12_600_000), pagado: D(12_600_000) },
    { id: 'c2', numero: 2, estado: EstadoCuota.PENDIENTE, valor: D(12_600_000), pagado: D(0) },
    { id: 'c3', numero: 3, estado: EstadoCuota.PENDIENTE, valor: D(12_600_000), pagado: D(0) },
  ];
  return base.map((c) => ({ ...c, ...extra[c.numero] }));
}

describe('cambiar el valor de las cuotas que faltan (CC-08)', () => {
  it('reparte distinto entre las pendientes manteniendo el total', () => {
    const cambios = calcularCambiosDeValor(plan(), [
      { numero: 2, valor: D(20_000_000) },
      { numero: 3, valor: D(5_200_000) },
    ]);
    expect(cambios.map((c) => [c.numero, c.antes.toString(), c.despues.toString()])).toEqual([
      [2, '12600000', '20000000'],
      [3, '12600000', '5200000'],
    ]);
  });

  it('rechaza si el total cambia, diciendo cuánto falta o sobra', () => {
    expect(() => calcularCambiosDeValor(plan(), [{ numero: 2, valor: D(13_000_000) }])).toThrow(/sobran \$400\.000 por distribuir/);
    expect(() => calcularCambiosDeValor(plan(), [{ numero: 2, valor: D(12_000_000) }])).toThrow(/faltan \$600\.000 por distribuir/);
  });

  it('la cuota inicial también se puede cambiar si no está pagada', () => {
    const p = plan({ 0: { estado: EstadoCuota.PARCIAL, pagado: D(7_000_000) } });
    const cambios = calcularCambiosDeValor(p, [
      { numero: 0, valor: D(14_200_000) },
      { numero: 3, valor: D(14_600_000) },
    ]);
    expect(cambios.map((c) => c.numero)).toEqual([0, 3]);
    // Con $7.000.000 pagados, la cuota inicial sigue parcial.
    expect(cambios[0].estadoDespues).toBe(EstadoCuota.PARCIAL);
  });

  it('una cuota pagada no se toca', () => {
    expect(() => calcularCambiosDeValor(plan(), [{ numero: 1, valor: D(10_000_000) }, { numero: 2, valor: D(15_200_000) }])).toThrow(/ya está pagada/);
  });

  it('una cuota con pagos parciales no puede quedar por debajo de lo ya pagado', () => {
    const p = plan({ 2: { estado: EstadoCuota.PARCIAL, pagado: D(5_000_000) } });
    expect(() => calcularCambiosDeValor(p, [{ numero: 2, valor: D(4_000_000) }, { numero: 3, valor: D(21_200_000) }])).toThrow(/ya tiene \$5\.000\.000 pagados/);
  });

  it('si el nuevo valor es justo lo ya pagado, la cuota pasa a pagada', () => {
    const p = plan({ 2: { estado: EstadoCuota.PARCIAL, pagado: D(5_000_000) } });
    const cambios = calcularCambiosDeValor(p, [{ numero: 2, valor: D(5_000_000) }, { numero: 3, valor: D(20_200_000) }]);
    expect(cambios.find((c) => c.numero === 2)?.estadoDespues).toBe(EstadoCuota.PAGADA);
    expect(cambios.find((c) => c.numero === 3)?.estadoDespues).toBe(EstadoCuota.PENDIENTE);
  });

  it('una cuota con pagos parciales a la que se le sube el valor sigue parcial', () => {
    const p = plan({ 2: { estado: EstadoCuota.PARCIAL, pagado: D(5_000_000) } });
    const cambios = calcularCambiosDeValor(p, [{ numero: 2, valor: D(15_000_000) }, { numero: 3, valor: D(10_200_000) }]);
    expect(cambios.find((c) => c.numero === 2)?.estadoDespues).toBe(EstadoCuota.PARCIAL);
  });

  it('solo pesos enteros y mayores a cero', () => {
    expect(() => calcularCambiosDeValor(plan(), [{ numero: 2, valor: D('12600000.5') }, { numero: 3, valor: D('12599999.5') }])).toThrow(/entero de pesos/);
    expect(() => calcularCambiosDeValor(plan(), [{ numero: 2, valor: D(0) }, { numero: 3, valor: D(25_200_000) }])).toThrow(/mayor a cero/);
    expect(() => calcularCambiosDeValor(plan(), [{ numero: 2, valor: D(-1) }, { numero: 3, valor: D(25_200_001) }])).toThrow(/mayor a cero/);
  });

  it('rechaza cuotas inexistentes, repetidas o una petición vacía', () => {
    expect(() => calcularCambiosDeValor(plan(), [{ numero: 9, valor: D(1) }])).toThrow(/No existe la cuota 9/);
    expect(() => calcularCambiosDeValor(plan(), [{ numero: 2, valor: D(1) }, { numero: 2, valor: D(2) }])).toThrow(/repetido/);
    expect(() => calcularCambiosDeValor(plan(), [])).toThrow(ValoresInvalidos);
  });

  it('si los valores pedidos ya son los del plan, no hay cambios', () => {
    expect(calcularCambiosDeValor(plan(), [{ numero: 2, valor: D(12_600_000) }, { numero: 3, valor: D(12_600_000) }])).toEqual([]);
  });

  it('permite quedar con valores que suman exacto aunque la división no sea exacta', () => {
    // $37.800.000 entre 7 cuotas no da exacto: la persona reparte y la suma tiene que cuadrar al peso.
    const p: CuotaConValor[] = Array.from({ length: 7 }, (_, i) => ({ id: `c${i + 1}`, numero: i + 1, estado: EstadoCuota.PENDIENTE, valor: D(5_400_000), pagado: D(0) }));
    const pedidos = p.map((c, i) => ({ numero: c.numero, valor: D(i === 6 ? 5_400_006 : 5_399_999) }));
    // 6 × 5.399.999 + 5.400.006 = 37.800.000
    expect(calcularCambiosDeValor(p, pedidos)).toHaveLength(7);
  });
});

describe('estado de una cuota según lo pagado', () => {
  it('pendiente, parcial o pagada', () => {
    expect(estadoSegunPagado(D(100), D(0))).toBe(EstadoCuota.PENDIENTE);
    expect(estadoSegunPagado(D(100), D(40))).toBe(EstadoCuota.PARCIAL);
    expect(estadoSegunPagado(D(100), D(100))).toBe(EstadoCuota.PAGADA);
    expect(estadoSegunPagado(D(100), D(120))).toBe(EstadoCuota.PAGADA);
  });
});
