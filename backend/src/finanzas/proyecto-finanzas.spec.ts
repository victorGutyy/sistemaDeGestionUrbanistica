import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { resumirFinanzasProyecto, type FilaFinanza } from './proyecto-finanzas.js';

const D = (v: string) => new Prisma.Decimal(v);

function fila(sobrescribir: Partial<FilaFinanza>): FilaFinanza {
  return {
    origen: 'MOVIMIENTO',
    id: 'f',
    fecha: new Date(2026, 9, 1),
    tipo: 'GASTO',
    categoria: 'Materiales',
    descripcion: 'x',
    valor: D('0'),
    medioPago: 'EFECTIVO',
    cuenta: null,
    referencia: null,
    tercero: null,
    numeroDocumento: null,
    tieneSoporte: false,
    registradoPor: null,
    estado: 'ACTIVO',
    recibo: null,
    ventaId: null,
    ...sobrescribir,
  };
}

describe('resumirFinanzasProyecto (RF-EGR-05, 06 y 08)', () => {
  it('la utilidad es lo recaudado (abonos + ingresos manuales) menos los egresos', () => {
    const resumen = resumirFinanzasProyecto(
      [
        fila({ origen: 'ABONO', tipo: 'INGRESO', valor: D('30000000') }),
        fila({ origen: 'ABONO', tipo: 'INGRESO', valor: D('5000000') }),
        fila({ tipo: 'INGRESO', valor: D('2000000'), categoria: 'Otros servicios' }),
        fila({ tipo: 'GASTO', valor: D('12000000') }),
        fila({ tipo: 'GASTO', valor: D('3000000') }),
      ],
      [],
    );

    expect(resumen.ingresosPorVentas.toString()).toBe('35000000');
    expect(resumen.otrosIngresos.toString()).toBe('2000000');
    expect(resumen.totalIngresos.toString()).toBe('37000000');
    expect(resumen.egresos.toString()).toBe('15000000');
    expect(resumen.utilidad.toString()).toBe('22000000');
  });

  it('los movimientos y abonos anulados se muestran pero no suman en ningún total', () => {
    const resumen = resumirFinanzasProyecto(
      [
        fila({ origen: 'ABONO', tipo: 'INGRESO', valor: D('10000000'), estado: 'ANULADO' }),
        fila({ tipo: 'GASTO', valor: D('4000000'), estado: 'ANULADO' }),
        fila({ tipo: 'INGRESO', valor: D('1000000'), estado: 'ANULADO' }),
        fila({ tipo: 'GASTO', valor: D('500000') }),
      ],
      [],
    );

    expect(resumen.totalIngresos.toString()).toBe('0');
    expect(resumen.egresos.toString()).toBe('500000');
    expect(resumen.utilidad.toString()).toBe('-500000');
  });

  it('muestra lo vendido, lo recaudado de las ventas y el saldo por cobrar', () => {
    const resumen = resumirFinanzasProyecto([], [
      { valorTotal: D('100000000'), pagado: D('35000000') },
      { valorTotal: D('80000000'), pagado: D('80000000') },
    ]);

    expect(resumen.valorVendido.toString()).toBe('180000000');
    expect(resumen.recaudadoVentas.toString()).toBe('115000000');
    expect(resumen.saldoPorCobrar.toString()).toBe('65000000');
  });

  it('un proyecto sin movimientos ni ventas queda en cero', () => {
    const resumen = resumirFinanzasProyecto([], []);
    expect(resumen.utilidad.toString()).toBe('0');
    expect(resumen.saldoPorCobrar.toString()).toBe('0');
  });
});
