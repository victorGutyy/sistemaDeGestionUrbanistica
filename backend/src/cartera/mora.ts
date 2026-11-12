import { Prisma } from '../generated/prisma/client.js';
import { EstadoCuota } from '../generated/prisma/enums.js';
import { diasCubiertosPorAcuerdos, type PeriodoSinInteres } from './acuerdos-pago.js';

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

export interface ParametrosMora {
  /** Tasa mensual en porcentaje, o null si el gerente todavía no la define (no se cobra interés). */
  tasaMoraMensual: Prisma.Decimal | null;
  /** Días después del vencimiento en los que todavía no se causa interés. */
  diasGracia: number;
}

// Clasifica una cuota no pagada como "vencida" o "por vencer" y trae su
// saldo pendiente (con interés de mora si aplica). Devuelve null solo
// cuando la cuota ya está PAGADA — ahí no hay nada que reportar.
//
// "Vencida" depende solo de la fecha de vencimiento. Los días de gracia
// únicamente retrasan el interés: solo se cobran los días que pasan de la gracia. Los días cubiertos por un acuerdo de
// pago de la venta (CC-07) tampoco causan interés, pero sí cuentan como atraso.
export function evaluarCuotaPendiente(
  // periodosSinInteres: los acuerdos de pago de la venta de la cuota (CC-07); los días que cubren no causan interés.
  cuota: { estado: EstadoCuota; fechaVencimiento: Date; valor: Prisma.Decimal; periodosSinInteres?: PeriodoSinInteres[] },
  abonos: { valor: Prisma.Decimal }[],
  hoy: Date,
  { tasaMoraMensual, diasGracia }: ParametrosMora,
): ResultadoCuotaPendiente | null {
  if (cuota.estado === EstadoCuota.PAGADA) {
    return null;
  }

  const diasAtraso = diferenciaEnDiasCalendario(cuota.fechaVencimiento, hoy);
  const vencida = diasAtraso > 0;
  const saldo = calcularSaldoCuota(cuota.valor, abonos);

  const diasExentos = cuota.periodosSinInteres ? diasCubiertosPorAcuerdos(cuota.fechaVencimiento, diasGracia, hoy, cuota.periodosSinInteres) : 0;
  const diasConInteres = Math.max(0, diasAtraso - diasGracia - diasExentos);
  const interesMora =
    vencida && tasaMoraMensual ? calcularInteresMora(saldo, diasConInteres, tasaMoraMensual) : new Prisma.Decimal(0);

  return { vencida, diasAtraso, saldo, interesMora };
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
