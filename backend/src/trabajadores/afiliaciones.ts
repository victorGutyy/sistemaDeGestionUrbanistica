import { TipoContrato, TipoEntidadSS } from '../generated/prisma/enums.js';

// Reglas de las afiliaciones de un trabajador a la seguridad social (RF-PER-04). Son funciones puras: la base de datos
// y el servicio las usan, pero aquí no se lee ni se escribe nada.

// Entidades a las que debe estar afiliado un trabajador vinculado a la empresa. Quien presta servicios como
// independiente paga su propia seguridad social: no se le exige ni se le alerta.
export const TIPOS_AFILIACION_REQUERIDOS: readonly TipoEntidadSS[] = [TipoEntidadSS.EPS, TipoEntidadSS.AFP, TipoEntidadSS.CESANTIAS, TipoEntidadSS.ARL, TipoEntidadSS.CAJA];

export function exigeAfiliaciones(tipoContrato: TipoContrato): boolean {
  return tipoContrato !== TipoContrato.PRESTACION_SERVICIOS;
}

export interface AfiliacionVigente {
  id: string;
  entidadId: string;
  claseRiesgoId: string | null;
  fechaInicio: Date;
}

export interface AfiliacionNueva {
  entidadId: string;
  claseRiesgoId: string | null;
  fechaInicio: Date;
}

export type ResultadoCambio = { ok: true; cerrar: { id: string; fechaFin: Date } | null } | { ok: false; error: string };

const formatoFecha = (fecha: Date) =>
  `${String(fecha.getDate()).padStart(2, '0')}/${String(fecha.getMonth() + 1).padStart(2, '0')}/${fecha.getFullYear()}`;

// Registrar una afiliación nueva cierra la vigente del mismo tipo el día anterior (así no se traslapan). Si es la misma
// entidad y la misma clase de riesgo no hay nada que cambiar. La fecha de inicio debe ser posterior a la de la vigente.
export function resolverCambioDeAfiliacion(vigente: AfiliacionVigente | null, nueva: AfiliacionNueva): ResultadoCambio {
  if (!vigente) return { ok: true, cerrar: null };
  if (vigente.entidadId === nueva.entidadId && vigente.claseRiesgoId === nueva.claseRiesgoId) {
    return { ok: false, error: 'El trabajador ya tiene esa afiliación vigente' };
  }
  if (nueva.fechaInicio.getTime() <= vigente.fechaInicio.getTime()) {
    return { ok: false, error: `La nueva afiliación debe empezar después de la actual, que empezó el ${formatoFecha(vigente.fechaInicio)}` };
  }
  const fechaFin = new Date(nueva.fechaInicio.getFullYear(), nueva.fechaInicio.getMonth(), nueva.fechaInicio.getDate() - 1);
  return { ok: true, cerrar: { id: vigente.id, fechaFin } };
}
