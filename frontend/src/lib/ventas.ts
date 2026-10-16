import type { EstadoVenta } from './api'

export const ETIQUETA_ESTADO_VENTA: Record<EstadoVenta, string> = {
  PENDIENTE_APROBACION: 'Pendiente de aprobación',
  ACTIVA: 'Activa',
  RECHAZADA: 'Rechazada',
  DESISTIDA: 'Desistida',
}

export const CLASE_ESTADO_VENTA: Record<EstadoVenta, string> = {
  PENDIENTE_APROBACION: 'bg-amber-100 text-amber-800',
  ACTIVA: 'bg-green-100 text-green-700',
  RECHAZADA: 'bg-red-100 text-red-700',
  DESISTIDA: 'bg-slate-200 text-slate-600',
}

// La cuota 0 es la cuota inicial de la venta.
export function etiquetaCuota(numero: number): string {
  return numero === 0 ? 'Cuota inicial' : `Cuota ${numero}`
}
