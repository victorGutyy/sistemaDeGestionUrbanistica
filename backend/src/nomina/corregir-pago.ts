import { BadRequestException, NotFoundException } from '@nestjs/common';
import { validarCuentaDestino } from '../abonos/validar-pago.js';
import { registrarAuditoria } from '../auditoria/auditoria.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { exigirFechaAbiertaEnTx } from '../cierres-caja/fecha-abierta.js';
import { parsearFechaLocal, formatearFechaISO } from '../common/fecha.util.js';
import { formatearCOP } from '../common/formato.util.js';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoProyecto, MedioPago } from '../generated/prisma/enums.js';
import { calcularPagoPorDias } from './calculo-pago.js';
import type { CorregirPagoNominaDto } from './dto/corregir-pago-nomina.dto.js';
import { CLAVE_BLOQUEO_NOMINA, exigirFechaReal, prepararNovedades, type AvisoLiquidacion, type NovedadPreparada } from './liquidar-quincena.js';

// CC-09 (RF-PER-26): corregir un pago de nómina ya liquidado por obra. Se recalcula con la misma fórmula de la liquidación y
// queda en la auditoría con lo anterior, lo nuevo y el motivo. El trabajador, la obra y el período no se cambian.

const MS_POR_DIA = 86_400_000;
const formatearDia = (fecha: Date) => `${String(fecha.getDate()).padStart(2, '0')}/${String(fecha.getMonth() + 1).padStart(2, '0')}/${fecha.getFullYear()}`;

// Lo que se guarda de un pago, en la forma que se compara y se audita.
interface FotoPago {
  dias: string;
  valorDia: string;
  horasExtra: string;
  valorHoraExtra: string;
  valorDevengado: string;
  valorPagado: string;
  observaciones: string;
  fechaPago: string;
  medioPago: MedioPago;
  cuentaId: string | null;
  novedades: { tipo: string; valor: string; descripcion: string }[];
}

type PagoConNovedades = Prisma.PagoNominaGetPayload<{ include: { novedades: true } }>;

function fotoDelPago(pago: PagoConNovedades): FotoPago {
  return {
    dias: String(pago.dias ?? 0),
    valorDia: String(pago.valorDia ?? 0),
    horasExtra: String(pago.horasExtra ?? 0),
    valorHoraExtra: String(pago.valorHoraExtra ?? 0),
    valorDevengado: String(pago.valorDevengado ?? 0),
    valorPagado: pago.valorPagado.toString(),
    observaciones: pago.observaciones ?? '',
    fechaPago: formatearFechaISO(pago.fechaPago),
    medioPago: pago.medioPago,
    cuentaId: pago.cuentaId,
    novedades: ordenarNovedades(pago.novedades.map((n) => ({ tipo: n.tipo, valor: n.valor.toString(), descripcion: n.descripcion ?? '' }))),
  };
}

const ordenarNovedades = (novedades: FotoPago['novedades']) => [...novedades].sort((a, b) => `${a.tipo}|${a.valor}|${a.descripcion}`.localeCompare(`${b.tipo}|${b.valor}|${b.descripcion}`));

export interface PagoCorregido {
  id: string;
  trabajador: { id: string; nombre: string; documento: string };
  dias: Prisma.Decimal;
  valorDia: Prisma.Decimal;
  valorDevengado: Prisma.Decimal;
  valorPagado: Prisma.Decimal;
}

export interface ResultadoCorreccion {
  pago: PagoCorregido;
  avisos: AvisoLiquidacion[];
}

