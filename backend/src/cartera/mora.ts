import { Prisma } from '../generated/prisma/client.js';
import { EstadoCuota } from '../generated/prisma/enums.js';

export type Semaforo = 'VERDE' | 'AMARILLO' | 'ROJO';

// Diferencia en días de calendario (ignora la hora del día), para no
// depender de a qué hora exacta se ejecuta el cálculo.
export function diferenciaEnDiasCalendario(desde: Date, hasta: Date): number {
  const inicio = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  const fin = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
  return Math.round((fin.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24));
}

export function calcularSaldoCuota(valorCuota: Prisma.Decimal, abonos: { valor: Prisma.Decimal }[]): Prisma.Decimal {
  const totalAbonado = abonos.reduce((acumulado, abono) => acumulado.plus(abono.valor), new Prisma.Decimal(0));
  const saldo = valorCuota.minus(totalAbonado);
  return saldo.isNegative() ? new Prisma.Decimal(0) : saldo;
}

// Interés simple sobre el saldo vencido, prorrateado por día (tasaMensual
// se reparte en 30 días). Es informativo: no se guarda ni modifica el
// valor original de la cuota.
export function calcularInteresMora(
  saldoVencido: Prisma.Decimal,
  diasAtraso: number,
  tasaMoraMensual: Prisma.Decimal,
): Prisma.Decimal {
  if (diasAtraso <= 0 || saldoVencido.isZero()) {
    return new Prisma.Decimal(0);
  }
  return saldoVencido.mul(tasaMoraMensual).div(100).mul(diasAtraso).div(30);
}

export function calcularDiasHastaVencer(fechaVencimiento: Date, hoy: Date): number {
  return -diferenciaEnDiasCalendario(fechaVencimiento, hoy);
}

export interface ResultadoCuotaVencida {
  diasAtraso: number;
  saldoVencido: Prisma.Decimal;
  interesMora: Prisma.Decimal;
}

// Devuelve null si la cuota ya está paga o si todavía no vence: solo
// interesa cuando de verdad hay algo atrasado que reportar.
export function evaluarCuotaVencida(
  cuota: { estado: EstadoCuota; fechaVencimiento: Date; valor: Prisma.Decimal },
  abonos: { valor: Prisma.Decimal }[],
  hoy: Date,
  tasaMoraMensual: Prisma.Decimal,
): ResultadoCuotaVencida | null {
  if (cuota.estado === EstadoCuota.PAGADA) {
    return null;
  }

  const diasAtraso = diferenciaEnDiasCalendario(cuota.fechaVencimiento, hoy);
  if (diasAtraso <= 0) {
    return null;
  }

  const saldoVencido = calcularSaldoCuota(cuota.valor, abonos);
  return {
    diasAtraso,
    saldoVencido,
    interesMora: calcularInteresMora(saldoVencido, diasAtraso, tasaMoraMensual),
  };
}

export interface CuotaParaSemaforo {
  fechaVencimiento: Date;
  diasHastaVencer: number;
}

// diasHastaVencer > 0: faltan esos días. 0: vence hoy. Negativo: vencida.
export function calcularSemaforo(cuotasPendientes: CuotaParaSemaforo[], diasAlerta: number): Semaforo {
  let peor: Semaforo = 'VERDE';

  for (const cuota of cuotasPendientes) {
    if (cuota.diasHastaVencer < 0) {
      return 'ROJO'; // ya no puede empeorar
    }
    if (cuota.diasHastaVencer <= diasAlerta) {
      peor = 'AMARILLO';
    }
  }

  return peor;
}
