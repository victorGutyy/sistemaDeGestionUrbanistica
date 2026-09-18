import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { TipoMovimiento } from '../generated/prisma/enums.js';
import { calcularConsolidado, fechaEnRango } from './consolidado.js';

describe('calcularConsolidado', () => {
  it('separa ingresos por ventas (abonos) de los ingresos generales, y resta los gastos', () => {
    const resultado = calcularConsolidado({
      movimientos: [
        { tipo: TipoMovimiento.INGRESO, valor: new Prisma.Decimal('500000'), proyectoId: null },
        { tipo: TipoMovimiento.GASTO, valor: new Prisma.Decimal('200000'), proyectoId: null },
      ],
      abonos: [{ valor: new Prisma.Decimal('1000000'), proyectoId: 'proyecto-1' }],
      proyectos: [{ id: 'proyecto-1', nombre: 'Urbanización Test' }],
    });

    expect(resultado.ingresosPorVentas.toString()).toBe('1000000');
    expect(resultado.ingresosGenerales.toString()).toBe('500000');
    expect(resultado.gastos.toString()).toBe('200000');
    expect(resultado.totalIngresos.toString()).toBe('1500000');
    expect(resultado.cajaNeta.toString()).toBe('1300000');
  });

  it('agrupa por proyecto y deja fuera del desglose lo que no tiene proyecto', () => {
    const resultado = calcularConsolidado({
      movimientos: [
        { tipo: TipoMovimiento.GASTO, valor: new Prisma.Decimal('100000'), proyectoId: 'proyecto-1' },
        { tipo: TipoMovimiento.GASTO, valor: new Prisma.Decimal('50000'), proyectoId: null }, // gasto general de la empresa
      ],
      abonos: [{ valor: new Prisma.Decimal('2000000'), proyectoId: 'proyecto-1' }],
      proyectos: [{ id: 'proyecto-1', nombre: 'Urbanización Test' }],
    });

    expect(resultado.gastos.toString()).toBe('150000'); // el total sí incluye el gasto general
    expect(resultado.porProyecto).toHaveLength(1);
    expect(resultado.porProyecto[0].gastos.toString()).toBe('100000'); // el proyecto solo ve lo suyo
    expect(resultado.porProyecto[0].ingresosPorVentas.toString()).toBe('2000000');
  });

  it('devuelve todo en cero cuando no hay movimientos ni abonos', () => {
    const resultado = calcularConsolidado({ movimientos: [], abonos: [], proyectos: [] });

    expect(resultado.totalIngresos.toString()).toBe('0');
    expect(resultado.cajaNeta.toString()).toBe('0');
    expect(resultado.porProyecto).toHaveLength(0);
  });
});

describe('fechaEnRango', () => {
  it('sin desde ni hasta, cualquier fecha está en rango', () => {
    expect(fechaEnRango(new Date(2020, 0, 1), {})).toBe(true);
  });

  it('respeta el límite inferior (desde) inclusive', () => {
    expect(fechaEnRango(new Date(2026, 8, 10), { desde: '2026-09-10' })).toBe(true);
    expect(fechaEnRango(new Date(2026, 8, 9), { desde: '2026-09-10' })).toBe(false);
  });

  it('respeta el límite superior (hasta) inclusive', () => {
    expect(fechaEnRango(new Date(2026, 8, 10), { hasta: '2026-09-10' })).toBe(true);
    expect(fechaEnRango(new Date(2026, 8, 11), { hasta: '2026-09-10' })).toBe(false);
  });
});
