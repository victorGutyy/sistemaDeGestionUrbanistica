import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoCuota } from '../generated/prisma/enums.js';
import {
  calcularInteresMora,
  calcularSaldoCuota,
  calcularSemaforo,
  diferenciaEnDiasCalendario,
  evaluarCuotaVencida,
} from './mora.js';

describe('diferenciaEnDiasCalendario', () => {
  it('ignora la hora del día, solo cuenta días de calendario', () => {
    const desde = new Date(2026, 2, 1, 23, 59);
    const hasta = new Date(2026, 2, 4, 0, 1);
    expect(diferenciaEnDiasCalendario(desde, hasta)).toBe(3);
  });

  it('es negativo cuando "hasta" es anterior a "desde"', () => {
    expect(diferenciaEnDiasCalendario(new Date(2026, 2, 10), new Date(2026, 2, 5))).toBe(-5);
  });
});

describe('calcularSaldoCuota', () => {
  it('resta los abonos ya aplicados del valor de la cuota', () => {
    const saldo = calcularSaldoCuota(new Prisma.Decimal('1000000'), [{ valor: new Prisma.Decimal('300000') }]);
    expect(saldo.toString()).toBe('700000');
  });

  it('nunca da un saldo negativo, aunque se hayan abonado de más', () => {
    const saldo = calcularSaldoCuota(new Prisma.Decimal('1000000'), [{ valor: new Prisma.Decimal('1500000') }]);
    expect(saldo.toString()).toBe('0');
  });
});

describe('calcularInteresMora', () => {
  it('es cero si la cuota no está atrasada', () => {
    const interes = calcularInteresMora(new Prisma.Decimal('1000000'), 0, new Prisma.Decimal('3'));
    expect(interes.toString()).toBe('0');
  });

  it('prorratea la tasa mensual por los días de atraso', () => {
    // 1,000,000 * 3% * (15/30) = 15,000
    const interes = calcularInteresMora(new Prisma.Decimal('1000000'), 15, new Prisma.Decimal('3'));
    expect(interes.toString()).toBe('15000');
  });
});

describe('calcularSemaforo', () => {
  it('VERDE cuando no hay cuotas pendientes', () => {
    expect(calcularSemaforo([], 5)).toBe('VERDE');
  });

  it('ROJO si al menos una cuota ya venció', () => {
    const estado = calcularSemaforo(
      [
        { fechaVencimiento: new Date(2026, 2, 1), diasHastaVencer: -2 },
        { fechaVencimiento: new Date(2026, 3, 1), diasHastaVencer: 20 },
      ],
      5,
    );
    expect(estado).toBe('ROJO');
  });

  it('AMARILLO si la más próxima vence dentro de la ventana de alerta', () => {
    const estado = calcularSemaforo([{ fechaVencimiento: new Date(2026, 2, 1), diasHastaVencer: 3 }], 5);
    expect(estado).toBe('AMARILLO');
  });

  it('VERDE si todas las cuotas están lejos de vencer', () => {
    const estado = calcularSemaforo([{ fechaVencimiento: new Date(2026, 2, 1), diasHastaVencer: 20 }], 5);
    expect(estado).toBe('VERDE');
  });
});

describe('evaluarCuotaVencida', () => {
  const hoy = new Date(2026, 2, 20);

  it('devuelve null si la cuota ya está PAGADA, aunque la fecha haya pasado', () => {
    const resultado = evaluarCuotaVencida(
      { estado: EstadoCuota.PAGADA, fechaVencimiento: new Date(2026, 2, 1), valor: new Prisma.Decimal('100') },
      [],
      hoy,
      new Prisma.Decimal('3'),
    );
    expect(resultado).toBeNull();
  });

  it('devuelve null si todavía no vence', () => {
    const resultado = evaluarCuotaVencida(
      { estado: EstadoCuota.PENDIENTE, fechaVencimiento: new Date(2026, 2, 25), valor: new Prisma.Decimal('100') },
      [],
      hoy,
      new Prisma.Decimal('3'),
    );
    expect(resultado).toBeNull();
  });

  it('calcula días de atraso, saldo vencido e interés cuando sí está vencida', () => {
    const resultado = evaluarCuotaVencida(
      { estado: EstadoCuota.PARCIAL, fechaVencimiento: new Date(2026, 2, 5), valor: new Prisma.Decimal('1000000') },
      [{ valor: new Prisma.Decimal('400000') }],
      hoy,
      new Prisma.Decimal('3'),
    );

    expect(resultado?.diasAtraso).toBe(15);
    expect(resultado?.saldoVencido.toString()).toBe('600000');
    // 600,000 * 3% * (15/30) = 9,000
    expect(resultado?.interesMora.toString()).toBe('9000');
  });
});
