import type { EstadoCierre, MedioPago, TipoCierre } from './api'

export const ETIQUETA_TIPO_CIERRE: Record<TipoCierre, string> = { DIARIO: 'Diario', SEMANAL: 'Semanal', QUINCENAL: 'Quincenal' }

export const ETIQUETA_ESTADO_CIERRE: Record<EstadoCierre, string> = {
  BORRADOR: 'Borrador',
  CERRADO: 'Pendiente de aprobación',
  APROBADO: 'Aprobado',
  DEVUELTO: 'Devuelto',
}

export const CLASE_ESTADO_CIERRE: Record<EstadoCierre, string> = {
  BORRADOR: 'bg-slate-100 text-slate-700',
  CERRADO: 'bg-amber-100 text-amber-800',
  APROBADO: 'bg-green-100 text-green-700',
  DEVUELTO: 'bg-red-100 text-red-700',
}

export const ETIQUETA_MEDIO_PAGO: Record<MedioPago, string> = {
  EFECTIVO: 'Efectivo',
  CONSIGNACION: 'Consignación',
  TRANSFERENCIA: 'Transferencia',
  NEQUI: 'Nequi',
  DAVIPLATA: 'Daviplata',
  CHEQUE: 'Cheque',
  TARJETA: 'Tarjeta',
}

// "2026-10-12" → 12/10/2026. Los días de un cierre son días de calendario, sin hora.
export function diaDeCierre(iso: string): string {
  const [anio, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${anio}`
}
