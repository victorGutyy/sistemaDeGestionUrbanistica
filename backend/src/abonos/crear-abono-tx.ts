import { Prisma } from '../generated/prisma/client.js';
import { EstadoCuota, MedioPago } from '../generated/prisma/enums.js';

export interface DatosAbono {
  ventaId: string;
  cuotaId?: string;
  fecha: Date;
  valor: Prisma.Decimal;
  medioPago: MedioPago;
  comprobanteUrl?: string;
}

// Único lugar donde se crea un abono: lo usan el registro de abonos y la venta (cuando la
// cuota inicial se recibe al momento de vender). Se llama DENTRO de una transacción y deja
// la cuota con su estado al día. Los recibos de caja se agregan aquí para que todo abono,
// venga de donde venga, pase por el mismo camino.
export async function crearAbonoEnTx(tx: Prisma.TransactionClient, datos: DatosAbono) {
  const abono = await tx.abono.create({
    data: {
      ventaId: datos.ventaId,
      cuotaId: datos.cuotaId,
      fecha: datos.fecha,
      valor: datos.valor,
      medioPago: datos.medioPago,
      comprobanteUrl: datos.comprobanteUrl,
    },
  });

  if (datos.cuotaId) {
    await actualizarEstadoCuota(tx, datos.cuotaId);
  }

  return abono;
}

async function actualizarEstadoCuota(tx: Prisma.TransactionClient, cuotaId: string) {
  const cuota = await tx.cuota.findUniqueOrThrow({ where: { id: cuotaId } });
  const abonos = await tx.abono.findMany({ where: { cuotaId } });
  const totalAbonado = abonos.reduce((acumulado, abono) => acumulado.plus(abono.valor), new Prisma.Decimal(0));

  const nuevoEstado = totalAbonado.greaterThanOrEqualTo(cuota.valor)
    ? EstadoCuota.PAGADA
    : totalAbonado.greaterThan(0)
      ? EstadoCuota.PARCIAL
      : EstadoCuota.PENDIENTE;

  if (nuevoEstado !== cuota.estado) {
    await tx.cuota.update({ where: { id: cuotaId }, data: { estado: nuevoEstado } });
  }
}
