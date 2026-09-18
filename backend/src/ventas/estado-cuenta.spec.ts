import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoCuota } from '../generated/prisma/enums.js';
import { calcularEstadoCuenta } from './estado-cuenta.js';

describe('calcularEstadoCuenta', () => {
  it('cuenta la cuota inicial como ya pagada desde el día uno', () => {
    const estado = calcularEstadoCuenta({
      valorTotal: new Prisma.Decimal('10000000'),
      cuotaInicial: new Prisma.Decimal('2000000'),
      abonos: [],
      cuotas: [],
    });

    expect(estado.totalPagado.toString()).toBe('2000000');
    expect(estado.saldoPendiente.toString()).toBe('8000000');
  });

  it('suma los abonos al total pagado y resta del saldo pendiente', () => {
    const estado = calcularEstadoCuenta({
      valorTotal: new Prisma.Decimal('10000000'),
      cuotaInicial: new Prisma.Decimal('2000000'),
      abonos: [{ valor: new Prisma.Decimal('786666.67') }, { valor: new Prisma.Decimal('786666.67') }],
      cuotas: [],
    });

    expect(estado.totalPagado.toString()).toBe('3573333.34');
    expect(estado.saldoPendiente.toString()).toBe('6426666.66');
  });

  it('la próxima cuota es la pendiente más cercana en el tiempo, no la primera de la lista', () => {
    const estado = calcularEstadoCuenta({
      valorTotal: new Prisma.Decimal('10000000'),
      cuotaInicial: new Prisma.Decimal('0'),
      abonos: [],
      cuotas: [
        { numero: 3, fechaVencimiento: new Date(2026, 3, 1), valor: new Prisma.Decimal('100'), estado: EstadoCuota.PENDIENTE },
        { numero: 1, fechaVencimiento: new Date(2026, 1, 1), valor: new Prisma.Decimal('100'), estado: EstadoCuota.PAGADA },
        { numero: 2, fechaVencimiento: new Date(2026, 2, 1), valor: new Prisma.Decimal('100'), estado: EstadoCuota.PARCIAL },
      ],
    });

    expect(estado.proximaCuota?.numero).toBe(2);
  });

  it('no hay próxima cuota cuando todas están pagadas', () => {
    const estado = calcularEstadoCuenta({
      valorTotal: new Prisma.Decimal('10000000'),
      cuotaInicial: new Prisma.Decimal('10000000'),
      abonos: [],
      cuotas: [
        { numero: 1, fechaVencimiento: new Date(2026, 1, 1), valor: new Prisma.Decimal('100'), estado: EstadoCuota.PAGADA },
      ],
    });

    expect(estado.proximaCuota).toBeNull();
  });
});
