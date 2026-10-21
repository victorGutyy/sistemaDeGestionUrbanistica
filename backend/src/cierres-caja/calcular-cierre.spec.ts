import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { calcularCierre, type AbonoCaja, type DatosCierre, type MovimientoCaja, type PagoNominaCaja } from './calcular-cierre.js';

const D = (v: string) => new Prisma.Decimal(v);
const BANCO = { id: 'cuenta-1', alias: 'Ahorros', banco: 'Banco de prueba' };
const OTRO_BANCO = { id: 'cuenta-2', alias: 'Corriente', banco: 'Otro banco' };
// Mediodía en Colombia (17:00 UTC): sin ambigüedad de día.
const instante = (dia: number, mes = 10) => new Date(Date.UTC(2026, mes - 1, dia, 17, 0, 0));
const fecha = (dia: number, mes = 10) => new Date(2026, mes - 1, dia);

const abono = (id: string, dia: number, valor: string, extra: Partial<AbonoCaja> = {}): AbonoCaja => ({
  id,
  fecha: fecha(dia),
  valor: D(valor),
  medioPago: 'EFECTIVO',
  cuenta: null,
  estado: 'ACTIVO',
  anuladoEn: null,
  recibo: `RC-${id}`,
  cliente: 'Cliente de Prueba',
  lote: 'L-1',
  proyecto: 'Proyecto de prueba',
  ...extra,
});

const movimiento = (id: string, tipo: 'INGRESO' | 'GASTO', dia: number, valor: string, extra: Partial<MovimientoCaja> = {}): MovimientoCaja => ({
  id,
  tipo,
  fecha: fecha(dia),
  valor: D(valor),
  medioPago: 'EFECTIVO',
  cuenta: null,
  estado: 'ACTIVO',
  anuladoEn: null,
  descripcion: tipo === 'GASTO' ? 'Egreso de prueba' : 'Ingreso de prueba',
  categoria: 'Materiales',
  proyecto: null,
  ...extra,
});

const nomina = (id: string, dia: number, valor: string, extra: Partial<PagoNominaCaja> = {}): PagoNominaCaja => ({
  id,
  fechaPago: fecha(dia),
  valorPagado: D(valor),
  medioPago: 'EFECTIVO',
  cuenta: null,
  trabajador: 'Trabajador de Prueba',
  ...extra,
});

const VACIO: DatosCierre = { abonos: [], movimientos: [], nominas: [] };
const SEMANA = { desde: '2026-10-12', hasta: '2026-10-18', efectivoInicial: D('100000') };

describe('abonos por verificar en el cierre (RF-REC-10)', () => {
  const periodo = { desde: '2026-10-01', hasta: '2026-10-07', efectivoInicial: D('0') };
  const datos = (abonos: AbonoCaja[]): DatosCierre => ({ abonos, movimientos: [], nominas: [] });

  it('cuenta, por cuenta bancaria, los abonos vigentes del período que esperan confirmación', () => {
    const resultado = calcularCierre(
      periodo,
      datos([
        abono('a1', 2, '1000000', { medioPago: 'TRANSFERENCIA', cuenta: BANCO, verificacion: 'POR_VERIFICAR' }),
        abono('a2', 3, '500000', { medioPago: 'TRANSFERENCIA', cuenta: BANCO, verificacion: 'POR_VERIFICAR' }),
        abono('a3', 4, '250000', { medioPago: 'CONSIGNACION', cuenta: OTRO_BANCO, verificacion: 'POR_VERIFICAR' }),
      ]),
    );

    expect(resultado.porVerificar).toEqual({
      cantidad: 3,
      valor: '1750000',
      porCuenta: [
        { nombre: 'Ahorros — Banco de prueba', cantidad: 2, valor: '1500000' },
        { nombre: 'Corriente — Otro banco', cantidad: 1, valor: '250000' },
      ],
    });
  });

  it('no cuenta los verificados, los que no requieren verificación, los anulados ni los de otro período', () => {
    const resultado = calcularCierre(
      periodo,
      datos([
        abono('a1', 2, '1000000', { medioPago: 'TRANSFERENCIA', cuenta: BANCO, verificacion: 'VERIFICADO' }),
        abono('a2', 3, '500000'),
        abono('a3', 4, '250000', { medioPago: 'TRANSFERENCIA', cuenta: BANCO, verificacion: 'POR_VERIFICAR', estado: 'ANULADO', anuladoEn: instante(5) }),
        abono('a4', 20, '700000', { medioPago: 'TRANSFERENCIA', cuenta: BANCO, verificacion: 'POR_VERIFICAR' }),
      ]),
    );

    expect(resultado.porVerificar).toEqual({ cantidad: 0, valor: '0', porCuenta: [] });
  });

  it('es solo un aviso: los totales y el efectivo esperado no cambian por estar pendientes', () => {
    const con = calcularCierre(periodo, datos([abono('a1', 2, '1000000', { medioPago: 'TRANSFERENCIA', cuenta: BANCO, verificacion: 'POR_VERIFICAR' })]));
    const sin = calcularCierre(periodo, datos([abono('a1', 2, '1000000', { medioPago: 'TRANSFERENCIA', cuenta: BANCO, verificacion: 'VERIFICADO' })]));

    expect(con.totales).toEqual(sin.totales);
    expect(con.efectivo).toEqual(sin.efectivo);
  });
});

