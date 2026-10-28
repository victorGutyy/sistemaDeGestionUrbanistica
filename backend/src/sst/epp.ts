// Reglas de reposición de los elementos de protección personal (RF-SST-14). Son funciones puras: reciben fechas y
// entregas y devuelven el resultado, sin tocar la base de datos. Las fechas son días calendario (hora local de Colombia).

export type EstadoReposicion = 'VIGENTE' | 'POR_REPONER' | 'VENCIDO';

export const ESTADOS_REPOSICION: readonly EstadoReposicion[] = ['VIGENTE', 'POR_REPONER', 'VENCIDO'];

const MS_POR_DIA = 24 * 60 * 60 * 1000;

export function inicioDelDia(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
}

export function sumarDias(fecha: Date, dias: number): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + dias);
}

// Días calendario entre dos fechas (negativo si "hasta" es anterior a "desde"). Se calcula sobre el día, sin horas, para
// que un cambio de hora del servidor no mueva el resultado.
export function diasEntre(desde: Date, hasta: Date): number {
  const a = Date.UTC(desde.getFullYear(), desde.getMonth(), desde.getDate());
  const b = Date.UTC(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
  return Math.round((b - a) / MS_POR_DIA);
}

// La reposición cae "vida útil" días después de la entrega.
export function calcularProximaReposicion(fechaEntrega: Date, vidaUtilDias: number): Date {
  return sumarDias(fechaEntrega, vidaUtilDias);
}

export interface ResultadoReposicion {
  estado: EstadoReposicion;
  // Días que faltan para la reposición (0 = hoy; negativo = ya pasó).
  diasRestantes: number;
}

// Vencido: la fecha de reposición ya pasó. Por reponer: faltan "diasAlerta" días o menos (el día de la reposición todavía
// cuenta como por reponer). Vigente: falta más que eso.
export function estadoDeReposicion(proximaReposicion: Date, hoy: Date, diasAlerta: number): ResultadoReposicion {
  const diasRestantes = diasEntre(hoy, proximaReposicion);
  if (diasRestantes < 0) return { estado: 'VENCIDO', diasRestantes };
  if (diasRestantes <= diasAlerta) return { estado: 'POR_REPONER', diasRestantes };
  return { estado: 'VIGENTE', diasRestantes };
}

export interface EntregaParaReposicion {
  trabajadorId: string;
  elementoId: string;
  fecha: Date;
  proximaReposicion: Date;
  anulada: boolean;
  createdAt: Date;
}

// De todas las entregas, la última (no anulada) de cada trabajador y elemento: es la que dice cuándo toca reponer. Si dos
// son del mismo día, gana la registrada después.
export function ultimasEntregas<T extends EntregaParaReposicion>(entregas: readonly T[]): T[] {
  const ultimas = new Map<string, T>();
  for (const entrega of entregas) {
    if (entrega.anulada) continue;
    const clave = `${entrega.trabajadorId}|${entrega.elementoId}`;
    const actual = ultimas.get(clave);
    const esPosterior =
      !actual || entrega.fecha.getTime() > actual.fecha.getTime() || (entrega.fecha.getTime() === actual.fecha.getTime() && entrega.createdAt.getTime() > actual.createdAt.getTime());
    if (esPosterior) ultimas.set(clave, entrega);
  }
  return [...ultimas.values()];
}

// La última entrega de cada trabajador y elemento con su estado de reposición, de la más urgente a la menos urgente.
export function estadosDeReposicion<T extends EntregaParaReposicion>(entregas: readonly T[], hoy: Date, diasAlerta: number): (T & ResultadoReposicion)[] {
  return ultimasEntregas(entregas)
    .map((entrega) => ({ ...entrega, ...estadoDeReposicion(entrega.proximaReposicion, hoy, diasAlerta) }))
    .sort((a, b) => a.diasRestantes - b.diasRestantes);
}
