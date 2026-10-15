import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { formatearCOP, formatearFechaISO } from './formato.util.js';

describe('formatearCOP', () => {
  it('agrupa miles con punto y no muestra decimales cuando el valor es entero', () => {
    expect(formatearCOP(new Prisma.Decimal('1234567'))).toBe('$1.234.567');
    expect(formatearCOP('1000')).toBe('$1.000');
    expect(formatearCOP(0)).toBe('$0');
  });

  it('muestra los centavos con coma solo cuando existen', () => {
    expect(formatearCOP(new Prisma.Decimal('22666666.67'))).toBe('$22.666.666,67');
  });
});

describe('formatearFechaISO', () => {
  it('convierte aaaa-mm-dd a dd/mm/aaaa', () => {
    expect(formatearFechaISO('2026-09-05')).toBe('05/09/2026');
  });
});
