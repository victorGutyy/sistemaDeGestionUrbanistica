import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { TarjetaComision } from '../components/TarjetaComision'
import { useAuth } from '../contexts/AuthContext'
import {
  exportarComisiones,
  listarComisiones,
  listarProyectos,
  listarVendedores,
  type EstadoComision,
  type FiltroComisiones,
  type ListaComisiones,
  type Proyecto,
  type Vendedor,
} from '../lib/api'
import { CLASE_ESTADO_COMISION, ETIQUETA_ESTADO_COMISION } from '../lib/comisiones'
import { formatearCOP } from '../lib/formato'
import { PERMISOS } from '../lib/permisos'

const CLASE_INPUT =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500'

const ESTADOS: EstadoComision[] = ['PENDIENTE', 'PAGADA', 'ANULADA']

// Comisiones de venta (RF-COM-01 a 04) y su reporte por vendedor, estado y fechas (RF-REP-08).
export function ComisionesPage() {
  const { tiene } = useAuth()
  const [searchParams] = useSearchParams()
  const [vendedores, setVendedores] = useState<Vendedor[]>([])
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [filtro, setFiltro] = useState<FiltroComisiones>(() => {
    const estado = searchParams.get('estado')
    return { estado: ESTADOS.includes(estado as EstadoComision) ? (estado as EstadoComision) : undefined, fechaPor: 'venta' }
  })
  const [lista, setLista] = useState<ListaComisiones | null>(null)
  const [cargando, setCargando] = useState(true)
  const [exportando, setExportando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const consultar = useCallback(async (filtroActual: FiltroComisiones) => {
    setCargando(true)
    setError(null)
    try {
      setLista(await listarComisiones(filtroActual))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron consultar las comisiones')
    } finally {
      setCargando(false)
    }
  }, [])

  // Carga inicial: las listas para filtrar y las comisiones (con el estado que venga del tablero, si viene).
  useEffect(() => {
    Promise.all([listarVendedores(), listarProyectos()])
      .then(([listaVendedores, listaProyectos]) => {
        setVendedores(listaVendedores)
        setProyectos(listaProyectos)
      })
      .catch((err: Error) => setError(err.message))
    void consultar(filtro)
    // Solo al abrir la pantalla: después se consulta con el botón Buscar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function cambiar<K extends keyof FiltroComisiones>(clave: K, valor: FiltroComisiones[K] | '') {
    setFiltro((actual) => ({ ...actual, [clave]: valor === '' ? undefined : valor }))
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void consultar(filtro)
  }

  async function handleExportar() {
    setExportando(true)
    setError(null)
    try {
      await exportarComisiones(filtro)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo exportar el reporte')
    } finally {
      setExportando(false)
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Comisiones</h1>
          <p className="text-sm text-slate-500">
            Cada venta con vendedor genera su comisión (valor fijo por tipo de vendedor). Al pagarla se crea el egreso en Finanzas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleExportar()}
          disabled={exportando}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {exportando ? 'Generando...' : 'Exportar a Excel'}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-white p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="vendedor" className="block text-sm font-medium text-slate-700">
              Vendedor
            </label>
            <select id="vendedor" value={filtro.vendedorId ?? ''} onChange={(e) => cambiar('vendedorId', e.target.value)} className={CLASE_INPUT}>
              <option value="">Todos</option>
              {vendedores.map((vendedor) => (
                <option key={vendedor.id} value={vendedor.id}>
                  {vendedor.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="estado" className="block text-sm font-medium text-slate-700">
              Estado
            </label>
            <select id="estado" value={filtro.estado ?? ''} onChange={(e) => cambiar('estado', e.target.value as EstadoComision | '')} className={CLASE_INPUT}>
              <option value="">Todos</option>
              {ESTADOS.map((estado) => (
                <option key={estado} value={estado}>
                  {ETIQUETA_ESTADO_COMISION[estado]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="proyecto" className="block text-sm font-medium text-slate-700">
              Proyecto
            </label>
            <select id="proyecto" value={filtro.proyectoId ?? ''} onChange={(e) => cambiar('proyectoId', e.target.value)} className={CLASE_INPUT}>
              <option value="">Todos</option>
              {proyectos.map((proyecto) => (
                <option key={proyecto.id} value={proyecto.id}>
                  {proyecto.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="fechaPor" className="block text-sm font-medium text-slate-700">
              Las fechas son de…
            </label>
            <select id="fechaPor" value={filtro.fechaPor ?? 'venta'} onChange={(e) => cambiar('fechaPor', e.target.value as 'venta' | 'pago')} className={CLASE_INPUT}>
              <option value="venta">La venta</option>
              <option value="pago">El pago de la comisión</option>
            </select>
          </div>
          <div>
            <label htmlFor="desde" className="block text-sm font-medium text-slate-700">
              Desde
            </label>
            <input id="desde" type="date" value={filtro.desde ?? ''} onChange={(e) => cambiar('desde', e.target.value)} className={CLASE_INPUT} />
          </div>
          <div>
            <label htmlFor="hasta" className="block text-sm font-medium text-slate-700">
              Hasta
            </label>
            <input id="hasta" type="date" value={filtro.hasta ?? ''} onChange={(e) => cambiar('hasta', e.target.value)} className={CLASE_INPUT} />
          </div>
        </div>
        <button
          type="submit"
          disabled={cargando}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 sm:w-auto"
        >
          {cargando ? 'Buscando...' : 'Buscar'}
        </button>
      </form>

      {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {lista && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {ESTADOS.map((estado) => (
              <div key={estado} className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs text-slate-500">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CLASE_ESTADO_COMISION[estado]}`}>{ETIQUETA_ESTADO_COMISION[estado]}</span>{' '}
                  · {lista.totales[estado].cantidad}
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{formatearCOP(lista.totales[estado].valor)}</p>
              </div>
            ))}
          </div>

          {lista.comisiones.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No hay comisiones con esos datos.</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
              {lista.comisiones.map((comision) => (
                <li key={comision.id} className={comision.estado === 'ANULADA' ? 'bg-slate-50/70' : ''}>
                  <TarjetaComision
                    comision={comision}
                    puedePagar={tiene(PERMISOS.COMISIONES_PAGAR)}
                    puedeAnular={tiene(PERMISOS.COMISIONES_ANULAR)}
                    onCambio={() => void consultar(filtro)}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
