import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { registrarAuditoria } from '../auditoria/auditoria.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { exigirFechaAbiertaEnTx } from '../cierres-caja/fecha-abierta.js';
import { formatearCOP } from '../common/formato.util.js';
import { parsearFechaLocal } from '../common/fecha.util.js';
import { EstadoProyecto, EstadoTrabajador, TipoNovedad, type MedioPago } from '../generated/prisma/enums.js';
import { Prisma } from '../generated/prisma/client.js';
import { calcularPagoPorDias, type NovedadParaCalculo } from './calculo-pago.js';
import type { LiquidarQuincenaDto } from './dto/liquidar-quincena.dto.js';

// CC-05 (RF-PER-21 a RF-PER-23): liquidación de una obra durante una quincena. Cada trabajador recibe UN pago por obra
// (con sus días, horas extra y novedades); si trabajó en dos obras, tiene un pago en cada una.

// Llave del bloqueo que serializa las liquidaciones: dos personas liquidando la misma obra y quincena a la vez no pueden
// crear el mismo pago dos veces. Es un número cualquiera, pero distinto al de los demás bloqueos del sistema.
export const CLAVE_BLOQUEO_NOMINA = 7_002_004;

// Una quincena no pasa de 16 días; se deja holgura para períodos irregulares, pero nunca más de un mes.
export const MAXIMO_DIAS_DEL_PERIODO = 31;

export interface NovedadPreparada extends NovedadParaCalculo {
  descripcion?: string;
}

export interface PagoPreparado {
  trabajadorId: string;
  dias: Prisma.Decimal;
  valorDia?: Prisma.Decimal;
  horasExtra?: Prisma.Decimal;
  valorHoraExtra?: Prisma.Decimal;
  novedades: NovedadPreparada[];
  observaciones?: string;
}

export interface LiquidacionPreparada {
  proyectoId: string;
  inicio: Date;
  fin: Date;
  fechaPago: Date;
  /** Días calendario del período, contando el primero y el último. */
  diasPeriodo: number;
  medioPago: MedioPago;
  cuentaId: string | null;
  pagos: PagoPreparado[];
}

export interface AvisoLiquidacion {
  trabajadorId: string;
  mensaje: string;
}

export interface PagoLiquidado {
  id: string;
  trabajador: { id: string; nombre: string; documento: string };
  dias: Prisma.Decimal;
  valorDia: Prisma.Decimal;
  horasExtra: Prisma.Decimal;
  valorHorasExtra: Prisma.Decimal;
  valorDevengado: Prisma.Decimal;
  valorPagado: Prisma.Decimal;
}

export interface ResultadoLiquidacion {
  pagos: PagoLiquidado[];
  totales: { trabajadores: number; devengado: Prisma.Decimal; pagado: Prisma.Decimal };
  avisos: AvisoLiquidacion[];
}

// "2026-02-30" no es una fecha real, pero `new Date(2026, 1, 30)` la convertiría en marzo sin avisar.
function exigirFechaReal(iso: string, campo: string): number {
  const [anio, mes, dia] = iso.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) {
    throw new BadRequestException(`${campo} no es una fecha real (${iso})`);
  }
  return fecha.getTime();
}

const MS_POR_DIA = 86_400_000;

// Valida la forma de la liquidación (fechas, trabajadores repetidos, novedades) sin tocar la base de datos.
export function prepararLiquidacion(dto: LiquidarQuincenaDto, cuentaId: string | null): LiquidacionPreparada {
  const inicioMs = exigirFechaReal(dto.periodoInicio, 'El inicio del período');
  const finMs = exigirFechaReal(dto.periodoFin, 'El fin del período');
  exigirFechaReal(dto.fechaPago, 'La fecha de pago');
  if (finMs < inicioMs) throw new BadRequestException('El fin del período no puede ser anterior a su inicio');
  const diasPeriodo = Math.round((finMs - inicioMs) / MS_POR_DIA) + 1;
  if (diasPeriodo > MAXIMO_DIAS_DEL_PERIODO) {
    throw new BadRequestException(`El período no puede pasar de ${MAXIMO_DIAS_DEL_PERIODO} días (este tiene ${diasPeriodo})`);
  }
  if (dto.fechaPago < dto.periodoInicio) throw new BadRequestException('La fecha de pago no puede ser anterior al inicio del período');

  const vistos = new Set<string>();
  const pagos = dto.pagos.map((pago, indice): PagoPreparado => {
    if (vistos.has(pago.trabajadorId)) {
      throw new BadRequestException(`El trabajador de la fila ${indice + 1} está repetido: en una liquidación va una sola vez`);
    }
    vistos.add(pago.trabajadorId);

    const novedades = (pago.novedades ?? []).map((novedad): NovedadPreparada => {
      if (novedad.tipo === TipoNovedad.HORAS_EXTRA) {
        throw new BadRequestException(`Fila ${indice + 1}: las horas extra se escriben en horas y valor de la hora, no como novedad`);
      }
      const valor = new Prisma.Decimal(novedad.valor);
      if (valor.lessThanOrEqualTo(0) || !valor.isInteger()) {
        throw new BadRequestException(`Fila ${indice + 1}: el valor de cada novedad debe ser un número de pesos enteros mayor a cero`);
      }
      return { tipo: novedad.tipo, valor, descripcion: novedad.descripcion?.trim() || undefined };
    });

    return {
      trabajadorId: pago.trabajadorId,
      dias: new Prisma.Decimal(pago.dias),
      valorDia: pago.valorDia ? new Prisma.Decimal(pago.valorDia) : undefined,
      horasExtra: pago.horasExtra ? new Prisma.Decimal(pago.horasExtra) : undefined,
      valorHoraExtra: pago.valorHoraExtra ? new Prisma.Decimal(pago.valorHoraExtra) : undefined,
      novedades,
      observaciones: pago.observaciones?.trim() || undefined,
    };
  });

  return {
    proyectoId: dto.proyectoId,
    inicio: parsearFechaLocal(dto.periodoInicio),
    fin: parsearFechaLocal(dto.periodoFin),
    fechaPago: parsearFechaLocal(dto.fechaPago),
    diasPeriodo,
    medioPago: dto.medioPago,
    cuentaId,
    pagos,
  };
}

