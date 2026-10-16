import type { Prisma } from '../generated/prisma/client.js';

// Series de consecutivos. Cada serie lleva su propia cuenta: los recibos históricos (abonos importados o
// anteriores al sistema) no mezclan su numeración con la de los recibos reales.
export const SERIE_RECIBO_CAJA = 'RECIBO_CAJA';
export const SERIE_RECIBO_HISTORICO = 'RECIBO_HISTORICO';
export const PREFIJO_RECIBO_HISTORICO = 'H-';
// Los cierres de caja llevan su propia numeración (CC-000001), asignada al cerrar por primera vez.
export const SERIE_CIERRE_CAJA = 'CIERRE_CAJA';
export const PREFIJO_CIERRE_CAJA = 'CC-';

// Entrega el siguiente número de la serie, sin repetidos y sin huecos:
//
// - Se llama DENTRO de la transacción que usa el número. El INSERT ... ON CONFLICT DO UPDATE toma el
//   bloqueo de la fila del contador: una segunda transacción espera a que la primera termine, así que
//   nunca reciben el mismo número.
// - Si la transacción falla y se revierte, el incremento se revierte con ella: el número no se consume
//   y no queda un hueco.
// - Un recibo anulado conserva su número; nada lo reutiliza (el contador solo avanza).
export async function siguienteConsecutivo(tx: Prisma.TransactionClient, serie: string): Promise<number> {
  const filas = await tx.$queryRaw<{ ultimo: number }[]>`
    INSERT INTO "Consecutivo" ("serie", "ultimo") VALUES (${serie}, 1)
    ON CONFLICT ("serie") DO UPDATE SET "ultimo" = "Consecutivo"."ultimo" + 1
    RETURNING "ultimo"`;
  return Number(filas[0].ultimo);
}

// RC-000123: el prefijo se guarda con el recibo al emitirlo, así que cambiarlo después no altera los ya emitidos.
export function formatearNumeroRecibo(prefijo: string, numero: number): string {
  return `${prefijo}${String(numero).padStart(6, '0')}`;
}
