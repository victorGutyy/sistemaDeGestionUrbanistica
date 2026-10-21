import type { EstadoVerificacion } from './api'

// Verificación de abonos contra el extracto del banco (RF-REC-10).
export const ETIQUETA_VERIFICACION: Record<EstadoVerificacion, string> = {
  NO_REQUIERE: 'No requiere verificación',
  POR_VERIFICAR: 'Por verificar',
  VERIFICADO: 'Verificado',
}

export const CLASE_VERIFICACION: Record<EstadoVerificacion, string> = {
  NO_REQUIERE: 'bg-slate-100 text-slate-600',
  POR_VERIFICAR: 'bg-amber-100 text-amber-800',
  VERIFICADO: 'bg-green-100 text-green-700',
}

// "Hoy", "1 día" o "5 días": cuánto lleva esperando un abono sin verificar.
export function textoDeEspera(dias: number): string {
  if (dias <= 0) return 'Hoy'
  return `${dias} día${dias === 1 ? '' : 's'}`
}
