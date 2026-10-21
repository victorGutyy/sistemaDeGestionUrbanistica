import type { EstadoVerificacion } from '../lib/api'
import { CLASE_VERIFICACION, ETIQUETA_VERIFICACION } from '../lib/verificacion'

// Marca de un abono según su verificación contra el extracto. El efectivo ("no requiere") no lleva marca, para no
// llenar la pantalla de etiquetas que no dicen nada.
export function EtiquetaVerificacion({ estado }: { estado: EstadoVerificacion | undefined }) {
  if (!estado || estado === 'NO_REQUIERE') return null
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${CLASE_VERIFICACION[estado]}`}>{ETIQUETA_VERIFICACION[estado]}</span>
}
