import type {
  CicloPhva,
  EjecutorCapacitacion,
  EstadoActividadSst,
  EstadoAlertaSst,
  EstadoAvisoSst,
  EstadoReposicion,
  ModalidadCapacitacion,
  MotivoEntregaEpp,
  TipoAvisoSst,
} from './api'

// Textos de pantalla de la gestión SST (CC-03, fase B).

export type Tono = 'verde' | 'ambar' | 'rojo' | 'gris' | 'azul'

export const MOTIVOS_EPP: MotivoEntregaEpp[] = ['DOTACION_INICIAL', 'REPOSICION_VIDA_UTIL', 'REPOSICION_DANO', 'PERDIDA', 'CAMBIO_CARGO']

export const ETIQUETA_MOTIVO_EPP: Record<MotivoEntregaEpp, string> = {
  DOTACION_INICIAL: 'Dotación inicial',
  REPOSICION_VIDA_UTIL: 'Reposición por vida útil',
  REPOSICION_DANO: 'Reposición por daño o deterioro',
  PERDIDA: 'Pérdida',
  CAMBIO_CARGO: 'Cambio de cargo',
}

export const ETIQUETA_ESTADO_REPOSICION: Record<EstadoReposicion, string> = {
  VIGENTE: 'Vigente',
  POR_REPONER: 'Por reponer',
  VENCIDO: 'Vencido',
}

export const TONO_ESTADO_REPOSICION: Record<EstadoReposicion, Tono> = {
  VIGENTE: 'verde',
  POR_REPONER: 'ambar',
  VENCIDO: 'rojo',
}

export const CICLOS_PHVA: CicloPhva[] = ['PLANEAR', 'HACER', 'VERIFICAR', 'ACTUAR']

export const ETIQUETA_CICLO: Record<CicloPhva, string> = {
  PLANEAR: 'Planear',
  HACER: 'Hacer',
  VERIFICAR: 'Verificar',
  ACTUAR: 'Actuar',
}

export const ESTADOS_ACTIVIDAD: EstadoActividadSst[] = ['PROGRAMADA', 'EN_EJECUCION', 'EJECUTADA', 'REPROGRAMADA', 'CANCELADA']

export const ETIQUETA_ESTADO_ACTIVIDAD: Record<EstadoActividadSst, string> = {
  PROGRAMADA: 'Programada',
  EN_EJECUCION: 'En ejecución',
  EJECUTADA: 'Ejecutada',
  REPROGRAMADA: 'Reprogramada',
  CANCELADA: 'Cancelada',
}

export const TONO_ESTADO_ACTIVIDAD: Record<EstadoActividadSst, Tono> = {
  PROGRAMADA: 'gris',
  EN_EJECUCION: 'azul',
  EJECUTADA: 'verde',
  REPROGRAMADA: 'ambar',
  CANCELADA: 'gris',
}

export const ETIQUETA_ALERTA: Record<EstadoAlertaSst, string> = {
  AL_DIA: 'Al día',
  PROXIMA: 'Próxima',
  VENCIDA: 'Vencida',
  SIN_ALERTA: '',
}

export const TONO_ALERTA: Record<EstadoAlertaSst, Tono> = {
  AL_DIA: 'verde',
  PROXIMA: 'ambar',
  VENCIDA: 'rojo',
  SIN_ALERTA: 'gris',
}

export const MODALIDADES: ModalidadCapacitacion[] = ['PRESENCIAL', 'VIRTUAL', 'MIXTA']

export const ETIQUETA_MODALIDAD: Record<ModalidadCapacitacion, string> = {
  PRESENCIAL: 'Presencial',
  VIRTUAL: 'Virtual',
  MIXTA: 'Mixta',
}

export const EJECUTORES: EjecutorCapacitacion[] = ['INTERNO', 'ARL', 'EXTERNO', 'SENA']

export const ETIQUETA_EJECUTOR: Record<EjecutorCapacitacion, string> = {
  INTERNO: 'Interno',
  ARL: 'ARL',
  EXTERNO: 'Externo / proveedor',
  SENA: 'SENA',
}

export const ETIQUETA_TIPO_AVISO: Record<TipoAvisoSst, string> = {
  EPP: 'EPP por reponer',
  ACTIVIDAD_PLAN: 'Actividad del plan',
  CAPACITACION: 'Capacitación',
}

export const ETIQUETA_ESTADO_AVISO: Record<EstadoAvisoSst, string> = {
  ENVIADA: 'Enviado',
  FALLIDA: 'Fallido',
  OMITIDA: 'Omitido',
}

export const TONO_ESTADO_AVISO: Record<EstadoAvisoSst, Tono> = {
  ENVIADA: 'verde',
  FALLIDA: 'rojo',
  OMITIDA: 'ambar',
}

export const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// "hoy", "mañana", "en 5 días", "hace 3 días".
export function textoDias(dias: number): string {
  if (dias === 0) return 'hoy'
  if (dias === 1) return 'mañana'
  if (dias === -1) return 'ayer'
  return dias > 0 ? `en ${dias} días` : `hace ${-dias} días`
}

// Porcentaje con coma decimal ("66,7 %"); "—" si no hay dato.
export function formatearPorcentajeSst(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return '—'
  return `${valor.toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`
}

// Las horas y las notas llegan como texto decimal ("2.00", "4.50"): se muestran con coma y sin ceros sobrantes.
export function formatearDecimalSst(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  const numero = Number(valor)
  return Number.isFinite(numero) ? numero.toLocaleString('es-CO', { maximumFractionDigits: 2 }) : String(valor)
}
