import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoCuota } from '../generated/prisma/enums.js';
import { calcularEstadoCuenta } from './estado-cuenta.js';

const D = (valor: string) => new Prisma.Decimal(valor);

describe('calcularEstadoCuenta', () => {
  it('sin abonos, todo el valor de la venta está pendiente (la cuota inicial también se paga con abonos)', () => {
    const estado = calcularEstadoCuenta({ valorTotal: D('10000000'), abonos: [], cuotas: [] });

    expect(estado.totalPagado.toString()).toBe('0');
    expect(estado.saldoPendiente.toString()).toBe('10000000');
  });

  it('suma los abonos (incluido el de la cuota inicial) al total pagado y los resta del saldo', () => {
    const estado = calcularEstadoCuenta({
      valorTotal: D('10000000'),
      abonos: [{ valor: D('2000000') }, { valor: D('786667') }, { valor: D('786667') }],
      cuotas: [],
    });

    expect(estado.totalPagado.toString()).toBe('3573334');
    expect(estado.saldoPendiente.toString()).toBe('6426666');
  });

  it('la próxima cuota es la pendiente más cercana en el tiempo, no la primera de la lista', () => {
    const estado = calcularEstadoCuenta({
      valorTotal: D('10000000'),
      abonos: [],
      cuotas: [
        { numero: 3, fechaVencimiento: new Date(2026, 3, 1), valor: D('100'), estado: EstadoCuota.PENDIENTE },
        { numero: 1, fechaVencimiento: new Date(2026, 1, 1), valor: D('100'), estado: EstadoCuota.PAGADA },
        { numero: 2, fechaVencimiento: new Date(2026, 2, 1), valor: D('100'), estado: EstadoCuota.PARCIAL },
      ],
    });

    expect(estado.proximaCuota?.numero).toBe(2);
  });

  it('la cuota inicial (cuota 0) sin pagar es la próxima cuota', () => {
    const estado = calcularEstadoCuenta({
      valorTotal: D('10000000'),
      abonos: [],
      cuotas: [
        { numero: 1, fechaVencimiento: new Date(2026, 2, 1), valor: D('100'), estado: EstadoCuota.PENDIENTE },
        { numero: 0, fechaVencimiento: new Date(2026, 1, 1), valor: D('100'), estado: EstadoCuota.PENDIENTE },
      ],
    });

    expect(estado.proximaCuota?.numero).toBe(0);
  });

  it('no hay próxima cuota cuando todas están pagadas', () => {
    const estado = calcularEstadoCuenta({
      valorTotal: D('10000000'),
      abonos: [{ valor: D('10000000') }],
      cuotas: [{ numero: 0, fechaVencimiento: new Date(2026, 1, 1), valor: D('10000000'), estado: EstadoCuota.PAGADA }],
    });

    expect(estado.proximaCuota).toBeNull();
    expect(estado.saldoPendiente.toString()).toBe('0');
  });
});
