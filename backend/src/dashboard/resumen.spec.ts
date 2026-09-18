import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { combinarPorProyecto } from './resumen.js';

describe('combinarPorProyecto', () => {
  it('cruza las filas de Finanzas y Cartera cuando el proyecto aparece en ambas', () => {
    const resultado = combinarPorProyecto(
      [
        {
          proyectoId: 'p1',
          nombre: 'Urbanización Test',
          ingresosPorVentas: new Prisma.Decimal('1000000'),
          ingresosGenerales: new Prisma.Decimal('0'),
          gastos: new Prisma.Decimal('200000'),
          cajaNeta: new Prisma.Decimal('800000'),
        },
      ],
      [
        {
          proyectoId: 'p1',
          nombre: 'Urbanización Test',
          saldoVencido: new Prisma.Decimal('50000'),
          interesMora: new Prisma.Decimal('1500'),
          saldoPorVencer: new Prisma.Decimal('300000'),
        },
      ],
    );

    expect(resultado).toHaveLength(1);
    expect(resultado[0].cajaNeta.toString()).toBe('800000');
    expect(resultado[0].saldoVencido.toString()).toBe('50000');
    expect(resultado[0].saldoPorVencer.toString()).toBe('300000');
  });

  it('incluye un proyecto que solo aparece en Finanzas, con la parte de cartera en cero', () => {
    const resultado = combinarPorProyecto(
      [
        {
          proyectoId: 'p1',
          nombre: 'Solo gastos',
          ingresosPorVentas: new Prisma.Decimal('0'),
          ingresosGenerales: new Prisma.Decimal('0'),
          gastos: new Prisma.Decimal('100000'),
          cajaNeta: new Prisma.Decimal('-100000'),
        },
      ],
      [],
    );

    expect(resultado).toHaveLength(1);
    expect(resultado[0].gastos.toString()).toBe('100000');
    expect(resultado[0].saldoVencido.toString()).toBe('0');
  });

  it('incluye un proyecto que solo aparece en Cartera, con la parte de finanzas en cero', () => {
    const resultado = combinarPorProyecto(
      [],
      [
        {
          proyectoId: 'p1',
          nombre: 'Solo cartera',
          saldoVencido: new Prisma.Decimal('20000'),
          interesMora: new Prisma.Decimal('600'),
          saldoPorVencer: new Prisma.Decimal('80000'),
        },
      ],
    );

    expect(resultado).toHaveLength(1);
    expect(resultado[0].cajaNeta.toString()).toBe('0');
    expect(resultado[0].saldoVencido.toString()).toBe('20000');
  });
});
