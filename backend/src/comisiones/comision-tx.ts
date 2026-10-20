import { ConflictException, NotFoundException } from '@nestjs/common';
import { registrarAuditoria, type ActorAuditoria } from '../auditoria/auditoria.js';
import { formatearCOP } from '../common/formato.util.js';
import { crearMovimientoEnTx } from '../finanzas/crear-movimiento-tx.js';
import type { Prisma } from '../generated/prisma/client.js';
import { EstadoComision, EstadoMovimiento, MedioPago, OrigenMovimiento, TipoMovimiento } from '../generated/prisma/enums.js';
import { CATEGORIA_COMISIONES, descripcionDelPago, ETIQUETA_ESTADO_COMISION, puedeCambiar } from './reglas-comision.js';

// La categoría de gasto del pago existe desde la migración y el seed; si alguien la borrara de la base, se vuelve a
// crear aquí en vez de dejar la comisión sin poder pagarse.
export async function categoriaComisionesEnTx(tx: Prisma.TransactionClient) {
  const existente = await tx.categoriaGasto.findUnique({ where: { nombre: CATEGORIA_COMISIONES } });
  if (existente) {
    return existente.activa ? existente : tx.categoriaGasto.update({ where: { id: existente.id }, data: { activa: true } });
  }
  return tx.categoriaGasto.create({ data: { nombre: CATEGORIA_COMISIONES, esSistema: true } });
}

