import type { EstadoLote, TipoProyecto } from './api'

export const ETIQUETA_ESTADO_LOTE: Record<EstadoLote, string> = {
  DISPONIBLE: 'Disponible',
  SEPARADO: 'Separado',
  VENDIDO: 'Vendido',
  ESCRITURADO: 'Escriturado',
  DESISTIDO: 'Desistido',
}

export const CLASE_ESTADO_LOTE: Record<EstadoLote, string> = {
  DISPONIBLE: 'bg-green-100 text-green-700',
  SEPARADO: 'bg-amber-100 text-amber-800',
  VENDIDO: 'bg-blue-100 text-blue-700',
  ESCRITURADO: 'bg-slate-200 text-slate-700',
  DESISTIDO: 'bg-red-100 text-red-700',
}

export const ESTADOS_LOTE = Object.keys(ETIQUETA_ESTADO_LOTE) as EstadoLote[]

export const ETIQUETA_TIPO_PROYECTO: Record<TipoProyecto, string> = {
  LOTES: 'Venta de lotes',
  REMODELACION: 'Remodelación',
  MAQUINARIA: 'Maquinaria',
}