describe('calcularCierre (RF-CAJ-02 y 03)', () => {
  it('un período sin movimientos deja el efectivo esperado en el efectivo inicial', () => {
    const r = calcularCierre(SEMANA, VACIO);
    expect(r.eventos).toHaveLength(0);
    expect(r.totales.neto).toBe('0');
    expect(r.efectivo.esperado).toBe('100000');
  });

  it('suma entradas y salidas del período, con totales por medio de pago y por cuenta', () => {
    const r = calcularCierre(SEMANA, {
      abonos: [abono('1', 13, '500000'), abono('2', 14, '2000000', { medioPago: 'TRANSFERENCIA', cuenta: BANCO })],
      movimientos: [
        movimiento('m1', 'INGRESO', 15, '300000'),
        movimiento('m2', 'GASTO', 15, '150000'),
        movimiento('m3', 'GASTO', 16, '400000', { medioPago: 'TRANSFERENCIA', cuenta: OTRO_BANCO }),
      ],
      nominas: [nomina('n1', 17, '200000')],
    });

    expect(r.totales.entradas).toBe('2800000');
    expect(r.totales.salidas).toBe('750000');
    expect(r.totales.neto).toBe('2050000');

    const medio = (nombre: string) => r.porMedio.find((f) => f.medioPago === nombre);
    expect(medio('EFECTIVO')).toMatchObject({ entradas: '800000', salidas: '350000', neto: '450000' });
    expect(medio('TRANSFERENCIA')).toMatchObject({ entradas: '2000000', salidas: '400000', neto: '1600000' });

    const cuenta = (id: string | null) => r.porCuenta.find((f) => f.cuentaId === id);
    expect(cuenta('cuenta-1')).toMatchObject({ entradas: '2000000', salidas: '0' });
    expect(cuenta('cuenta-2')).toMatchObject({ entradas: '0', salidas: '400000' });
    expect(cuenta(null)).toMatchObject({ nombre: 'Efectivo (sin cuenta)', entradas: '800000', salidas: '350000' });
  });

  it('el efectivo esperado es el inicial más las entradas en efectivo menos las salidas en efectivo (RF-CAJ-03)', () => {
    const r = calcularCierre(SEMANA, {
      abonos: [abono('1', 13, '500000'), abono('2', 14, '9000000', { medioPago: 'CONSIGNACION', cuenta: BANCO })],
      movimientos: [movimiento('m1', 'GASTO', 15, '150000'), movimiento('m2', 'GASTO', 15, '700000', { medioPago: 'TRANSFERENCIA', cuenta: BANCO })],
      nominas: [nomina('n1', 17, '200000')],
    });
    // 100.000 + 500.000 − 150.000 − 200.000 = 250.000 (lo que entró o salió por banco no toca la caja física)
    expect(r.efectivo).toEqual({ inicial: '100000', entradas: '500000', salidas: '350000', esperado: '250000' });
  });

  it('deja por fuera lo que cae antes o después del período', () => {
    const r = calcularCierre(SEMANA, {
      abonos: [abono('antes', 11, '111'), abono('primero', 12, '1'), abono('ultimo', 18, '2'), abono('despues', 19, '222')],
      movimientos: [],
      nominas: [nomina('n-antes', 11, '5'), nomina('n-dentro', 18, '7')],
    });
    expect(r.eventos.map((e) => e.id)).toEqual(['primero', 'n-dentro', 'ultimo']);
    expect(r.totales.entradas).toBe('3');
    expect(r.totales.salidas).toBe('7');
  });

  it('la lista queda ordenada por fecha y trae el detalle de cada línea', () => {
    const r = calcularCierre(SEMANA, { abonos: [abono('b', 15, '10'), abono('a', 13, '20')], movimientos: [], nominas: [] });
    expect(r.eventos.map((e) => e.fecha)).toEqual(['2026-10-13', '2026-10-15']);
    expect(r.eventos[0]).toMatchObject({ origen: 'ABONO', clase: 'REGISTRO', sentido: 'ENTRADA', valor: '20', detalle: 'RC-a · Proyecto de prueba' });
  });
});

