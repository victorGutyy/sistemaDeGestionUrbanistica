import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoCuota } from '../generated/prisma/enums.js';
import { resumirCartera, type CuotaDeCartera } from './cartera-venta.js';

const D = (valor: number) => new Prisma.Decimal(valor);
const HOY = new Date(2026, 9, 18); // 18/10/2026
const dia = (mes: number, diaDelMes: number) => new Date(2026, mes - 1, diaDelMes);
const MORA = { tasaMoraMensual: D(2), diasGracia: 0 };

function cuota(numero: number, vence: Date, valor: number, pagado = 0): CuotaDeCartera {
  const estado = pagado >= valor ? EstadoCuota.PAGADA : pagado > 0 ? EstadoCuota.PARCIAL : EstadoCuota.PENDIENTE;
  return { numero, estado, fechaVencimiento: vence, valor: D(valor), aplicaciones: pagado > 0 ? [{ valor: D(pagado) }] : [] };
}

describe('resumirCartera', () => {
  it('una venta al día es verde y no debe nada vencido', () => {
    const resumen = resumirCartera([cuota(0, dia(5, 10), 1_000_000, 1_000_000), cuota(1, dia(12, 10), 1_000_000)], HOY, MORA, 5);
    expect(resumen).toMatchObject({ semaforo: 'VERDE', cuotasVencidas: 0, cuotasPendientes: 1 });
    expect(resumen.saldoVencido.toString()).toBe('0');
    expect(resumen.saldoPorVencer.toString()).toBe('1000000');
    expect(resumen.proximaCuota?.numero).toBe(1);
  });

  it('una cuota que vence dentro de los días de alerta pone el semáforo en amarillo', () => {
    const resumen = resumirCartera([cuota(1, dia(10, 21), 500_000)], HOY, MORA, 5);
    expect(resumen.semaforo).toBe('AMARILLO');
    expect(resumen.cuotasVencidas).toBe(0);
  });

  it('una cuota vencida es roja: saldo vencido e interés de mora por los días de atraso', () => {
    // Vencida el 18/09 (30 días), saldo $1.000.000 a 2 % mensual: interés $20.000.
    const resumen = resumirCartera([cuota(1, dia(9, 18), 1_000_000), cuota(2, dia(11, 18), 1_000_000)], HOY, MORA, 5);
    expect(resumen.semaforo).toBe('ROJO');
    expect(resumen.cuotasVencidas).toBe(1);
    expect(resumen.saldoVencido.toString()).toBe('1000000');
    expect(resumen.interesMora.toString()).toBe('20000');
    expect(resumen.saldoPorVencer.toString()).toBe('1000000');
    expect(resumen.proximaCuota?.numero).toBe(1);
  });

  it('un abono parcial reduce el saldo vencido y el interés', () => {
    const resumen = resumirCartera([cuota(1, dia(9, 18), 1_000_000, 400_000)], HOY, MORA, 5);
    expect(resumen.saldoVencido.toString()).toBe('600000');
    expect(resumen.interesMora.toString()).toBe('12000');
    expect(resumen.cuotasPendientes).toBe(1);
  });

  it('los días de gracia retrasan el interés pero no el vencimiento', () => {
    const resumen = resumirCartera([cuota(1, dia(9, 18), 1_000_000)], HOY, { tasaMoraMensual: D(2), diasGracia: 10 }, 5);
    expect(resumen.cuotasVencidas).toBe(1);
    expect(resumen.interesMora.toDecimalPlaces(2).toString()).toBe('13333.33');
  });

  it('sin tasa de mora configurada el interés es cero aunque haya cuotas vencidas', () => {
    const resumen = resumirCartera([cuota(1, dia(9, 18), 1_000_000)], HOY, { tasaMoraMensual: null, diasGracia: 0 }, 5);
    expect(resumen.semaforo).toBe('ROJO');
    expect(resumen.interesMora.toString()).toBe('0');
  });

  it('una venta pagada del todo no tiene próxima cuota y queda en verde', () => {
    const resumen = resumirCartera([cuota(0, dia(5, 10), 1_000_000, 1_000_000)], HOY, MORA, 5);
    expect(resumen).toMatchObject({ semaforo: 'VERDE', cuotasPendientes: 0, proximaCuota: null });
  });

  it('con varias ventas juntas (todas las de un cliente) el peor semáforo manda y los saldos se suman', () => {
    const alDia = [cuota(1, dia(12, 1), 700_000)];
    const enMora = [cuota(1, dia(9, 18), 1_000_000)];
    const resumen = resumirCartera([...alDia, ...enMora], HOY, MORA, 5);
    expect(resumen.semaforo).toBe('ROJO');
    expect(resumen.saldoVencido.toString()).toBe('1000000');
    expect(resumen.saldoPorVencer.toString()).toBe('700000');
  });
});