const formatearDia = (fecha: Date) => `${String(fecha.getDate()).padStart(2, '0')}/${String(fecha.getMonth() + 1).padStart(2, '0')}/${fecha.getFullYear()}`;

// Crea los pagos de una obra y quincena dentro de la transacción de quien llama: o se guardan todos o ninguno.
export async function liquidarQuincenaEnTx(tx: Prisma.TransactionClient, liquidacion: LiquidacionPreparada, usuario: UsuarioAutenticado): Promise<ResultadoLiquidacion> {
  // Primero el bloqueo, para que la revisión de "ya existe" y la creación no se crucen con otra liquidación.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CLAVE_BLOQUEO_NOMINA})`;
  // Un día que ya pertenece a un cierre de caja cerrado o aprobado no admite pagos nuevos.
  await exigirFechaAbiertaEnTx(tx, liquidacion.fechaPago);

  const proyecto = await tx.proyecto.findUnique({ where: { id: liquidacion.proyectoId }, select: { id: true, nombre: true, estado: true } });
  if (!proyecto) throw new NotFoundException(`No existe el proyecto ${liquidacion.proyectoId}`);
  if (proyecto.estado === EstadoProyecto.FINALIZADO) {
    throw new BadRequestException(`El proyecto "${proyecto.nombre}" está finalizado: no admite pagos de nómina nuevos`);
  }

  const ids = liquidacion.pagos.map((pago) => pago.trabajadorId);
  const trabajadores = await tx.trabajador.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true, documento: true, valorDia: true, estado: true } });
  const porId = new Map(trabajadores.map((trabajador) => [trabajador.id, trabajador]));
  const faltantes = ids.filter((id) => !porId.has(id));
  if (faltantes.length > 0) throw new NotFoundException(`No existe el trabajador ${faltantes[0]}`);
  const retirados = trabajadores.filter((trabajador) => trabajador.estado !== EstadoTrabajador.ACTIVO);
  if (retirados.length > 0) {
    throw new BadRequestException(`No se puede pagar a trabajadores retirados: ${retirados.map((trabajador) => trabajador.nombre).join(', ')}`);
  }

  // RF-PER-23: un trabajador no tiene dos pagos en la misma obra y período.
  const repetidos = await tx.pagoNomina.findMany({
    where: { proyectoId: proyecto.id, periodoInicio: liquidacion.inicio, periodoFin: liquidacion.fin, trabajadorId: { in: ids } },
    select: { trabajadorId: true },
  });
  if (repetidos.length > 0) {
    const nombres = repetidos.map((pago) => porId.get(pago.trabajadorId)?.nombre ?? pago.trabajadorId).join(', ');
    throw new ConflictException({
      message: `Ya existe un pago en "${proyecto.nombre}" para ese período de: ${nombres}`,
      codigo: 'PAGO_NOMINA_REPETIDO',
    });
  }

  // RF-PER-23: los días que ya tiene en otras obras durante el mismo período, para avisar si la suma pasa de los días del período.
  const otros = await tx.pagoNomina.findMany({
    where: { trabajadorId: { in: ids }, periodoInicio: { lte: liquidacion.fin }, periodoFin: { gte: liquidacion.inicio }, dias: { not: null } },
    select: { trabajadorId: true, dias: true },
  });
  const diasEnOtrasObras = new Map<string, Prisma.Decimal>();
  for (const otro of otros) {
    diasEnOtrasObras.set(otro.trabajadorId, (diasEnOtrasObras.get(otro.trabajadorId) ?? new Prisma.Decimal(0)).plus(otro.dias ?? 0));
  }

  const avisos: AvisoLiquidacion[] = [];
  const pagos: PagoLiquidado[] = [];
  let devengado = new Prisma.Decimal(0);
  let pagado = new Prisma.Decimal(0);

  for (const pago of liquidacion.pagos) {
    const trabajador = porId.get(pago.trabajadorId)!;
    const valorDia = pago.valorDia ?? trabajador.valorDia;
    if (!valorDia) {
      throw new BadRequestException(`${trabajador.nombre} no tiene valor día: escríbelo en la liquidación o en su ficha`);
    }
    if (pago.valorDia && trabajador.valorDia && !pago.valorDia.equals(trabajador.valorDia)) {
      avisos.push({
        trabajadorId: trabajador.id,
        mensaje: `${trabajador.nombre}: se liquidó con ${formatearCOP(pago.valorDia)} por día y en su ficha tiene ${formatearCOP(trabajador.valorDia)}. Si cambió, actualízalo en la ficha`,
      });
    }

    let calculo;
    try {
      calculo = calcularPagoPorDias({ dias: pago.dias, valorDia, horasExtra: pago.horasExtra, valorHoraExtra: pago.valorHoraExtra, novedades: pago.novedades });
    } catch (error) {
      if (error instanceof BadRequestException) throw new BadRequestException(`${trabajador.nombre}: ${error.message}`);
      throw error;
    }

    const sumaDias = (diasEnOtrasObras.get(trabajador.id) ?? new Prisma.Decimal(0)).plus(pago.dias);
    if (sumaDias.greaterThan(liquidacion.diasPeriodo)) {
      avisos.push({
        trabajadorId: trabajador.id,
        mensaje: `${trabajador.nombre}: suma ${sumaDias.toString()} días en ese período, que tiene ${liquidacion.diasPeriodo} (del ${formatearDia(liquidacion.inicio)} al ${formatearDia(liquidacion.fin)}). Revisa los días`,
      });
    }

    const horasExtra = pago.horasExtra ?? new Prisma.Decimal(0);
    const valorHoraExtra = pago.valorHoraExtra ?? new Prisma.Decimal(0);
    const creado = await tx.pagoNomina.create({
      data: {
        trabajadorId: trabajador.id,
        proyectoId: proyecto.id,
        periodoInicio: liquidacion.inicio,
        periodoFin: liquidacion.fin,
        fechaPago: liquidacion.fechaPago,
        // salarioBase guarda lo devengado por los días; el valor día queda como foto de este pago.
        salarioBase: calculo.valorDias,
        dias: pago.dias,
        valorDia,
        horasExtra,
        valorHoraExtra,
        valorHorasExtra: calculo.valorHorasExtra,
        valorDevengado: calculo.valorDevengado,
        valorPagado: calculo.valorPagado,
        observaciones: pago.observaciones ?? null,
        medioPago: liquidacion.medioPago,
        cuentaId: liquidacion.cuentaId,
        novedades: { create: pago.novedades.map((novedad) => ({ tipo: novedad.tipo, valor: novedad.valor, descripcion: novedad.descripcion })) },
      },
      select: { id: true },
    });

    await registrarAuditoria(tx, {
      usuario,
      accion: 'NOMINA_REGISTRAR_PAGO',
      entidad: 'NOMINA',
      entidadId: creado.id,
      resumen: `Liquidó a ${trabajador.nombre} en "${proyecto.nombre}" (${formatearDia(liquidacion.inicio)} al ${formatearDia(liquidacion.fin)}): devengado ${formatearCOP(calculo.valorDevengado)}, pagado ${formatearCOP(calculo.valorPagado)}`,
      despues: {
        trabajadorId: trabajador.id,
        proyectoId: proyecto.id,
        periodoInicio: liquidacion.inicio,
        periodoFin: liquidacion.fin,
        fechaPago: liquidacion.fechaPago,
        dias: pago.dias,
        valorDia,
        horasExtra,
        valorHoraExtra,
        valorDevengado: calculo.valorDevengado,
        valorPagado: calculo.valorPagado,
        medioPago: liquidacion.medioPago,
        cuentaId: liquidacion.cuentaId,
        novedades: pago.novedades.map((novedad) => ({ tipo: novedad.tipo, valor: novedad.valor, descripcion: novedad.descripcion })),
      },
    });

    devengado = devengado.plus(calculo.valorDevengado);
    pagado = pagado.plus(calculo.valorPagado);
    pagos.push({
      id: creado.id,
      trabajador: { id: trabajador.id, nombre: trabajador.nombre, documento: trabajador.documento },
      dias: pago.dias,
      valorDia,
      horasExtra,
      valorHorasExtra: calculo.valorHorasExtra,
      valorDevengado: calculo.valorDevengado,
      valorPagado: calculo.valorPagado,
    });
  }

  return { pagos, totales: { trabajadores: pagos.length, devengado, pagado }, avisos };
}