describe('calcularCierre: anulaciones (RF-CAJ-05)', () => {
  it('una anulación resta en el período en que se anuló, no en el del abono original', () => {
    // El abono es del 6 de octubre (cierre anterior) y se anuló el miércoles 14.
    const anulado = abono('viejo', 6, '1000000', { estado: 'ANULADO', anuladoEn: instante(14) });

    const anterior = calcularCierre({ desde: '2026-10-05', hasta: '2026-10-11', efectivoInicial: D('0') }, { abonos: [anulado], movimientos: [], nominas: [] });
    expect(anterior.totales.entradas).toBe('1000000');
    expect(anterior.eventos.map((e) => e.clase)).toEqual(['REGISTRO']);

    const siguiente = calcularCierre(SEMANA, { abonos: [anulado], movimientos: [], nominas: [] });
    expect(siguiente.totales).toMatchObject({ entradasBrutas: '0', reversasEntradas: '1000000', entradas: '-1000000', neto: '-1000000' });
    expect(siguiente.eventos.map((e) => e.clase)).toEqual(['ANULACION']);
    expect(siguiente.efectivo.esperado).toBe('-900000');
  });

  it('algo registrado y anulado dentro del mismo período queda neto en cero, con los dos pasos a la vista', () => {
    const r = calcularCierre(SEMANA, {
      abonos: [abono('x', 13, '300000', { estado: 'ANULADO', anuladoEn: instante(15) })],
      movimientos: [movimiento('g', 'GASTO', 13, '80000', { estado: 'ANULADO', anuladoEn: instante(14) })],
      nominas: [],
    });
    expect(r.totales).toMatchObject({ entradasBrutas: '300000', reversasEntradas: '300000', entradas: '0', salidasBrutas: '80000', reversasSalidas: '80000', salidas: '0', neto: '0' });
    expect(r.eventos).toHaveLength(4);
    expect(r.efectivo.esperado).toBe('100000');
  });

  it('anular un egreso de un cierre anterior devuelve ese dinero a la caja en el cierre actual', () => {
    const r = calcularCierre(SEMANA, {
      abonos: [],
      movimientos: [movimiento('g', 'GASTO', 7, '250000', { estado: 'ANULADO', anuladoEn: instante(16) })],
      nominas: [],
    });
    expect(r.totales).toMatchObject({ salidasBrutas: '0', reversasSalidas: '250000', salidas: '-250000', neto: '250000' });
    expect(r.efectivo.esperado).toBe('350000');
  });

  it('una anulación hecha de noche cuenta en el día de Colombia, no en el de UTC', () => {
    // 2026-10-19 03:00 UTC = domingo 18 a las 22:00 en Colombia: cae en la semana 12–18.
    const r = calcularCierre(SEMANA, {
      abonos: [abono('n', 6, '10', { estado: 'ANULADO', anuladoEn: new Date(Date.UTC(2026, 9, 19, 3, 0, 0)) })],
      movimientos: [],
      nominas: [],
    });
    expect(r.eventos.map((e) => `${e.fecha}:${e.clase}`)).toEqual(['2026-10-18:ANULACION']);
  });

  it('un abono vigente nunca genera anulación aunque traiga una fecha de anulación residual', () => {
    const r = calcularCierre(SEMANA, { abonos: [abono('v', 13, '10', { anuladoEn: instante(14) })], movimientos: [], nominas: [] });
    expect(r.eventos.map((e) => e.clase)).toEqual(['REGISTRO']);
  });
});
