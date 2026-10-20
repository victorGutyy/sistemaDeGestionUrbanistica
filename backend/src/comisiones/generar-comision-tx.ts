import { registrarAuditoria, type ActorAuditoria } from '../auditoria/auditoria.js';
import { formatearCOP } from '../common/formato.util.js';
import type { Prisma } from '../generated/prisma/client.js';
import { valorDeLaComision } from './reglas-comision.js';

// Genera la comisión de una venta (RF-COM-01). Se llama dentro de la transacción en que la venta queda ACTIVA (al
// registrarla ya activa o al aprobar la excepción), así que o quedan las dos cosas o ninguna.
//
// No genera nada si la venta no tiene vendedor, si ya tiene su comisión (llamarla dos veces no duplica) o si el tipo
// del vendedor no tiene valor configurado. Devuelve la comisión creada o null.
export async function generarComisionEnTx(
  tx: Prisma.TransactionClient,
  venta: { id: string; vendedorId: string | null; numeroLote: string },
  usuario: ActorAuditoria,
) {
  if (!venta.vendedorId) return null;

  const existente = await tx.comision.findUnique({ where: { ventaId: venta.id }, select: { id: true } });
  if (existente) return null;

  const vendedor = await tx.vendedor.findUnique({ where: { id: venta.vendedorId } });
  if (!vendedor) return null;

  const configurada = await tx.comisionTipoVendedor.findUnique({ where: { tipo: vendedor.tipo } });
  const valor = valorDeLaComision(configurada?.valor);
  if (!valor) return null;

  const comision = await tx.comision.create({
    data: { ventaId: venta.id, vendedorId: vendedor.id, tipoVendedor: vendedor.tipo, valor },
  });

  await registrarAuditoria(tx, {
    usuario,
    accion: 'COMISION_GENERAR',
    entidad: 'COMISION',
    entidadId: comision.id,
    resumen: `Se generó la comisión de ${formatearCOP(valor)} para ${vendedor.nombre} por la venta del lote ${venta.numeroLote}`,
    despues: { ventaId: venta.id, vendedor: vendedor.nombre, tipoVendedor: vendedor.tipo, valor, estado: comision.estado },
  });

  return comision;
}
