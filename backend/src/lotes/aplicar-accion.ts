import { ConflictException } from '@nestjs/common';
import { registrarAuditoria, type ActorAuditoria } from '../auditoria/auditoria.js';
import type { Prisma } from '../generated/prisma/client.js';
import { EstadoLote, TipoEventoLote } from '../generated/prisma/enums.js';
import { ETIQUETA_ESTADO_LOTE, estadoResultante, type AccionLote } from './estado-lote.js';

export interface OpcionesAccionLote {
  motivo?: string;
  // Venta que originó el cambio (al vender o desistir).
  ventaId?: string;
  // Datos de la escritura (solo al escriturar).
  escritura?: { numero: string; notaria?: string; fecha: Date };
  // Datos adicionales de la acción que se dejan en la auditoría (p. ej. quién separó el lote y cuánto dejó).
  detalleAuditoria?: Record<string, unknown>;
}

// Único lugar del sistema que cambia el estado de un lote. Se llama DENTRO de una transacción.
//
// El cambio se hace con una condición sobre el estado que se leyó ("solo si sigue en X"): si dos
// personas actúan sobre el mismo lote a la vez, solo una gana y la otra recibe un conflicto en vez
// de pisarse en silencio (por ejemplo, vender dos veces el mismo lote).
export async function aplicarAccionLote(
  tx: Prisma.TransactionClient,
  lote: { id: string; numero: string; estado: EstadoLote },
  accion: AccionLote,
  usuario: ActorAuditoria,
  opciones: OpcionesAccionLote = {},
): Promise<EstadoLote> {
  const estadoNuevo = estadoResultante(lote.estado, accion, lote.numero);

  const { count } = await tx.lote.updateMany({
    where: { id: lote.id, estado: lote.estado },
    data: {
      estado: estadoNuevo,
      ...(opciones.escritura
        ? {
            escrituraNumero: opciones.escritura.numero,
            escrituraNotaria: opciones.escritura.notaria ?? null,
            escrituraFecha: opciones.escritura.fecha,
          }
        : {}),
    },
  });
  if (count === 0) {
    throw new ConflictException(
      `El lote ${lote.numero} cambió de estado mientras se procesaba. Revisa su estado actual y vuelve a intentarlo`,
    );
  }

  await tx.loteHistorial.create({
    data: {
      loteId: lote.id,
      tipo: TipoEventoLote.CAMBIO_ESTADO,
      estadoAnterior: lote.estado,
      estadoNuevo,
      motivo: opciones.motivo,
      ventaId: opciones.ventaId,
      usuarioId: usuario.id,
    },
  });

  await registrarAuditoria(tx, {
    usuario,
    accion: 'LOTE_CAMBIAR_ESTADO',
    entidad: 'LOTE',
    entidadId: lote.id,
    resumen: `Cambió el lote ${lote.numero} de ${ETIQUETA_ESTADO_LOTE[lote.estado]} a ${ETIQUETA_ESTADO_LOTE[estadoNuevo]}${opciones.motivo ? `: ${opciones.motivo}` : ''}`,
    antes: { estado: lote.estado },
    despues: {
      estado: estadoNuevo,
      accion,
      motivo: opciones.motivo,
      ventaId: opciones.ventaId,
      escritura: opciones.escritura,
      ...opciones.detalleAuditoria,
    },
  });

  return estadoNuevo;
}