// `medioPagoActivo` y la cuenta ya se validaron fuera cuando el medio cambia; aquí se vuelve a exigir la cuenta de la combinación final.
export async function corregirPagoEnTx(tx: Prisma.TransactionClient, pagoId: string, dto: CorregirPagoNominaDto, usuario: UsuarioAutenticado): Promise<ResultadoCorreccion> {
  const motivo = dto.motivo.trim();
  if (motivo.length < 10) throw new BadRequestException('Explica la corrección con al menos 10 caracteres');

  // El mismo bloqueo de las liquidaciones: una corrección y una liquidación de la misma obra no se cruzan.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CLAVE_BLOQUEO_NOMINA})`;

  const pago = await tx.pagoNomina.findUnique({
    where: { id: pagoId },
    include: { novedades: true, trabajador: { select: { id: true, nombre: true, documento: true } }, proyecto: { select: { id: true, nombre: true, estado: true } } },
  });
  if (!pago) throw new NotFoundException(`No existe el pago de nómina ${pagoId}`);
  if (!pago.proyecto || pago.dias === null || pago.valorDia === null) {
    throw new BadRequestException('Este pago es anterior a la liquidación por obra y no se corrige aquí');
  }
  if (pago.proyecto.estado === EstadoProyecto.FINALIZADO) {
    throw new BadRequestException(`El proyecto "${pago.proyecto.nombre}" está finalizado: no admite cambios en su nómina`);
  }

  // Un día que ya pertenece a un cierre de caja cerrado o aprobado no admite cambios: cambiaría lo que el gerente revisó.
  await exigirFechaAbiertaEnTx(tx, pago.fechaPago);
  let fechaPago = pago.fechaPago;
  if (dto.fechaPago) {
    exigirFechaReal(dto.fechaPago, 'La fecha de pago');
    fechaPago = parsearFechaLocal(dto.fechaPago);
    if (formatearFechaISO(fechaPago) < formatearFechaISO(pago.periodoInicio)) {
      throw new BadRequestException('La fecha de pago no puede ser anterior al inicio del período');
    }
    if (fechaPago.getTime() !== pago.fechaPago.getTime()) await exigirFechaAbiertaEnTx(tx, fechaPago);
  }

  // Medio y cuenta: si cambia el medio sin indicar cuenta, no se arrastra la anterior (otra cuenta podría no corresponder).
  const medioPago = dto.medioPago ?? pago.medioPago;
  let cuentaId = pago.cuentaId;
  if (dto.medioPago !== undefined || dto.cuentaId !== undefined) {
    cuentaId = await validarCuentaDestino(tx, medioPago, dto.cuentaId ?? (dto.medioPago === undefined || dto.medioPago === pago.medioPago ? pago.cuentaId : undefined), 'de donde salió el dinero');
  }

  const dias = dto.dias !== undefined ? new Prisma.Decimal(dto.dias) : pago.dias;
  const valorDia = dto.valorDia !== undefined ? new Prisma.Decimal(dto.valorDia) : pago.valorDia;
  const horasExtra = dto.horasExtra !== undefined ? new Prisma.Decimal(dto.horasExtra) : (pago.horasExtra ?? new Prisma.Decimal(0));
  const valorHoraExtra = dto.valorHoraExtra !== undefined ? new Prisma.Decimal(dto.valorHoraExtra) : (pago.valorHoraExtra ?? new Prisma.Decimal(0));
  const novedades: NovedadPreparada[] =
    dto.novedades !== undefined ? prepararNovedades(dto.novedades, 'Novedades: ') : pago.novedades.map((n) => ({ tipo: n.tipo, valor: n.valor, descripcion: n.descripcion ?? undefined }));
  const observaciones = dto.observaciones !== undefined ? dto.observaciones.trim() : (pago.observaciones ?? '');

  let calculo;
  try {
    calculo = calcularPagoPorDias({ dias, valorDia, horasExtra, valorHoraExtra, novedades });
  } catch (error) {
    if (error instanceof BadRequestException) throw new BadRequestException(`${pago.trabajador.nombre}: ${error.message}`);
    throw error;
  }

  const antes = fotoDelPago(pago);
  const despues: FotoPago = {
    dias: dias.toString(),
    valorDia: valorDia.toString(),
    horasExtra: horasExtra.toString(),
    valorHoraExtra: valorHoraExtra.toString(),
    valorDevengado: calculo.valorDevengado.toString(),
    valorPagado: calculo.valorPagado.toString(),
    observaciones,
    fechaPago: formatearFechaISO(fechaPago),
    medioPago,
    cuentaId,
    novedades: ordenarNovedades(novedades.map((n) => ({ tipo: n.tipo, valor: n.valor.toString(), descripcion: n.descripcion ?? '' }))),
  };
  if (JSON.stringify(antes) === JSON.stringify(despues)) {
    throw new BadRequestException('No hay nada que corregir: los datos son los mismos del pago');
  }

  // Los días que ya tiene en otras obras durante el mismo período, para avisar si la suma pasa de los días del período.
  const avisos: AvisoLiquidacion[] = [];
  const otros = await tx.pagoNomina.findMany({
    where: { trabajadorId: pago.trabajadorId, id: { not: pago.id }, periodoInicio: { lte: pago.periodoFin }, periodoFin: { gte: pago.periodoInicio }, dias: { not: null } },
    select: { dias: true },
  });
  const diasPeriodo = Math.round((pago.periodoFin.getTime() - pago.periodoInicio.getTime()) / MS_POR_DIA) + 1;
  const sumaDias = otros.reduce((suma, otro) => suma.plus(otro.dias ?? 0), new Prisma.Decimal(0)).plus(dias);
  if (sumaDias.greaterThan(diasPeriodo)) {
    avisos.push({
      trabajadorId: pago.trabajadorId,
      mensaje: `${pago.trabajador.nombre}: suma ${sumaDias.toString()} días en ese período, que tiene ${diasPeriodo} (del ${formatearDia(pago.periodoInicio)} al ${formatearDia(pago.periodoFin)}). Revisa los días`,
    });
  }

  await tx.pagoNomina.update({
    where: { id: pago.id },
    data: {
      // salarioBase guarda lo devengado por los días; el valor día queda como foto de este pago.
      salarioBase: calculo.valorDias,
      dias,
      valorDia,
      horasExtra,
      valorHoraExtra,
      valorHorasExtra: calculo.valorHorasExtra,
      valorDevengado: calculo.valorDevengado,
      valorPagado: calculo.valorPagado,
      observaciones: observaciones || null,
      fechaPago,
      medioPago,
      cuentaId,
      ...(dto.novedades !== undefined
        ? { novedades: { deleteMany: {}, create: novedades.map((n) => ({ tipo: n.tipo, valor: n.valor, descripcion: n.descripcion })) } }
        : {}),
    },
  });

  await registrarAuditoria(tx, {
    usuario,
    accion: 'NOMINA_CORREGIR_PAGO',
    entidad: 'NOMINA',
    entidadId: pago.id,
    resumen: `Corrigió el pago de ${pago.trabajador.nombre} en "${pago.proyecto.nombre}" (${formatearDia(pago.periodoInicio)} al ${formatearDia(pago.periodoFin)}): devengado de ${formatearCOP(antes.valorDevengado)} a ${formatearCOP(calculo.valorDevengado)}, pagado de ${formatearCOP(antes.valorPagado)} a ${formatearCOP(calculo.valorPagado)}: ${motivo}`,
    antes,
    despues: { ...despues, motivo },
  });

  return {
    pago: { id: pago.id, trabajador: pago.trabajador, dias, valorDia, valorDevengado: calculo.valorDevengado, valorPagado: calculo.valorPagado },
    avisos,
  };
}
