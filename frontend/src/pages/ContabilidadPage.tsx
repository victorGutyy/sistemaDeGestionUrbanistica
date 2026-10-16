import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { PERMISOS } from '../lib/permisos'
import {
  listarMovimientos,
  listarProyectos,
  obtenerConsolidadoCaja,
  type ConsolidadoCaja,
  type EstadoMovimiento,
  type Movimiento,
  type Proyecto,
  type TipoMovimiento,
} from '../lib/api'
import { formatearCOP, formatearFecha } from '../lib/formato'

const CLASE_INPUT =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500'

// "Finanzas" (antes "Contabilidad": la contabilidad general la lleva el contador externo): egresos e ingresos
// de la empresa y de cada proyecto, y el consolidado de caja. El archivo conserva su nombre original.
export function ContabilidadPage() {
  const { tiene } = useAuth()
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [proyectoId, setProyectoId] = useState('')
  const [tipo, setTipo] = useState<TipoMovimiento | ''>('')
  const [estado, setEstado] = useState<EstadoMovimiento | ''>('')
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [consolidado, setConsolidado] = useState<ConsolidadoCaja | null>(null)
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    listarProyectos()
      .then(setProyectos)
      .catch((err: Error) => setError(err.message))
  }, [])

  useEffect(() => {
    const periodo = { desde: desde || undefined, hasta: hasta || undefined }
    Promise.all([
      obtenerConsolidadoCaja(periodo),
      listarMovimientos({ ...periodo, proyectoId: proyectoId || undefined, tipo: tipo || undefined, estado: estado || undefined }),
    ])
      .then(([consolidadoRecibido, movimientosRecibidos]) => {
        setConsolidado(consolidadoRecibido)
        setMovimientos(movimientosRecibidos)
        setError(null)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setCargando(false))
  }, [desde, hasta, proyectoId, tipo, estado])

  const hayFiltros = Boolean(desde || hasta || proyectoId || tipo || estado)

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Finanzas</h1>
          <p className="text-sm text-slate-500">Egresos e ingresos de la empresa y de cada proyecto, y consolidado de caja.</p>
        </div>
        {tiene(PERMISOS.FINANZAS_REGISTRAR) && (
          <Link to="/finanzas/nuevo" className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Registrar egreso o ingreso
          </Link>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div>
          <label htmlFor="desde" className="block text-xs font-medium text-slate-700">
            Desde
          </label>
          <input id="desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={CLASE_INPUT} />
        </div>
        <div>
          <label htmlFor="hasta" className="block text-xs font-medium text-slate-700">
            Hasta
          </label>
          <input id="hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={CLASE_INPUT} />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="proyecto" className="block text-xs font-medium text-slate-700">
            Proyecto
          </label>
          <select id="proyecto" value={proyectoId} onChange={(e) => setProyectoId(e.target.value)} className={CLASE_INPUT}>
            <option value="">Todos</option>
            {proyectos.map((proyecto) => (
              <option key={proyecto.id} value={proyecto.id}>
                {proyecto.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="tipo" className="block text-xs font-medium text-slate-700">
            Tipo
          </label>
          <select id="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoMovimiento | '')} className={CLASE_INPUT}>
            <option value="">Todos</option>
            <option value="GASTO">Egresos</option>
            <option value="INGRESO">Ingresos</option>
          </select>
        </div>
        <div>
          <label htmlFor="estado" className="block text-xs font-medium text-slate-700">
            Estado
          </label>
          <select id="estado" value={estado} onChange={(e) => setEstado(e.target.value as EstadoMovimiento | '')} className={CLASE_INPUT}>
            <option value="">Todos</option>
            <option value="ACTIVO">Vigentes</option>
            <option value="ANULADO">Anulados</option>
          </select>
        </div>
      </div>
      {hayFiltros && (
        <button
          type="button"
          onClick={() => {
            setDesde('')
            setHasta('')
            setProyectoId('')
            setTipo('')
            setEstado('')
          }}
          className="mt-2 text-sm text-slate-500 hover:underline"
        >
          Quitar filtros
        </button>
      )}

      {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {consolidado && (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Ingresos por ventas</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{formatearCOP(consolidado.ingresosPorVentas)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Otros ingresos</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{formatearCOP(consolidado.ingresosGenerales)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Egresos</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{formatearCOP(consolidado.gastos)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 sm:col-span-2">
            <p className="text-xs text-slate-500">Total ingresos</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{formatearCOP(consolidado.totalIngresos)}</p>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="text-xs text-blue-700">Caja neta</p>
            <p className="mt-1 text-lg font-semibold text-blue-900">{formatearCOP(consolidado.cajaNeta)}</p>
          </div>
        </div>
      )}

      {consolidado && consolidado.porProyecto.length > 0 && (
        <>
          <h2 className="mt-8 text-sm font-semibold text-slate-900">Caja por proyecto</h2>
          <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {consolidado.porProyecto.map((fila) => (
              <li key={fila.proyectoId} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link to={`/proyectos/${fila.proyectoId}/finanzas`} className="font-medium text-blue-600 hover:underline">
                    {fila.nombre}
                  </Link>
                  <p className="font-semibold text-slate-900">{formatearCOP(fila.cajaNeta)}</p>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  Ventas {formatearCOP(fila.ingresosPorVentas)} · Otros ingresos {formatearCOP(fila.ingresosGenerales)} · Egresos {formatearCOP(fila.gastos)}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="mt-8 text-sm font-semibold text-slate-900">Egresos e ingresos registrados</h2>
      <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {!cargando && movimientos.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-slate-400">No hay movimientos con esos filtros.</li>
        )}
        {movimientos.map((movimiento) => {
          const anulado = movimiento.estado === 'ANULADO'
          const esGasto = movimiento.tipo === 'GASTO'
          return (
            <li key={movimiento.id}>
              <Link to={`/finanzas/movimientos/${movimiento.id}`} className={`block px-4 py-3 text-sm hover:bg-slate-50 ${anulado ? 'bg-red-50/60' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`truncate font-medium ${anulado ? 'text-slate-500 line-through' : 'text-slate-900'}`}>{movimiento.descripcion}</p>
                    <p className="text-xs text-slate-500">
                      {formatearFecha(movimiento.fecha)} · {movimiento.categoria?.nombre ?? '—'} · {movimiento.proyecto?.nombre ?? 'General'}
                    </p>
                    <p className="text-xs text-slate-400">
                      {movimiento.tieneSoporte ? 'Con soporte' : 'Sin soporte'}
                      {movimiento.origen === 'DEVOLUCION_DESISTIMIENTO' ? ' · Devolución por desistimiento' : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${anulado ? 'text-slate-400 line-through' : esGasto ? 'text-red-700' : 'text-green-700'}`}>
                      {esGasto ? '−' : '+'}
                      {formatearCOP(movimiento.valor)}
                    </p>
                    {anulado && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">ANULADO</span>}
                  </div>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
