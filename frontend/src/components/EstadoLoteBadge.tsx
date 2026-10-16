import type { EstadoLote } from '../lib/api'
import { CLASE_ESTADO_LOTE, ETIQUETA_ESTADO_LOTE } from '../lib/estadoLote'

export function EstadoLoteBadge({ estado }: { estado: EstadoLote }) {
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${CLASE_ESTADO_LOTE[estado]}`}>
      {ETIQUETA_ESTADO_LOTE[estado]}
    </span>
  )
}
