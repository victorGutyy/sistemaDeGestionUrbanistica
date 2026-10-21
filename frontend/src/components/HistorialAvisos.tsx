import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { listarNotificaciones, type FiltroNotificaciones, type ListaNotificaciones } from '../lib/api'
import {
  CLASE_ESTADO_NOTIFICACION,
  ETIQUETA_CANAL,
  ETIQUETA_ESTADO_NOTIFICACION,
  ETIQUETA_TIPO_NOTIFICACION,
  formatearFechaHora,
} from '../lib/notificaciones'
import { PERMISOS } from '../lib/permisos'

interface Props {
  filtro: FiltroNotificaciones
  // A dónde lleva "Ver todo" (el historial completo con el mismo filtro).
  verTodo: string
  titulo?: string
}

const MAXIMO = 8

// Los últimos avisos de un cliente o de una venta (RF-NOT-06), para ver de un vistazo qué se le ha mandado.
export function HistorialAvisos({ filtro, verTodo, titulo = 'Avisos enviados' }: Props) {
  const { tiene } = useAuth()
  const puedeVer = tiene(PERMISOS.NOTIFICACIONES_VER)
  const [lista, setLista] = useState<ListaNotificaciones | null>(null)
  const [error, setError] = useState<string | null>(null)
  const clave = JSON.stringify(filtro)

  useEffect(() => {
    if (!puedeVer) return
    listarNotificaciones({ ...(JSON.parse(clave) as FiltroNotificaciones), limite: MAXIMO })
      .then((recibida) => {
        setLista(recibida)
        setError(null)
      })
      .catch((err: Error) => setError(err.message))
  }, [clave, puedeVer])

  if (!puedeVer) return null

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">{titulo}</h2>
        {lista && lista.total > MAXIMO && (
          <Link to={verTodo} className="text-sm font-medium text-blue-600 hover:underline">
            Ver todo ({lista.total})
          </Link>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {lista && lista.notificaciones.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-400">Todavía no se ha enviado ningún aviso.</li>}
        {lista?.notificaciones.map((aviso) => (
          <li key={aviso.id} className="px-4 py-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 break-words font-medium text-slate-900">
                {ETIQUETA_TIPO_NOTIFICACION[aviso.tipo]}
                {aviso.recibo ? ` ${aviso.recibo}` : ''}
                {aviso.cuota !== null ? ` · ${aviso.cuota === 0 ? 'Cuota inicial' : `Cuota ${aviso.cuota}`}` : ''}
              </p>
              <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${CLASE_ESTADO_NOTIFICACION[aviso.estado]}`}>
                {ETIQUETA_ESTADO_NOTIFICACION[aviso.estado]}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {ETIQUETA_CANAL[aviso.canal]}
              {aviso.destinatario ? ` · ${aviso.destinatario}` : ''} · {formatearFechaHora(aviso.fecha)} · {aviso.usuario ?? 'Sistema'}
            </p>
            {aviso.detalle && <p className="text-xs text-slate-500">{aviso.detalle}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}
