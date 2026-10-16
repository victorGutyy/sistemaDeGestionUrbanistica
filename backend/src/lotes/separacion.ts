import type { Prisma } from '../generated/prisma/client.js';
import { EstadoSeparacion } from '../generated/prisma/enums.js';

// Al vender un lote que estaba separado, la separación activa termina en esa venta (CONVERTIDA).
// Se llama dentro de la misma transacción de la venta.
export async function convertirSeparacionEnTx(tx: Prisma.TransactionClient, loteId: string, ventaId: string) {
  await tx.separacion.updateMany({
    where: { loteId, estado: EstadoSeparacion.ACTIVA },
    data: { estado: EstadoSeparacion.CONVERTIDA, ventaId },
  });
}
