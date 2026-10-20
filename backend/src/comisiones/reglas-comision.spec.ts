import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoComision } from '../generated/prisma/enums.js';
import { descripcionDelPago, puedeCambiar, valorDeLaComision } from './reglas-comision.js';

const D = (valor: string) => new Prisma.Decimal(valor);

describe('valorDeLaComision (RF-COM-01)', () => {
  it('usa el valor configurado del tipo de vendedor', () => {
    expect(valorDeLaComision(D('1000000'))?.toString()).toBe('1000000');
    expect(valorDeLaComision(D('500000'))?.toString()).toBe('500000');
  });

  it('sin valor configurado (cero o ninguno) no hay comisión', () => {
    expect(valorDeLaComision(D('0'))).toBeNull();
    expect(valorDeLaComision(null)).toBeNull();
    expect(valorDeLaComision(undefined)).toBeNull();
  });

  it('la comisión va en pesos enteros: los centavos se redondean', () => {
    expect(valorDeLaComision(D('1000000.50'))?.toString()).toBe('1000001');
    expect(valorDeLaComision(D('1000000.49'))?.toString()).toBe('1000000');
    // Un valor que redondea a cero tampoco genera comisión.
    expect(valorDeLaComision(D('0.40'))).toBeNull();
  });
});

describe('puedeCambiar (RF-COM-02)', () => {
  it('la pendiente se puede pagar o anular', () => {
    expect(puedeCambiar(EstadoComision.PENDIENTE, EstadoComision.PAGADA)).toBe(true);
    expect(puedeCambiar(EstadoComision.PENDIENTE, EstadoComision.ANULADA)).toBe(true);
  });

  it('la pagada solo se puede anular: no vuelve a pendiente ni se paga dos veces', () => {
    expect(puedeCambiar(EstadoComision.PAGADA, EstadoComision.ANULADA)).toBe(true);
    expect(puedeCambiar(EstadoComision.PAGADA, EstadoComision.PENDIENTE)).toBe(false);
    expect(puedeCambiar(EstadoComision.PAGADA, EstadoComision.PAGADA)).toBe(false);
  });

  it('la anulada no cambia nunca más', () => {
    for (const hacia of Object.values(EstadoComision)) {
      expect(puedeCambiar(EstadoComision.ANULADA, hacia)).toBe(false);
    }
  });
});

describe('descripcionDelPago', () => {
  it('nombra el lote y al vendedor', () => {
    expect(descripcionDelPago({ numeroLote: 'A-3', nombreVendedor: 'Luis Gómez' })).toBe('Comisión de venta · Lote A-3 · Luis Gómez');
  });
});
