import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EstadoLoteBadge } from '../components/EstadoLoteBadge'
import { useAuth } from '../contexts/AuthContext'
import {
  actualizarEstadoProyecto,
  crearManzana,
  listarLotes,
  obtenerProyecto,
  type EstadoLote,
  type Lote,
  type ProyectoConLotes,
} from '../lib/api'
import { formatearArea } from '../lib/area'
import { ESTADOS_LOTE, ETIQUETA_ESTADO_LOTE, ETIQUETA_TIPO_PROYECTO } from '../lib/estadoLote'
import { formatearCOP } from '../lib/formato'
import { PERMISOS } from '../lib/permisos'

const CLASE_INPUT =
  'rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500'

export function ProyectoDetallePage() {
  const { tiene } = useAuth()
  const { id } = useParams<{ id: string }>()
  const [proyecto, setProyecto] = useState<ProyectoConLotes | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actualizandoEstado, setActualizandoEstado] = useState(false)

  // Lotes con filtros (RF-PRY-09): se piden al servidor cada vez que cambia un filtro.
  const [lotes, setLotes] = useState<Lote[]>([])
  const [cargandoLotes, setCargandoLotes] = useState(true)
  const [filtroManzana, setFiltroManzana] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<EstadoLote | ''>('')
  const [buscar, setBuscar] = useState('')
  const [buscarAplicado, setBuscarAplicado] = useState('')

  const [nuevaManzana, setNuevaManzana] = useState('')
  const [creandoManzana, setCreandoManzana] = useState(false)

  useEffect(() => {
    if (!id) return
    obtenerProyecto(id)
      .then(setProyecto)
      .catch((err: Error) => setError(err.message))
  }, [id])

  // Espera a que se deje de escribir antes de consultar.
  useEffect(() => {
    const espera = window.setTimeout(() => setBuscarAplicado(buscar.trim()), 300)
    return () => window.clearTimeout(espera)
  }, [buscar])

  useEffect(() => {
    if (!id) return
    let vigente = true
    listarLotes({ proyectoId: id, manzanaId: filtroManzana, estado: filtroEstado || undefined, buscar: buscarAplicado })
      .then((resultado) => {
        if (vigente) setLotes(resultado)
      })
      .catch((err: Error) => {
        if (vigente) setError(err.message)
      })
      .finally(() => {
        if (vigente) setCargandoLotes(false)
      })
    return () => {
      vigente = false
    }
  }, [id, filtroManzana, filtroEstado, buscarAplicado])

  async function handleCambiarEstado() {
    if (!proyecto) return
    const finalizando = proyecto.estado === 'ACTIVO'
    const confirmado = window.confirm(
      finalizando
        ? `¿Marcar "${proyecto.nombre}" como finalizado? Ya no se le podrán agregar lotes nuevos. Puedes reactivarlo después si te equivocas.`
        : `¿Reactivar "${proyecto.nombre}"?`,
    )
    if (!confirmado) return

    setActualizandoEstado(true)
    setError(null)
    try {
      const actualizado = await actualizarEstadoProyecto(proyecto.id, finalizando ? 'FINALIZADO' : 'ACTIVO')
      setProyecto({ ...proyecto, estado: actualizado.estado })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el estado del proyecto')
    } finally {
      setActualizandoEstado(false)
    }
  }

  async function handleCrearManzana(event: FormEvent) {
    event.preventDefault()
    if (!proyecto) return
    setError(null)
    setCreandoManzana(true)
    try {
      const manzana = await crearManzana(proyecto.id, nuevaManzana)
      setProyecto({ ...proyecto, manzanas: [...proyecto.manzanas, manzana].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')) })
      setNuevaManzana('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la manzana')
    } finally {
      setCreandoManzana(false)
    }
  }

  if (error && !proyecto) {
    return <p className="text-sm text-red-600">{error}</p>
  }

  if (!proyecto) {
    return <p className="text-sm text-slate-500">Cargando proyecto...</p>
  }

  const finalizado = proyecto.estado === 'FINALIZADO'
  const esDeLotes = proyecto.tipo === 'LOTES'
  const { areaTotal, areaSubdividida, areaDisponible } = proyecto.resumenAreas
  const excedida = Number(areaDisponible) < 0
  const hayFiltros = filtroManzana !== '' || filtroEstado !== '' || buscarAplicado !== ''

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-slate-900">{proyecto.nombre}</h1>
            <span
              className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
                finalizado ? 'bg-slate-200 text-slate-600' : 'bg-green-100 text-green-700'
              }`}
            >
              {finalizado ? 'Finalizado' : 'Activo'}
            </span>
            <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {ETIQUETA_TIPO_PROYECTO[proyecto.tipo]}
            </span>
          </div>
          <p className="text-sm text-slate-500">
            {[proyecto.municipio, proyecto.ubicacion].filter(Boolean).join(' · ') || 'Sin ubicación registrada'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tiene(PERMISOS.PROYECTOS_CAMBIAR_ESTADO) && (
            <button
              type="button"
              onClick={handleCambiarEstado}
              disabled={actualizandoEstado}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {finalizado ? 'Reactivar proyecto' : 'Marcar como finalizado'}
            </button>
          )}
          {esDeLotes && !finalizado && tiene(PERMISOS.PROYECTOS_GESTIONAR) && (
            <Link
              to={`/proyectos/${proyecto.id}/lotes/nuevo`}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Nuevo lote
            </Link>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {!esDeLotes && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
          Este proyecto es de tipo <strong>{ETIQUETA_TIPO_PROYECTO[proyecto.tipo].toLowerCase()}</strong>: no tiene manzanas ni lotes. Sus
          ingresos y egresos se llevarán por separado en las finanzas del proyecto.
        </div>
      )}

      {esDeLotes && (
        <>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Área total</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{formatearArea(areaTotal)} m²</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Ya subdividida ({proyecto.lotes.length} lote(s))</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{formatearArea(areaSubdividida)} m²</p>
            </div>
            <div className={`rounded-lg border p-4 ${excedida ? 'border-red-200 bg-red-50' : 'border-blue-200 bg-blue-50'}`}>
              <p className={`text-xs ${excedida ? 'text-red-700' : 'text-blue-700'}`}>{excedida ? 'Área excedida' : 'Área disponible'}</p>
              <p className={`mt-1 text-lg font-semibold ${excedida ? 'text-red-900' : 'text-blue-900'}`}>{formatearArea(areaDisponible)} m²</p>
            </div>
          </div>

          <section className="mt-8">
            <h2 className="text-sm font-semibold text-slate-900">Manzanas</h2>
            <p className="text-xs text-slate-500">Opcionales: un proyecto sin manzanas funciona igual.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {proyecto.manzanas.length === 0 && <span className="text-sm text-slate-400">Sin manzanas.</span>}
              {proyecto.manzanas.map((manzana) => (
                <span key={manzana.id} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                  {manzana.nombre}
                </span>
              ))}
            </div>
            {!finalizado && tiene(PERMISOS.PROYECTOS_GESTIONAR) && (
              <form onSubmit={handleCrearManzana} className="mt-3 flex max-w-sm gap-2">
                <input
                  aria-label="Nombre de la nueva manzana"
                  required
                  maxLength={60}
                  value={nuevaManzana}
                  onChange={(event) => setNuevaManzana(event.target.value)}
                  placeholder="Nueva manzana (ej. A)"
                  className={`${CLASE_INPUT} w-full`}
                />
                <button
                  type="submit"
                  disabled={creandoManzana}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Agregar
                </button>
              </form>
            )}
          </section>

          <section className="mt-8">
            <h2 className="text-sm font-semibold text-slate-900">Lotes</h2>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                aria-label="Buscar lote por número o linderos"
                value={buscar}
                onChange={(event) => setBuscar(event.target.value)}
                placeholder="Buscar lote…"
                className={CLASE_INPUT}
              />
              <select
                aria-label="Filtrar por manzana"
                value={filtroManzana}
                onChange={(event) => setFiltroManzana(event.target.value)}
                className={CLASE_INPUT}
              >
                <option value="">Todas las manzanas</option>
                {proyecto.manzanas.map((manzana) => (
                  <option key={manzana.id} value={manzana.id}>
                    Manzana {manzana.nombre}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filtrar por estado"
                value={filtroEstado}
                onChange={(event) => setFiltroEstado(event.target.value as EstadoLote | '')}
                className={CLASE_INPUT}
              >
                <option value="">Todos los estados</option>
                {ESTADOS_LOTE.map((estado) => (
                  <option key={estado} value={estado}>
                    {ETIQUETA_ESTADO_LOTE[estado]}
                  </option>
                ))}
              </select>
            </div>

            <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
              {!cargandoLotes && lotes.length === 0 && (
                <li className="px-4 py-10 text-center text-sm text-slate-400">
                  {hayFiltros ? 'Ningún lote coincide con los filtros.' : 'Este proyecto todavía no tiene lotes.'}
                </li>
              )}
              {lotes.map((lote) => (
                <li key={lote.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
                  <div className="min-w-0">
                    <Link to={`/lotes/${lote.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                      {lote.manzana ? `Mz. ${lote.manzana.nombre} · ` : ''}Lote {lote.numero}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {formatearArea(lote.area)} m² · {formatearCOP(lote.valorVenta)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <EstadoLoteBadge estado={lote.estado} />
                    {(lote.estado === 'DISPONIBLE' || lote.estado === 'SEPARADO') && tiene(PERMISOS.VENTAS_CREAR) && (
                      <Link to={`/ventas/nueva?loteId=${lote.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                        Vender
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
