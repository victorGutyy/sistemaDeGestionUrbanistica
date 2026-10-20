import type { Comision, EstadoComision, TipoVendedor } from './api'

export const ETIQUETA_ESTADO_COMISION: Record<EstadoComision, string> = {
  PENDIENTE: 'Pendiente',
  PAGADA: 'Pagada',
  ANULADA: 'Anulada',
}

export const CLASE_ESTADO_COMISION: Record<EstadoComision, string> = {
  PENDIENTE: 'bg-amber-100 text-amber-800',
  PAGADA: 'bg-green-100 text-green-700',
  ANULADA: 'bg-slate-200 text-slate-600',
}

export const ETIQUETA_TIPO_VENDEDOR: Record<TipoVendedor, string> = {
  ASESOR_INMOBILIARIO: 'Asesor inmobiliario',
  REFERIDO: 'Referido',
}

// "A-3" si el lote está en una manzana; solo el número si no.
export function nombreDelLote(lote: Comision['venta']['lote']): string {
  return lote.manzana ? `${lote.manzana.nombre}-${lote.numero}` : lote.numero
}
