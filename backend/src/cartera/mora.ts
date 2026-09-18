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

export interface ResultadoCuotaPendiente {
  vencida: boolean;
  diasAtraso: number;
  saldo: Prisma.Decimal;
  interesMora: Prisma.Decimal;
}

// Clasifica una cuota no pagada como "vencida" o "por vencer" y trae su
// saldo pendiente (con interés de mora si aplica). Devuelve null solo
// cuando la cuota ya está PAGADA — ahí no hay nada que reportar.
export function evaluarCuotaPendiente(
  cuota: { estado: EstadoCuota; fechaVencimiento: Date; valor: Prisma.Decimal },
  abonos: { valor: Prisma.Decimal }[],
  hoy: Date,
  tasaMoraMensual: Prisma.Decimal,
): ResultadoCuotaPendiente | null {
  if (cuota.estado === EstadoCuota.PAGADA) {
    return null;
  }

  const diasAtraso = diferenciaEnDiasCalendario(cuota.fechaVencimiento, hoy);
  const vencida = diasAtraso > 0;
  const saldo = calcularSaldoCuota(cuota.valor, abonos);

  return {
    vencida,
    diasAtraso,
    saldo,
    interesMora: vencida ? calcularInteresMora(saldo, diasAtraso, tasaMoraMensual) : new Prisma.Decimal(0),
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
