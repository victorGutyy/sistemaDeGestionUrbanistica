import { BadRequestException } from '@nestjs/common';
import { registrarAuditoria, type ActorAuditoria } from '../auditoria/auditoria.js';
import { exigirFechaAbiertaEnTx } from '../cierres-caja/fecha-abierta.js';
import { formatearCOP } from '../common/formato.util.js';
import { Prisma } from '../generated/prisma/client.js';
import { MedioPago, OrigenMovimiento, TipoMovimiento } from '../generated/prisma/enums.js';

// Egreso del sistema que se crea solo al registrar el desistimiento de una venta con valor a devolver.
// Es una categoría "del sistema": el gerente no la puede renombrar ni desactivar.
export const CATEGORIA_DEVOLUCION_DESISTIMIENTO = 'Devolución por desistimiento';

export interface DatosMovimiento {
  tipo: TipoMovimiento;
  fecha: Date;
  valor: Prisma.Decimal;
  descripcion: string;
  proyectoId?: string | null;
  // Una categoría del tipo del movimiento: de gasto para un egreso, de ingreso para un ingreso.
  categoriaId: string;
  medioPago: MedioPago;
  cuentaId?: string | null;
  referencia?: string | null;
  terceroNombre?: string | null;
  terceroDocumento?: string | null;
  numeroDocumento?: string | null;
  soporteRuta?: string | null;
  motivoSinSoporte?: string | null;
  origen?: OrigenMovimiento;
  ventaId?: string | null;
  // Quien registra el movimiento (queda en el movimiento y en la auditoría).
  usuario: ActorAuditoria;
}

const limpiar = (texto: string | null | undefined) => texto?.trim() || null;

// Único lugar donde se crea un movimiento financiero (lo usan el registro manual y el desistimiento).
// Valida lo que la base de datos también exige, para dar mensajes claros en vez de errores de restricción.
export async function crearMovimientoEnTx(tx: Prisma.TransactionClient, datos: DatosMovimiento) {
  if (datos.valor.lessThanOrEqualTo(0) || !datos.valor.isInteger()) {
    throw new BadRequestException('El valor debe ser un número entero de pesos mayor a cero');
  }

  // Un día que ya pertenece a un cierre de caja cerrado o aprobado no admite movimientos nuevos.
  await exigirFechaAbiertaEnTx(tx, datos.fecha);

  const esGasto = datos.tipo === TipoMovimiento.GASTO;
  const categoria = esGasto
    ? await tx.categoriaGasto.findUnique({ where: { id: datos.categoriaId } })
    : await tx.categoriaIngreso.findUnique({ where: { id: datos.categoriaId } });
  if (!categoria) {
    throw new BadRequestException(`La categoría no existe entre las de ${esGasto ? 'gasto' : 'ingreso'}`);
  }
  if (!categoria.activa) {
    throw new BadRequestException(`La categoría "${categoria.nombre}" está desactivada: elige otra`);
  }

  const soporteRuta = limpiar(datos.soporteRuta);
  const motivoSinSoporte = limpiar(datos.motivoSinSoporte);
  if (esGasto && !soporteRuta && !motivoSinSoporte) {
    throw new BadRequestException('Adjunta el soporte del egreso o explica por qué no hay soporte');
  }

  const movimiento = await tx.movimientoFinanciero.create({
    data: {
      tipo: datos.tipo,
      fecha: datos.fecha,
      valor: datos.valor,
      descripcion: datos.descripcion.trim(),
      proyectoId: datos.proyectoId ?? null,
      categoriaGastoId: esGasto ? categoria.id : null,
      categoriaIngresoId: esGasto ? null : categoria.id,
      medioPago: datos.medioPago,
      cuentaId: datos.cuentaId ?? null,
      referencia: limpiar(datos.referencia),
      terceroNombre: limpiar(datos.terceroNombre),
      terceroDocumento: limpiar(datos.terceroDocumento),
      numeroDocumento: limpiar(datos.numeroDocumento),
      soporteRuta,
      // Si hay soporte, el motivo sobra.
      motivoSinSoporte: soporteRuta ? null : motivoSinSoporte,
      origen: datos.origen ?? OrigenMovimiento.MANUAL,
      ventaId: datos.ventaId ?? null,
      registradoPorId: datos.usuario.id,
    },
  });

  await registrarAuditoria(tx, {
    usuario: datos.usuario,
    accion: 'MOVIMIENTO_REGISTRAR',
    entidad: 'MOVIMIENTO',
    entidadId: movimiento.id,
    resumen: `Registró ${esGasto ? 'un egreso' : 'un ingreso'} de ${formatearCOP(datos.valor)} (${categoria.nombre}): ${datos.descripcion.trim()}`,
    despues: {
      tipo: datos.tipo,
      fecha: datos.fecha,
      valor: datos.valor,
      descripcion: datos.descripcion.trim(),
      categoria: categoria.nombre,
      proyectoId: datos.proyectoId ?? null,
      medioPago: datos.medioPago,
      cuentaId: datos.cuentaId ?? null,
      referencia: movimiento.referencia,
      tercero: movimiento.terceroNombre,
      numeroDocumento: movimiento.numeroDocumento,
      conSoporte: movimiento.soporteRuta !== null,
      motivoSinSoporte: movimiento.motivoSinSoporte,
      origen: movimiento.origen,
      ventaId: movimiento.ventaId,
    },
  });

  return movimiento;
}

// La categoría de la devolución existe desde la migración y el seed; si alguien la borrara de la base,
// se vuelve a crear aquí en vez de dejar la devolución sin poder registrarse.
export async function categoriaDevolucionDesistimientoEnTx(tx: Prisma.TransactionClient) {
  const existente = await tx.categoriaGasto.findUnique({ where: { nombre: CATEGORIA_DEVOLUCION_DESISTIMIENTO } });
  if (existente) {
    return existente.activa ? existente : tx.categoriaGasto.update({ where: { id: existente.id }, data: { activa: true } });
  }
  return tx.categoriaGasto.create({ data: { nombre: CATEGORIA_DEVOLUCION_DESISTIMIENTO, esSistema: true } });
}
