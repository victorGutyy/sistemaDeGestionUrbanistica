import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { obtenerFinanzasProyecto, type FinanzasProyecto } from '../lib/api'
import { formatearCOP, formatearFecha } from '../lib/formato'
import { PERMISOS } from '../lib/permisos'

const CLASE_INPUT =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500'

function Tarjeta({ etiqueta, valor, destacada = false }: { etiqueta: string; valor: string; destacada?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${destacada ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white'}`}>
      <p className={`text-xs ${destacada ? 'text-blue-700' : 'text-slate-500'}`}>{etiqueta}</p>
      <p className={`mt-1 text-lg font-semibold ${destacada ? 'text-blue-900' : 'text-slate-900'}`}>{valor}</p>
    </div>
  )
}

// Sección de finanzas de un proyecto (RF-EGR-05, 06 y 08): lo recaudado, lo gastado, la utilidad y el detalle.
export function ProyectoFinanzasPage() {
  const { id } = useParams<{ id: string }>()
  const { tiene } = useAuth()
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [datos, setDatos] = useState<FinanzasProyecto | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let vigente = true
    obtenerFinanzasProyecto(id, { desde: desde || undefined, hasta: hasta || undefined })
      .then((recibido) => {
        if (vigente) {
          setDatos(recibido)
          setError(null)
        }
      })
      .catch((err: Error) => vigente && setError(err.message))
    return () => {
      vigente = false
    }
  }, [id, desde, hasta])

  if (error && !datos) {
    return <p className="text-sm text-red-600">{error}</p>
  }
  if (!datos) {
    return <p className="text-sm text-slate-500">Cargando finanzas...</p>
  }

  const { proyecto, resumen, movimientos } = datos
  const tieneVentas = Number(resumen.valorVendido) > 0

  return (
    <div className="max-w-4xl">
      <Link to={`/proyectos/${proyecto.id}`} className="text-sm text-blue-600 hover:underline">
        ← {proyecto.nombre}
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Finanzas del proyecto</h1>
          <p className="text-sm text-slate-500">Ingresos y egresos de {proyecto.nombre}. Lo anulado se muestra pero no suma.</p>
        </div>
        {tiene(PERMISOS.FINANZAS_REGISTRAR) && (
          <Link to={`/finanzas/nuevo?proyectoId=${proyecto.id}`} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Registrar egreso o ingreso
          </Link>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:max-w-sm">
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
      </div>

      {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Tarjeta etiqueta="Ingresos por ventas" valor={formatearCOP(resumen.ingresosPorVentas)} />
        <Tarjeta etiqueta="Otros ingresos" valor={formatearCOP(resumen.otrosIngresos)} />
        <Tarjeta etiqueta="Egresos" valor={formatearCOP(resumen.egresos)} />
        <Tarjeta etiqueta="Utilidad" valor={formatearCOP(resumen.utilidad)} destacada />
      </div>

      {tieneVentas && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Tarjeta etiqueta="Valor vendido" valor={formatearCOP(resumen.valorVendido)} />
          <Tarjeta etiqueta="Recaudado de las ventas" valor={formatearCOP(resumen.recaudadoVentas)} />
          <Tarjeta etiqueta="Saldo por cobrar" valor={formatearCOP(resumen.saldoPorCobrar)} />
        </div>
      )}

      <h2 className="mt-8 text-sm font-semibold text-slate-900">Detalle de ingresos y egresos</h2>
      <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {movimientos.length === 0 && <li className="px-4 py-10 text-center text-sm text-slate-400">No hay movimientos en este período.</li>}
        {movimientos.map((fila) => {
          const anulado = fila.estado === 'ANULADO'
          const esGasto = fila.tipo === 'GASTO'
          const enlace = fila.origen === 'ABONO' && fila.ventaId ? `/ventas/${fila.ventaId}` : `/finanzas/movimientos/${fila.id}`
          return (
            <li key={`${fila.origen}-${fila.id}`}>
              <Link to={enlace} className={`block px-4 py-3 text-sm hover:bg-slate-50 ${anulado ? 'bg-red-50/60' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`truncate font-medium ${anulado ? 'text-slate-500 line-through' : 'text-slate-900'}`}>{fila.descripcion}</p>
                    <p className="text-xs text-slate-500">
                      {formatearFecha(fila.fecha)} · {fila.categoria}
                      {fila.recibo ? ` · ${fila.recibo}` : ''}
                      {fila.cuenta ? ` · ${fila.cuenta}` : ''}
                    </p>
                    {fila.registradoPor && <p className="text-xs text-slate-400">Registró {fila.registradoPor}</p>}
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${anulado ? 'text-slate-400 line-through' : esGasto ? 'text-red-700' : 'text-green-700'}`}>
                      {esGasto ? '−' : '+'}
                      {formatearCOP(fila.valor)}
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
