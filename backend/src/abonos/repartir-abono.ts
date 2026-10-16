import { Prisma } from '../generated/prisma/client.js';

export interface CuotaPorCubrir {
  id: string;
  numero: number;
  fechaVencimiento: Date;
  valor: Prisma.Decimal;
  /** Lo ya pagado con abonos activos. */
  pagado: Prisma.Decimal;
}

export interface ParteAplicada {
  cuotaId: string;
  numero: number;
  valor: Prisma.Decimal;
  /** Lo que le faltaba a la cuota antes de este abono. */
  saldoAntes: Prisma.Decimal;
  /** true si con este abono la cuota queda pagada del todo. */
  cubreCompleta: boolean;
}

// RF-REC-03: el abono se aplica a las cuotas en orden de vencimiento (la cuota inicial primero, luego la 1, la 2…).
// Puede pagar una cuota solo en parte, o cubrir varias. Lo que sobre después de la última cuota pendiente
// se devuelve como "sobrante" (el abono no puede superar el saldo de la venta).
export function repartirAbono(valor: Prisma.Decimal, cuotas: CuotaPorCubrir[]): { partes: ParteAplicada[]; sobrante: Prisma.Decimal } {
  const pendientes = cuotas
    .map((cuota) => ({ cuota, saldo: cuota.valor.minus(cuota.pagado) }))
    .filter(({ saldo }) => saldo.greaterThan(0))
    .sort(
      (a, b) => a.cuota.fechaVencimiento.getTime() - b.cuota.fechaVencimiento.getTime() || a.cuota.numero - b.cuota.numero,
    );

  let restante = valor;
  const partes: ParteAplicada[] = [];

  for (const { cuota, saldo } of pendientes) {
    if (restante.lessThanOrEqualTo(0)) break;
    const aplicado = Prisma.Decimal.min(restante, saldo);
    partes.push({
      cuotaId: cuota.id,
      numero: cuota.numero,
      valor: aplicado,
      saldoAntes: saldo,
      cubreCompleta: aplicado.equals(saldo),
    });
    restante = restante.minus(aplicado);
  }

  return { partes, sobrante: restante };
}
