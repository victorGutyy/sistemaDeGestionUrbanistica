import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { valorRecibidoEnLetras } from './recibo-contenido.js';

describe('valorRecibidoEnLetras', () => {
  it('pesos enteros', () => {
    expect(valorRecibidoEnLetras(new Prisma.Decimal('5000000'))).toBe('CINCO MILLONES DE PESOS M/CTE');
  });

  it('un dato antiguo con centavos se dice completo, sin lanzar error', () => {
    expect(valorRecibidoEnLetras(new Prisma.Decimal('4333333.33'))).toBe(
      'CUATRO MILLONES TRESCIENTOS TREINTA Y TRES MIL TRESCIENTOS TREINTA Y TRES PESOS M/CTE Y 33 CENTAVOS',
    );
  });
});
