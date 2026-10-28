import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listarEntregasEpp, obtenerReposiciones, type EntregaEpp, type RespuestaReposiciones } from '../../lib/api'
import { formatearFecha } from '../../lib/formato'
import { ETIQUETA_ESTADO_REPOSICION, ETIQUETA_MOTIVO_EPP, textoDias, TONO_ESTADO_REPOSICION } from '../../lib/sst'
import { Insignia, Seccion } from '../formulario'

// Elementos de protección personal de un trabajador (RF-SST-13 y 14): qué elementos tiene, cuándo toca reponer cada uno y sus
// entregas más recientes. Las entregas se registran en la pestaña EPP.
export function SeccionEppTrabajador({ trabajadorId, puedeGestionar }: { trabajadorId: string; puedeGestionar: boolean }) {
  const [reposiciones, setReposiciones] = useState<RespuestaReposiciones | null>(null)
  const [entregas, setEntregas] = useState<EntregaEpp[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([obtenerReposiciones({ estado: 'TODOS', trabajadorId }), listarEntregasEpp({ trabajadorId })])
      .then(([r, e]) => {
        setReposiciones(r)
        setEntregas(e)
      })
      .catch((err: Error) => setError(err.message))
  }, [trabajadorId])

  return (
    <Seccion
      titulo="Elementos de protección personal"
      descripcion="La última entrega de cada elemento y cuándo toca reponerlo."
      acciones={
        puedeGestionar && (
          <Link to="/sst/epp" className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Registrar entrega
          </Link>
        )
      }
    >
      {error && <p className="text-sm text-red-600">{error}</p>}
      {reposiciones && reposiciones.reposiciones.length === 0 && !error && <p className="text-sm text-slate-400">Todavía no se le han entregado elementos.</p>}
      {reposiciones && reposiciones.reposiciones.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {reposiciones.reposiciones.map((r) => (
            <li key={r.entregaId} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">{r.elemento.nombre}</p>
                <p className="text-xs text-slate-500">
                  Entregado el {formatearFecha(r.ultimaEntrega)} · reposición {formatearFecha(r.proximaReposicion)} ({textoDias(r.diasRestantes)})
                </p>
              </div>
              <Insignia tono={TONO_ESTADO_REPOSICION[r.estado]}>{ETIQUETA_ESTADO_REPOSICION[r.estado]}</Insignia>
            </li>
          ))}
        </ul>
      )}
      {entregas.length > 0 && (
        <details className="mt-3 border-t border-slate-100 pt-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">Historial de entregas ({entregas.length})</summary>
          <ul className="mt-2 space-y-1.5">
            {entregas.map((e) => (
              <li key={e.id} className="text-sm text-slate-600">
                {formatearFecha(e.fecha)} · {e.cantidad} × {e.elemento.nombre}
                <span className="text-slate-400"> · {ETIQUETA_MOTIVO_EPP[e.motivo]}</span>
                {e.firmoRecibido ? '' : <span className="text-amber-700"> · sin firma</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Seccion>
  )
}
