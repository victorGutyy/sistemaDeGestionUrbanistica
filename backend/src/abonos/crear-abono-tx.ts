import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  PREFIJO_RECIBO_HISTORICO,
  SERIE_RECIBO_CAJA,
  SERIE_RECIBO_HISTORICO,
  formatearNumeroRecibo,
  siguienteConsecutivo,
} from '../consecutivos/consecutivo.js';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoAbono, EstadoCuota, MedioPago } from '../generated/prisma/enums.js';
import { construirContenidoRecibo, type EmpresaRecibo } from './recibo-contenido.js';
import { repartirAbono, type ParteAplicada } from './repartir-abono.js';

// Contexto con el que se emite el recibo de un abono: la empresa tal como está HOY en la configuración y
// quién recibió el dinero. Se resuelve antes de abrir la transacción.
export interface ContextoRecibo {
  empresa: EmpresaRecibo;
  prefijoRecibo: string;
  recibidoPor: string;
}

export interface DatosAbono {
  ventaId: string;
  fecha: Date;
  valor: Prisma.Decimal;
  medioPago: MedioPago;
  cuentaDestinoId?: string | null;
  referencia?: string | null;
  comprobanteUrl?: string;
  registradoPorId: string | null;
  // Si se indica, el abono se aplica SOLO a esa cuota (la cuota inicial recibida al vender).
  soloCuotaId?: string;
  // Abonos importados o anteriores al sistema: su recibo sale de la serie histórica (H-).
  esHistorico?: boolean;
}

const MENSAJE_REFERENCIA_REPETIDA = (numeroRecibo?: string) =>
  `Esa referencia de transacción ya está registrada en esta cuenta${numeroRecibo ? ` (recibo ${numeroRecibo})` : ''}. Si es otro pago, revisa la referencia`;

// Único lugar donde se crea un abono. Lo usan el registro de abonos y la venta (cuando la cuota inicial
// se recibe al vender). Todo ocurre dentro de la MISMA transacción:
//   1. se bloquea la venta (dos abonos simultáneos sobre la misma venta se hacen en fila);
//   2. el abono se reparte entre las cuotas pendientes por orden de vencimiento;
//   3. se guarda el abono, cómo se aplicó y el estado de cada cuota;
//   4. se toma el siguiente consecutivo y se emite el recibo.
// Si cualquier paso falla, no queda nada guardado y el consecutivo no se consume.
export async function crearAbonoEnTx(tx: Prisma.TransactionClient, datos: DatosAbono, contexto: ContextoRecibo) {
  await tx.$queryRaw`SELECT "id" FROM "Venta" WHERE "id" = ${datos.ventaId} FOR UPDATE`;

  const venta = await tx.venta.findUnique({
    where: { id: datos.ventaId },
    include: {
      cliente: true,
      lote: { include: { proyecto: true, manzana: true } },
      cuotas: { include: { aplicaciones: { where: { abono: { estado: EstadoAbono.ACTIVO } }, select: { valor: true } } } },
      abonos: { where: { estado: EstadoAbono.ACTIVO }, select: { valor: true } },
    },
  });
  if (!venta) {
    throw new NotFoundException(`No existe la venta ${datos.ventaId}`);
  }

  const cuentaDestino = datos.cuentaDestinoId
    ? await tx.cuentaBancaria.findUnique({ where: { id: datos.cuentaDestinoId } })
    : null;

  const referencia = datos.referencia?.trim() || null;
  if (referencia && datos.cuentaDestinoId) {
    const repetido = await tx.abono.findFirst({
      where: { cuentaDestinoId: datos.cuentaDestinoId, estado: EstadoAbono.ACTIVO, referencia: { equals: referencia, mode: 'insensitive' } },
      include: { recibo: { select: { numeroTexto: true } } },
    });
    if (repetido) {
      throw new ConflictException(MENSAJE_REFERENCIA_REPETIDA(repetido.recibo?.numeroTexto));
    }
  }

  const pagadoAntes = venta.abonos.reduce((total, abono) => total.plus(abono.valor), new Prisma.Decimal(0));
  const saldoAnterior = venta.valorTotal.minus(pagadoAntes);

  const cuotasPorCubrir = venta.cuotas
    .filter((cuota) => !datos.soloCuotaId || cuota.id === datos.soloCuotaId)
    .map((cuota) => ({
      id: cuota.id,
      numero: cuota.numero,
      fechaVencimiento: cuota.fechaVencimiento,
      valor: cuota.valor,
      pagado: cuota.aplicaciones.reduce((total, aplicacion) => total.plus(aplicacion.valor), new Prisma.Decimal(0)),
    }));
  const { partes, sobrante } = repartirAbono(datos.valor, cuotasPorCubrir);
  if (sobrante.greaterThan(0)) {
    throw new BadRequestException(
      saldoAnterior.lessThanOrEqualTo(0)
        ? 'Esta venta ya está pagada por completo'
        : `El abono (${datos.valor.toString()}) supera el saldo pendiente de la venta (${saldoAnterior.toString()})`,
    );
  }

  let abono;
  try {
    abono = await tx.abono.create({
      data: {
        ventaId: datos.ventaId,
        fecha: datos.fecha,
        valor: datos.valor,
        medioPago: datos.medioPago,
        cuentaDestinoId: datos.cuentaDestinoId ?? null,
        referencia,
        comprobanteUrl: datos.comprobanteUrl,
        registradoPorId: datos.registradoPorId,
      },
    });
  } catch (error) {
    // Respaldo de la regla de referencia única de la base de datos (dos pagos simultáneos con la misma referencia).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(MENSAJE_REFERENCIA_REPETIDA());
    }
    throw error;
  }

  await tx.aplicacionAbono.createMany({
    data: partes.map((parte) => ({ abonoId: abono.id, cuotaId: parte.cuotaId, valor: parte.valor })),
  });
  for (const parte of partes) {
    await recalcularEstadoCuotaEnTx(tx, parte.cuotaId);
  }

  const recibo = await emitirReciboEnTx(tx, {
    abonoId: abono.id,
    esHistorico: datos.esHistorico ?? false,
    prefijoRecibo: contexto.prefijoRecibo,
    contenido: {
      empresa: contexto.empresa,
      cliente: { nombre: venta.cliente.nombre, documento: venta.cliente.documento },
      proyecto: venta.lote.proyecto.nombre,
      manzana: venta.lote.manzana?.nombre ?? null,
      lote: venta.lote.numero,
      fechaAbono: datos.fecha,
      valor: datos.valor,
      medioPago: datos.medioPago,
      cuenta: cuentaDestino ? { banco: cuentaDestino.banco, alias: cuentaDestino.alias, numero: cuentaDestino.numero } : null,
      referencia,
      conSoporte: Boolean(datos.comprobanteUrl),
      cuotasCubiertas: partes.map(cuotaCubierta),
      saldoAnterior,
      saldoNuevo: saldoAnterior.minus(datos.valor),
      recibidoPor: contexto.recibidoPor,
    },
  });

  return { abono, recibo, partes };
}

