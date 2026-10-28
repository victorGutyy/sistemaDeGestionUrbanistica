import { EstadoActividadSst } from '../generated/prisma/enums.js';
import { diasEntre, sumarAnios } from './fechas.js';

// Reglas del plan de trabajo anual y del plan de capacitación (RF-SST-15 a 20). Son funciones puras: reciben datos y
// devuelven el resultado, sin tocar la base de datos. Las fechas son días calendario (hora local de Colombia).

// Una actividad o capacitación ejecutada o cancelada ya no genera alertas.
const ESTADOS_SIN_ALERTA: readonly EstadoActividadSst[] = [EstadoActividadSst.EJECUTADA, EstadoActividadSst.CANCELADA];

export type EstadoAlerta = 'AL_DIA' | 'PROXIMA' | 'VENCIDA' | 'SIN_ALERTA';

export interface ResultadoAlerta {
  alerta: EstadoAlerta;
  // Días que faltan para la fecha límite (0 = hoy; negativo = ya pasó). null si no genera alerta.
  diasRestantes: number | null;
}

// La fecha límite de una actividad es su fecha de fin; la de una capacitación, su fecha programada. Vencida: ya pasó y no
// está ejecutada ni cancelada. Próxima: faltan "diasAlerta" días o menos (el mismo día todavía es próxima).
export function alertaDeFechaLimite(fechaLimite: Date, estado: EstadoActividadSst, hoy: Date, diasAlerta: number): ResultadoAlerta {
  if (ESTADOS_SIN_ALERTA.includes(estado)) return { alerta: 'SIN_ALERTA', diasRestantes: null };
  const diasRestantes = diasEntre(hoy, fechaLimite);
  if (diasRestantes < 0) return { alerta: 'VENCIDA', diasRestantes };
  if (diasRestantes <= diasAlerta) return { alerta: 'PROXIMA', diasRestantes };
  return { alerta: 'AL_DIA', diasRestantes };
}

// Cronograma mensual (RF-SST-16): para cada mes del año, si la actividad está programada en él. Se marca todo mes por el que
// pasa el rango de fechas (el mes de inicio, el de fin y los de en medio). Lo que cae fuera del año no se marca.
export function cronogramaMensual(fechaInicio: Date, fechaFin: Date, anio: number): boolean[] {
  return Array.from({ length: 12 }, (_, mes) => {
    const primerDia = new Date(anio, mes, 1);
    const ultimoDia = new Date(anio, mes + 1, 0);
    return fechaInicio.getTime() <= ultimoDia.getTime() && fechaFin.getTime() >= primerDia.getTime();
  });
}

export interface ActividadParaResumen {
  estado: EstadoActividadSst;
  porcentajeAvance: number;
}

export interface ResumenPlan {
  total: number;
  porEstado: Record<EstadoActividadSst, number>;
  // Promedio del avance de las actividades no canceladas, redondeado a un decimal (0 si no hay ninguna).
  avancePromedio: number;
  // Ejecutadas sobre las no canceladas, en porcentaje con un decimal (0 si no hay ninguna).
  cumplimiento: number;
}

export function resumenDelPlan(actividades: readonly ActividadParaResumen[]): ResumenPlan {
  const porEstado: Record<EstadoActividadSst, number> = { PROGRAMADA: 0, EN_EJECUCION: 0, EJECUTADA: 0, REPROGRAMADA: 0, CANCELADA: 0 };
  for (const actividad of actividades) porEstado[actividad.estado] += 1;

  const vigentes = actividades.filter((a) => a.estado !== EstadoActividadSst.CANCELADA);
  const redondear = (valor: number) => Math.round(valor * 10) / 10;
  return {
    total: actividades.length,
    porEstado,
    avancePromedio: vigentes.length === 0 ? 0 : redondear(vigentes.reduce((suma, a) => suma + a.porcentajeAvance, 0) / vigentes.length),
    cumplimiento: vigentes.length === 0 ? 0 : redondear((porEstado.EJECUTADA / vigentes.length) * 100),
  };
}

export interface ActividadCopiable {
  fechaInicio: Date;
  fechaFin: Date;
  estado: EstadoActividadSst;
}

// Copia de un plan al año siguiente (RF-SST-17): las actividades canceladas no se copian; las demás pasan como borrador, con
// sus fechas movidas los años que correspondan, en estado "programada" y sin avance.
export function actividadesParaCopiar<T extends ActividadCopiable>(
  actividades: readonly T[],
  anioOrigen: number,
  anioDestino: number,
): (Omit<T, 'estado'> & { estado: EstadoActividadSst; porcentajeAvance: number })[] {
  const delta = anioDestino - anioOrigen;
  return actividades
    .filter((a) => a.estado !== EstadoActividadSst.CANCELADA)
    .map((a) => ({ ...a, fechaInicio: sumarAnios(a.fechaInicio, delta), fechaFin: sumarAnios(a.fechaFin, delta), estado: EstadoActividadSst.PROGRAMADA, porcentajeAvance: 0 }));
}

export interface CoberturaCapacitacion {
  asistentesReales: number;
  // Porcentaje con un decimal; null si no había asistentes programados (no se puede dividir).
  cobertura: number | null;
}

// Asistentes reales frente a los programados (RF-SST-19). Puede pasar de 100 % si asistió más gente de la convocada.
export function coberturaDeCapacitacion(asistentesProgramados: number, asistentesReales: number): CoberturaCapacitacion {
  if (asistentesProgramados <= 0) return { asistentesReales, cobertura: null };
  return { asistentesReales, cobertura: Math.round((asistentesReales / asistentesProgramados) * 1000) / 10 };
}
