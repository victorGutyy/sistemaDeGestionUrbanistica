import { BadRequestException } from '@nestjs/common';
import { registrarAuditoria, type ActorAuditoria } from '../auditoria/auditoria.js';
import { exigirFechaAbiertaEnTx } from '../cierres-caja/fecha-abierta.js';
import { formatearCOP } from '../common/formato.util.js';
import { Prisma } from '../generated/prisma/client.js';
import { MedioPago, OrigenMovimiento, TipoMovimiento, TipoProyecto } from '../generated/prisma/enums.js';
import { validarMovimientoMaquinaria } from './reglas-maquinaria.js';

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
  // Solo proyectos de maquinaria (RF-MAQ-03 y 04): el equipo, o "general de la flota", y el período alquilado.
  equipoId?: string | null;
  flota?: boolean;
  periodoDesde?: Date | null;
  periodoHasta?: Date | null;
  // Quien registra el movimiento (queda en el movimiento y en la auditoría).
  usuario: ActorAuditoria;
}

const limpiar = (texto: string | null | undefined) => texto?.trim() || null;

// Un día calendario como "aaaa-mm-dd" (las fechas de negocio se guardan a medianoche local).
const aDia = (fecha: Date | null | undefined) =>
  fecha ? `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}` : null;

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

  // Proyectos de maquinaria: equipo o flota, cliente y período del alquiler (RF-MAQ-03, 04 y 06).
  const proyecto = datos.proyectoId ? await tx.proyecto.findUnique({ where: { id: datos.proyectoId }, select: { tipo: true } }) : null;
  validarMovimientoMaquinaria({
    tipo: datos.tipo,
    esProyectoMaquinaria: proyecto?.tipo === TipoProyecto.MAQUINARIA,
    equipoId: datos.equipoId,
    flota: datos.flota,
    periodoDesde: aDia(datos.periodoDesde),
    periodoHasta: aDia(datos.periodoHasta),
    terceroNombre: datos.terceroNombre,
    terceroDocumento: datos.terceroDocumento,
    tieneSoporte: soporteRuta !== null,
    motivoSinSoporte,
    categoriaSoloMaquinaria: 'soloMaquinaria' in categoria && categoria.soloMaquinaria ? categoria.nombre : null,
  });
  let nombreEquipo: string | null = null;
  if (datos.equipoId) {
    const equipo = await tx.equipo.findUnique({ where: { id: datos.equipoId } });
    if (!equipo || equipo.proyectoId !== datos.proyectoId) {
      throw new BadRequestException('El equipo no existe en este proyecto');
    }
    if (equipo.bajaEn) {
      throw new BadRequestException(`El equipo "${equipo.nombre}" está dado de baja: ya no recibe movimientos nuevos`);
    }
    nombreEquipo = equipo.nombre;
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
      equipoId: datos.equipoId ?? null,
      flota: Boolean(datos.flota),
      periodoDesde: datos.periodoDesde ?? null,
      periodoHasta: datos.periodoHasta ?? null,
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
      equipo: nombreEquipo,
      flota: movimiento.flota,
      periodo: movimiento.periodoDesde ? { desde: aDia(movimiento.periodoDesde), hasta: aDia(movimiento.periodoHasta) } : null,
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