function cuotaCubierta(parte: ParteAplicada) {
  return { numero: parte.numero, valor: parte.valor, completa: parte.cubreCompleta };
}

interface DatosRecibo {
  abonoId: string;
  esHistorico: boolean;
  prefijoRecibo: string;
  contenido: Omit<Parameters<typeof construirContenidoRecibo>[0], 'numeroTexto' | 'esHistorico' | 'fechaEmision'>;
  fechaEmision?: Date;
}

// Asigna el consecutivo y guarda el recibo con su fotografía. Se llama dentro de la transacción del abono.
export async function emitirReciboEnTx(tx: Prisma.TransactionClient, datos: DatosRecibo) {
  const serie = datos.esHistorico ? SERIE_RECIBO_HISTORICO : SERIE_RECIBO_CAJA;
  const prefijo = datos.esHistorico ? PREFIJO_RECIBO_HISTORICO : datos.prefijoRecibo;
  const numero = await siguienteConsecutivo(tx, serie);
  const numeroTexto = formatearNumeroRecibo(prefijo, numero);

  const contenido = construirContenidoRecibo({
    ...datos.contenido,
    numeroTexto,
    esHistorico: datos.esHistorico,
    fechaEmision: datos.fechaEmision ?? new Date(),
  });

  return tx.recibo.create({
    data: {
      serie,
      numero,
      numeroTexto,
      abonoId: datos.abonoId,
      esHistorico: datos.esHistorico,
      contenido: contenido as unknown as Prisma.InputJsonValue,
    },
  });
}

// Una cuota está PAGADA, PARCIAL o PENDIENTE según lo aplicado por abonos ACTIVOS (los anulados ya no cuentan).
export async function recalcularEstadoCuotaEnTx(tx: Prisma.TransactionClient, cuotaId: string) {
  const cuota = await tx.cuota.findUniqueOrThrow({ where: { id: cuotaId } });
  const { _sum } = await tx.aplicacionAbono.aggregate({
    where: { cuotaId, abono: { estado: EstadoAbono.ACTIVO } },
    _sum: { valor: true },
  });
  const pagado = _sum.valor ?? new Prisma.Decimal(0);

  const nuevoEstado = pagado.greaterThanOrEqualTo(cuota.valor)
    ? EstadoCuota.PAGADA
    : pagado.greaterThan(0)
      ? EstadoCuota.PARCIAL
      : EstadoCuota.PENDIENTE;

  if (nuevoEstado !== cuota.estado) {
    await tx.cuota.update({ where: { id: cuotaId }, data: { estado: nuevoEstado } });
  }
}

// Anulación (RF-REC-07 y 08): el abono y su recibo se conservan, marcados como anulados con quién, cuándo y por qué;
// el efecto sobre las cuotas se revierte; el consecutivo no se reutiliza (el contador solo avanza).
export async function anularAbonoEnTx(tx: Prisma.TransactionClient, abonoId: string, motivo: string, usuarioId: string) {
  const existente = await tx.abono.findUnique({ where: { id: abonoId }, select: { ventaId: true } });
  if (!existente) {
    throw new NotFoundException(`No existe el abono ${abonoId}`);
  }
  await tx.$queryRaw`SELECT "id" FROM "Venta" WHERE "id" = ${existente.ventaId} FOR UPDATE`;

  const abono = await tx.abono.findUniqueOrThrow({ where: { id: abonoId }, include: { aplicaciones: true } });
  if (abono.estado === EstadoAbono.ANULADO) {
    throw new ConflictException('Este abono ya está anulado');
  }

  const anulado = await tx.abono.update({
    where: { id: abonoId },
    data: { estado: EstadoAbono.ANULADO, anuladoPorId: usuarioId, anuladoEn: new Date(), motivoAnulacion: motivo },
    include: { recibo: true },
  });

  for (const aplicacion of abono.aplicaciones) {
    await recalcularEstadoCuotaEnTx(tx, aplicacion.cuotaId);
  }

  return anulado;
}
