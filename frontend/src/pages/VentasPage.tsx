import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { aprobarVenta, listarVentas, rechazarVenta, type EstadoVenta, type Venta } from '../lib/api'
import { formatearCOP, formatearFecha } from '../lib/formato'
import { PERMISOS } from '../lib/permisos'
import { CLASE_ESTADO_VENTA, ETIQUETA_ESTADO_VENTA } from '../lib/ventas'

const ESTADOS = Object.keys(ETIQUETA_ESTADO_VENTA) as EstadoVenta[]

export function VentasPage() {
  const { tiene } = useAuth()
  const [ventas, setVentas] = useState<Venta[]>([])
  const [filtro, setFiltro] = useState<EstadoVenta | ''>('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resolviendoId, setResolviendoId] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    let vigente = true
    listarVentas(filtro || undefined)
      .then((resultado) => {
        if (vigente) setVentas(resultado)
      })
      .catch((err: Error) => {
        if (vigente) setError(err.message)
      })
      .finally(() => {
        if (vigente) setCargando(false)
      })
    return () => {
      vigente = false
    }
  }, [filtro, recarga])

  async function resolver(venta: Venta, accion: 'aprobar' | 'rechazar') {
    let motivo = ''
    if (accion === 'rechazar') {
      motivo = window.prompt('Motivo del rechazo (queda registrado):')?.trim() ?? ''
      if (motivo.length < 3) return
    } else if (!window.confirm(`¿Aprobar la venta del lote ${venta.lote.numero} a ${venta.cliente.nombre}? Se generará su plan de cuotas.`)) {
      return
    }

    setResolviendoId(venta.id)
    setError(null)
    try {
      if (accion === 'aprobar') await aprobarVenta(venta.id)
      else await rechazarVenta(venta.id, motivo)
      setRecarga((n) => n + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo resolver la venta')
    } finally {
      setResolviendoId(null)
    }
  }

  const puedeAutorizar = tiene(PERMISOS.VENTAS_AUTORIZAR)
  const pendientes = ventas.filter((v) => v.estado === 'PENDIENTE_APROBACION').length

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Ventas</h1>
          <p className="text-sm text-slate-500">Todas las ventas, con las excepciones que esperan aprobación del gerente.</p>
        </div>
        {tiene(PERMISOS.VENTAS_CREAR) && (
          <Link to="/ventas/nueva" className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Registrar venta
          </Link>
        )}
      </div>

      {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {pendientes > 0 && !filtro && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Hay {pendientes} venta(s) con excepción pendiente(s) de aprobación.
        </div>
      )}

      <div className="mt-4">
        <select
          aria-label="Filtrar por estado"
          value={filtro}
          onChange={(event) => setFiltro(event.target.value as EstadoVenta | '')}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Todos los estados</option>
          {ESTADOS.map((estado) => (
            <option key={estado} value={estado}>
              {ETIQUETA_ESTADO_VENTA[estado]}
            </option>
          ))}
        </select>
      </div>

      <ul className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {!cargando && ventas.length === 0 && <li className="px-4 py-10 text-center text-sm text-slate-400">No hay ventas con ese estado.</li>}
        {ventas.map((venta) => (
          <li key={venta.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <Link to={`/ventas/${venta.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                {venta.lote.proyecto?.nombre ?? 'Proyecto'} · {venta.lote.manzana ? `Mz. ${venta.lote.manzana.nombre} · ` : ''}Lote {venta.lote.numero}
              </Link>
              <p className="text-sm text-slate-600">{venta.cliente.nombre}</p>
              <p className="text-xs text-slate-500">
                {formatearCOP(venta.valorTotal)} · {formatearFecha(venta.fechaVenta)}
                {venta.vendedor ? ` · ${venta.vendedor.nombre}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${CLASE_ESTADO_VENTA[venta.estado]}`}>
                {ETIQUETA_ESTADO_VENTA[venta.estado]}
              </span>
              {venta.esExcepcion && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Excepción</span>}
              {puedeAutorizar && venta.estado === 'PENDIENTE_APROBACION' && (
                <>
                  <button
                    type="button"
                    disabled={resolviendoId === venta.id}
                    onClick={() => void resolver(venta, 'aprobar')}
                    className="text-sm font-medium text-blue-600 hover:underline disabled:opacity-50"
                  >
                    Aprobar
                  </button>
                  <button
                    type="button"
                    disabled={resolviendoId === venta.id}
                    onClick={() => void resolver(venta, 'rechazar')}
                    className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
                  >
                    Rechazar
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
