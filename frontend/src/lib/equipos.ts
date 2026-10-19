import type { EstadoEquipo } from './api'

// Textos y colores de pantalla del estado de un equipo de maquinaria.
export const ESTADOS_EQUIPO: EstadoEquipo[] = ['ACTIVO', 'EN_MANTENIMIENTO', 'FUERA_DE_SERVICIO']

export const ETIQUETA_ESTADO_EQUIPO: Record<EstadoEquipo, string> = {
  ACTIVO: 'Activo',
  EN_MANTENIMIENTO: 'En mantenimiento',
  FUERA_DE_SERVICIO: 'Fuera de servicio',
}

export const CLASE_ESTADO_EQUIPO: Record<EstadoEquipo, string> = {
  ACTIVO: 'bg-green-100 text-green-700',
  EN_MANTENIMIENTO: 'bg-amber-100 text-amber-800',
  FUERA_DE_SERVICIO: 'bg-red-100 text-red-700',
}
