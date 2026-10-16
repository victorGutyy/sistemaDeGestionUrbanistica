import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { repartirAbono, type CuotaPorCubrir } from './repartir-abono.js';

const D = (v: string) => new Prisma.Decimal(v);
const cuota = (numero: number, mes: number, valor: string, pagado = '0'): CuotaPorCubrir => ({
  id: `c${numero}`,
  numero,
  fechaVencimiento: new Date(2026, mes, 1),
  valor: D(valor),
  pagado: D(pagado),
});
const PLAN = () => [cuota(0, 0, '30000000'), cuota(1, 1, '5000000'), cuota(2, 2, '5000000'), cuota(3, 3, '5000000')];

describe('repartirAbono (RF-REC-03)', () => {
  it('abono parcial: paga solo una parte de la primera cuota pendiente y la deja sin completar', () => {
    const { partes, sobrante } = repartirAbono(D('10000000'), PLAN());

    expect(partes).toHaveLength(1);
    expect(partes[0]).toMatchObject({ cuotaId: 'c0', numero: 0, cubreCompleta: false });
    expect(partes[0].valor.toString()).toBe('10000000');
    expect(partes[0].saldoAntes.toString()).toBe('30000000');
    expect(sobrante.toString()).toBe('0');
  });

  it('abono que cubre varias cuotas: completa unas y deja parcial la última', () => {
    const { partes, sobrante } = repartirAbono(D('37000000'), PLAN());

    expect(partes.map((p) => [p.numero, p.valor.toString(), p.cubreCompleta])).toEqual([
      [0, '30000000', true],
      [1, '5000000', true],
      [2, '2000000', false],
    ]);
    expect(sobrante.toString()).toBe('0');
  });

  it('continúa donde quedó la cuota parcialmente pagada', () => {
    const cuotas = [cuota(0, 0, '30000000', '30000000'), cuota(1, 1, '5000000', '3000000'), cuota(2, 2, '5000000')];
    const { partes } = repartirAbono(D('4000000'), cuotas);

    expect(partes.map((p) => [p.numero, p.valor.toString(), p.saldoAntes.toString(), p.cubreCompleta])).toEqual([
      [1, '2000000', '2000000', true],
      [2, '2000000', '5000000', false],
    ]);
  });

  it('abono exacto al saldo total deja todas las cuotas cubiertas y sin sobrante', () => {
    const { partes, sobrante } = repartirAbono(D('45000000'), PLAN());
    expect(partes).toHaveLength(4);
    expect(partes.every((p) => p.cubreCompleta)).toBe(true);
    expect(sobrante.toString()).toBe('0');
  });

  it('lo que supera el saldo de la venta queda como sobrante (el servicio lo rechaza)', () => {
    const { sobrante } = repartirAbono(D('46000000'), PLAN());
    expect(sobrante.toString()).toBe('1000000');
  });

  it('aplica por fecha de vencimiento aunque las cuotas lleguen desordenadas, y desempata por número', () => {
    const desordenadas = [cuota(3, 3, '100'), cuota(1, 1, '100'), cuota(2, 1, '100'), cuota(0, 0, '100')];
    const { partes } = repartirAbono(D('250'), desordenadas);
    expect(partes.map((p) => p.numero)).toEqual([0, 1, 2]);
  });

  it('ignora las cuotas ya pagadas del todo', () => {
    const cuotas = [cuota(0, 0, '100', '100'), cuota(1, 1, '100')];
    const { partes } = repartirAbono(D('50'), cuotas);
    expect(partes.map((p) => p.numero)).toEqual([1]);
  });

  it('una venta sin saldo no recibe nada: todo es sobrante', () => {
    const { partes, sobrante } = repartirAbono(D('100'), [cuota(0, 0, '100', '100')]);
    expect(partes).toHaveLength(0);
    expect(sobrante.toString()).toBe('100');
  });

  it('la suma de lo aplicado más el sobrante siempre es el valor del abono', () => {
    for (const valor of ['1', '999999', '30000001', '45000000', '60000000']) {
      const { partes, sobrante } = repartirAbono(D(valor), PLAN());
      const aplicado = partes.reduce((t, p) => t.plus(p.valor), D('0'));
      expect(aplicado.plus(sobrante).toString()).toBe(valor);
    }
  });
});
