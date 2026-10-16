import { ConflictException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { EstadoCierre } from '../generated/prisma/enums.js';
import { diaLocal, formatearDiaDDMMAAAA } from './periodo.js';

// Llave del bloqueo que ordena a quien registra dinero con quien cierra la caja. Es un número cualquiera, pero
// el mismo en todo el sistema.
export const CLAVE_BLOQUEO_CIERRES = 7_002_001;

const ESTADOS_QUE_BLOQUEAN: EstadoCierre[] = [EstadoCierre.CERRADO, EstadoCierre.APROBADO];

// Un día que ya pertenece a un cierre de caja cerrado o aprobado no admite abonos, ingresos, egresos ni pagos de
// nómina nuevos: cambiaría lo que el gerente revisa o aprobó. Para corregir algo se anula y se registra de nuevo
// con la fecha de hoy (la anulación aparece en el cierre siguiente, RF-CAJ-05).
//
// Un cierre en borrador o devuelto NO bloquea: todavía se está armando o corrigiendo.
//
// Se llama dentro de la transacción que registra el dinero. Toma un bloqueo COMPARTIDO: varios registros pueden
// avanzar a la vez, pero ninguno en medio de un cierre (que toma el bloqueo exclusivo), así ningún movimiento se
// cuela entre el cálculo del cierre y su congelamiento.
export async function exigirFechaAbiertaEnTx(tx: Prisma.TransactionClient, fecha: Date): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(${CLAVE_BLOQUEO_CIERRES})`;

  const dia = diaLocal(fecha);
  const diaColumna = new Date(`${dia}T00:00:00.000Z`);
  const cierre = await tx.cierreCaja.findFirst({
    where: { estado: { in: ESTADOS_QUE_BLOQUEAN }, desde: { lte: diaColumna }, hasta: { gte: diaColumna } },
    select: { numeroTexto: true, desde: true, hasta: true },
  });
  if (cierre) {
    const desde = formatearDiaDDMMAAAA(cierre.desde.toISOString().slice(0, 10));
    const hasta = formatearDiaDDMMAAAA(cierre.hasta.toISOString().slice(0, 10));
    throw new ConflictException({
      message: `El ${formatearDiaDDMMAAAA(dia)} pertenece al cierre de caja ${cierre.numeroTexto} (del ${desde} al ${hasta}), que ya está cerrado. Para corregir algo, anúlalo y regístralo con la fecha de hoy.`,
      codigo: 'FECHA_EN_CIERRE_CERRADO',
    });
  }
}

// El cierre toma el bloqueo exclusivo: espera a que terminen los registros en curso y detiene los nuevos hasta
// que él termine.
export async function bloquearRegistrosParaCierreEnTx(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CLAVE_BLOQUEO_CIERRES})`;
}
