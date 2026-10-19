import { Prisma } from '../generated/prisma/client.js';
import { EstadoCuota } from '../generated/prisma/enums.js';
import { calcularDiasHastaVencer, calcularSemaforo, evaluarCuotaPendiente, type ParametrosMora, type Semaforo } from './mora.js';

// Una cuota con lo aplicado por abonos ACTIVOS (los anulados ya no cuentan).
export interface CuotaDeCartera {
  numero: number;
  estado: EstadoCuota;
  fechaVencimiento: Date;
  valor: Prisma.Decimal;
  aplicaciones: { valor: Prisma.Decimal }[];
}

export interface ResumenCartera<T extends CuotaDeCartera = CuotaDeCartera> {
  semaforo: Semaforo;
  // Lo que ya venció y no se ha pagado, y el interés de mora que causa (informativo).
  saldoVencido: Prisma.Decimal;
  interesMora: Prisma.Decimal;
  // Lo pendiente que todavía no vence.
  saldoPorVencer: Prisma.Decimal;
  cuotasVencidas: number;
  cuotasPendientes: number;
  // La cuota no pagada que vence primero.
  proximaCuota: T | null;
}

// Único lugar donde se calcula el estado de cartera de un conjunto de cuotas (de una venta o de todas las de un
// cliente): semáforo, saldo vencido, interés de mora y próxima cuota. Lo usan la cartera, la ficha del cliente, el
// estado de cuenta y el detalle de la venta, para que los cuatro muestren siempre los mismos números.
export function resumirCartera<T extends CuotaDeCartera>(
  cuotas: T[],
  hoy: Date,
  mora: ParametrosMora,
  diasAlertaAmarilla: number,
): ResumenCartera<T> {
  const pendientes = cuotas.filter((cuota) => cuota.estado !== EstadoCuota.PAGADA);

  let saldoVencido = new Prisma.Decimal(0);
  let interesMora = new Prisma.Decimal(0);
  let saldoPorVencer = new Prisma.Decimal(0);
  let cuotasVencidas = 0;

  for (const cuota of pendientes) {
    const evaluacion = evaluarCuotaPendiente(cuota, cuota.aplicaciones, hoy, mora);
    if (!evaluacion) continue;
    if (evaluacion.vencida) {
      saldoVencido = saldoVencido.plus(evaluacion.saldo);
      interesMora = interesMora.plus(evaluacion.interesMora);
      cuotasVencidas += 1;
    } else {
      saldoPorVencer = saldoPorVencer.plus(evaluacion.saldo);
    }
  }

  const semaforo = calcularSemaforo(
    pendientes.map((cuota) => ({ fechaVencimiento: cuota.fechaVencimiento, diasHastaVencer: calcularDiasHastaVencer(cuota.fechaVencimiento, hoy) })),
    diasAlertaAmarilla,
  );

  const proximaCuota =
    pendientes.slice().sort((a, b) => a.fechaVencimiento.getTime() - b.fechaVencimiento.getTime() || a.numero - b.numero)[0] ?? null;

  return { semaforo, saldoVencido, interesMora, saldoPorVencer, cuotasVencidas, cuotasPendientes: pendientes.length, proximaCuota };
}
