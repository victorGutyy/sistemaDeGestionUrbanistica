import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { listarEquipos, type Equipo } from '../lib/api'
import { CLASE_ESTADO_EQUIPO, ETIQUETA_ESTADO_EQUIPO } from '../lib/equipos'
import { PERMISOS } from '../lib/permisos'

// Los equipos de un proyecto de maquinaria (RF-MAQ-01 y 07): reemplazan a los lotes en la pantalla del proyecto.
export function SeccionEquipos({ proyectoId, finalizado }: { proyectoId: string; finalizado: boolean }) {
  const { tiene } = useAuth()
  const [equipos, setEquipos] = useState<Equipo[] | null>(null)
  const [incluirBajas, setIncluirBajas] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    listarEquipos(proyectoId, incluirBajas)
      .then((lista) => {
        if (!vigente) return
        setEquipos(lista)
        setError(null)
      })
      .catch((err: Error) => vigente && setError(err.message))
    return () => {
      vigente = false
    }
  }, [proyectoId, incluirBajas])

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Equipos{equipos ? ` (${equipos.length})` : ''}</h2>
        {!finalizado && tiene(PERMISOS.EQUIPOS_GESTIONAR) && (
          <Link
            to={`/proyectos/${proyectoId}/equipos/nuevo`}
            className="w-full rounded-md bg-blue-600 px-3 py-3 text-center text-sm font-medium text-white hover:bg-blue-700 sm:w-auto sm:py-2"
          >
            Nuevo equipo
          </Link>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Cada ingreso y egreso de este proyecto se asigna a un equipo, o se marca como general de la flota. Los equipos no se borran: se dan de baja y conservan su historial.
      </p>

      <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={incluirBajas} onChange={(event) => setIncluirBajas(event.target.checked)} />
        Mostrar también los equipos dados de baja
      </label>

      {error && <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {equipos && (
        <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {equipos.map((equipo) => (
            <li key={equipo.id}>
              <Link to={`/equipos/${equipo.id}`} className={`flex items-start justify-between gap-3 px-4 py-3 text-sm hover:bg-slate-50 ${equipo.deBaja ? 'bg-slate-50' : ''}`}>
                <div className="min-w-0">
                  <p className={`break-words font-medium ${equipo.deBaja ? 'text-slate-500' : 'text-slate-900'}`}>{equipo.nombre}</p>
                  <p className="text-xs text-slate-500">
                    {[equipo.tipoEquipo.nombre, equipo.marca, equipo.modelo, equipo.anio].filter(Boolean).join(' · ')}
                    {equipo.placaSerie ? ` · ${equipo.placaSerie}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${CLASE_ESTADO_EQUIPO[equipo.estado]}`}>{ETIQUETA_ESTADO_EQUIPO[equipo.estado]}</span>
                  {equipo.deBaja && <span className="whitespace-nowrap rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">De baja</span>}
                </div>
              </Link>
            </li>
          ))}
          {equipos.length === 0 && <li className="px-4 py-10 text-center text-sm text-slate-400">Este proyecto todavía no tiene equipos.</li>}
        </ul>
      )}
      {!equipos && !error && <p className="mt-3 text-sm text-slate-500">Cargando equipos…</p>}
    </section>
  )
}