// Bloquea la fila de la comisión hasta que termine la transacción: si dos personas la pagan o la anulan al mismo
// tiempo, la segunda espera y luego encuentra el estado ya cambiado (y recibe un conflicto en vez de duplicar el egreso).
export async function bloquearComisionEnTx(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "Comision" WHERE "id" = ${id} FOR UPDATE`;
  const comision = await tx.comision.findUnique({
    where: { id },
    include: { vendedor: true, venta: { include: { lote: true } } },
  });
  if (!comision) {
    throw new NotFoundException(`No existe la comisión ${id}`);
  }
  return comision;
}

export interface DatosPagoComision {
  fecha: Date;
  medioPago: MedioPago;
  cuentaId: string | null;
  referencia?: string | null;
  soporteRuta?: string | null;
  motivoSinSoporte?: string | null;
}

// Paga una comisión (RF-COM-02 y 03): crea el egreso en la categoría Comisiones del proyecto de la venta y marca la
// comisión como pagada. Todo en la misma transacción: si el egreso no se puede crear (por ejemplo, un día de caja ya
// cerrado), la comisión sigue pendiente. La fila se bloquea primero: un pago simultáneo espera y encuentra el estado
// ya cambiado, así que nunca se duplica el egreso.
export async function pagarComisionEnTx(tx: Prisma.TransactionClient, id: string, datos: DatosPagoComision, usuario: ActorAuditoria) {
  const comision = await bloquearComisionEnTx(tx, id);
  if (!puedeCambiar(comision.estado, EstadoComision.PAGADA)) {
    throw new ConflictException(`La comisión ya está ${ETIQUETA_ESTADO_COMISION[comision.estado]}`);
  }

  const categoria = await categoriaComisionesEnTx(tx);
  const movimiento = await crearMovimientoEnTx(tx, {
    tipo: TipoMovimiento.GASTO,
    fecha: datos.fecha,
    valor: comision.valor,
    descripcion: descripcionDelPago({ numeroLote: comision.venta.lote.numero, nombreVendedor: comision.vendedor.nombre }),
    proyectoId: comision.venta.lote.proyectoId,
    categoriaId: categoria.id,
    medioPago: datos.medioPago,
    cuentaId: datos.cuentaId,
    referencia: datos.referencia,
    terceroNombre: comision.vendedor.nombre,
    terceroDocumento: comision.vendedor.documento,
    soporteRuta: datos.soporteRuta,
    motivoSinSoporte: datos.motivoSinSoporte,
    // El egreso no lleva ventaId: esa columna es solo de la devolución de un desistimiento (lo exige la base). El vínculo
    // con la venta está en la propia comisión (Comision.movimientoId).
    origen: OrigenMovimiento.COMISION,
    usuario,
  });

  const pagada = await tx.comision.update({
    where: { id },
    data: { estado: EstadoComision.PAGADA, movimientoId: movimiento.id, pagadaPorId: usuario.id, pagadaEn: new Date() },
  });

  await registrarAuditoria(tx, {
    usuario,
    accion: 'COMISION_PAGAR',
    entidad: 'COMISION',
    entidadId: id,
    resumen: `Pagó la comisión de ${formatearCOP(comision.valor)} a ${comision.vendedor.nombre} (lote ${comision.venta.lote.numero})`,
    antes: { estado: comision.estado, valor: comision.valor },
    despues: {
      estado: EstadoComision.PAGADA,
      valor: comision.valor,
      movimientoId: movimiento.id,
      fecha: datos.fecha,
      medioPago: datos.medioPago,
      cuentaId: datos.cuentaId,
      referencia: datos.referencia ?? null,
      conSoporte: Boolean(datos.soporteRuta),
    },
  });

  return pagada;
}

// Anula una comisión (RF-COM-02): la pendiente solo se marca; la pagada también anula su egreso, para que la caja y las
// finanzas no sigan contando un pago que ya no vale. Todo en la misma transacción. La usan la pantalla de comisiones y
// el desistimiento de una venta (RF-COM-04).
export async function anularComisionEnTx(tx: Prisma.TransactionClient, id: string, motivo: string, usuario: ActorAuditoria) {
  const comision = await bloquearComisionEnTx(tx, id);
  if (!puedeCambiar(comision.estado, EstadoComision.ANULADA)) {
    throw new ConflictException(`La comisión ya está ${ETIQUETA_ESTADO_COMISION[comision.estado]}`);
  }
  const motivoLimpio = motivo.trim();
  const ahora = new Date();

  if (comision.estado === EstadoComision.PAGADA && comision.movimientoId) {
    const movimiento = await tx.movimientoFinanciero.findUniqueOrThrow({ where: { id: comision.movimientoId } });
    const { count } = await tx.movimientoFinanciero.updateMany({
      where: { id: movimiento.id, estado: EstadoMovimiento.ACTIVO },
      data: { estado: EstadoMovimiento.ANULADO, anuladoPorId: usuario.id, anuladoEn: ahora, motivoAnulacion: `Anulación de la comisión: ${motivoLimpio}` },
    });
    if (count === 0) {
      throw new ConflictException('El egreso de esta comisión ya estaba anulado');
    }
    await registrarAuditoria(tx, {
      usuario,
      accion: 'MOVIMIENTO_ANULAR',
      entidad: 'MOVIMIENTO',
      entidadId: movimiento.id,
      resumen: `Anuló el egreso de ${formatearCOP(movimiento.valor)} (${movimiento.descripcion}) al anular la comisión: ${motivoLimpio}`,
      antes: { estado: EstadoMovimiento.ACTIVO, valor: movimiento.valor, fecha: movimiento.fecha },
      despues: { estado: EstadoMovimiento.ANULADO, motivoAnulacion: `Anulación de la comisión: ${motivoLimpio}` },
    });
  }

  const anulada = await tx.comision.update({
    where: { id },
    data: { estado: EstadoComision.ANULADA, anuladaPorId: usuario.id, anuladaEn: ahora, motivoAnulacion: motivoLimpio },
  });

  await registrarAuditoria(tx, {
    usuario,
    accion: 'COMISION_ANULAR',
    entidad: 'COMISION',
    entidadId: id,
    resumen: `Anuló la comisión de ${formatearCOP(comision.valor)} de ${comision.vendedor.nombre} (lote ${comision.venta.lote.numero}), que estaba ${ETIQUETA_ESTADO_COMISION[comision.estado]}: ${motivoLimpio}`,
    antes: { estado: comision.estado, valor: comision.valor, movimientoId: comision.movimientoId },
    despues: { estado: anulada.estado, motivoAnulacion: motivoLimpio },
  });

  return anulada;
}
