import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  listarMovimientos,
  obtenerConsolidadoCaja,
  type ConsolidadoCaja,
  type Movimiento,
} from '../lib/api'

const ETIQUETA_TIPO: Record<Movimiento['tipo'], string> = {
  INGRESO: 'Ingreso',
  GASTO: 'Gasto',
}

const ESTILO_TIPO: Record<Movimiento['tipo'], string> = {
  INGRESO: 'text-green-700',
  GASTO: 'text-red-700',
}

export function ContabilidadPage() {
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [consolidado, setConsolidado] = useState<ConsolidadoCaja | null>(null)
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    const filtro = { desde: desde || undefined, hasta: hasta || undefined }
    Promise.all([obtenerConsolidadoCaja(filtro), listarMovimientos(filtro)])
      .then(([consolidadoRecibido, movimientosRecibidos]) => {
        setConsolidado(consolidadoRecibido)
        setMovimientos(movimientosRecibidos)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setCargando(false))
  }, [desde, hasta])

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Finanzas generales</h1>
          <p className="text-sm text-slate-500">Gastos e ingresos de la empresa, y consolidado de caja.</p>
        </div>
        <Link
          to="/contabilidad/nuevo"
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Registrar movimiento
        </Link>
      </div>

      <div className="mt-4 flex items-end gap-3">
        <div>
          <label htmlFor="desde" className="block text-xs font-medium text-slate-700">
            Desde
          </label>
          <input
            id="desde"
            type="date"
            value={desde}
            onChange={(event) => setDesde(event.target.value)}
            className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="hasta" className="block text-xs font-medium text-slate-700">
            Hasta
          </label>
          <input
            id="hasta"
            type="date"
            value={hasta}
            onChange={(event) => setHasta(event.target.value)}
            className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
        {(desde || hasta) && (
          <button
            type="button"
            onClick={() => {
              setDesde('')
              setHasta('')
            }}
            className="text-sm text-slate-500 hover:underline"
          >
            Quitar filtro
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {consolidado && (
        <div className="mt-6 grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Ingresos por ventas</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">${consolidado.ingresosPorVentas}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Ingresos generales</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">${consolidado.ingresosGenerales}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Gastos</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">${consolidado.gastos}</p>
          </div>
          <div className="col-span-2 rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Total ingresos</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">${consolidado.totalIngresos}</p>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="text-xs text-blue-700">Caja neta</p>
            <p className="mt-1 text-lg font-semibold text-blue-900">${consolidado.cajaNeta}</p>
          </div>
        </div>
      )}

      {consolidado && consolidado.porProyecto.length > 0 && (
        <>
          <h2 className="mt-8 text-sm font-semibold text-slate-900">Caja por proyecto</h2>
          <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Proyecto</th>
                  <th className="px-4 py-2 font-medium">Ingresos por ventas</th>
                  <th className="px-4 py-2 font-medium">Ingresos generales</th>
                  <th className="px-4 py-2 font-medium">Gastos</th>
                  <th className="px-4 py-2 font-medium">Caja neta</th>
                </tr>
              </thead>
              <tbody>
                {consolidado.porProyecto.map((fila) => (
                  <tr key={fila.proyectoId} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2">{fila.nombre}</td>
                    <td className="px-4 py-2">${fila.ingresosPorVentas}</td>
                    <td className="px-4 py-2">${fila.ingresosGenerales}</td>
                    <td className="px-4 py-2">${fila.gastos}</td>
                    <td className="px-4 py-2">${fila.cajaNeta}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2 className="mt-8 text-sm font-semibold text-slate-900">Movimientos registrados</h2>
      <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Fecha</th>
              <th className="px-4 py-2 font-medium">Tipo</th>
              <th className="px-4 py-2 font-medium">Concepto</th>
              <th className="px-4 py-2 font-medium">Proyecto</th>
              <th className="px-4 py-2 font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {!cargando && movimientos.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  No hay movimientos registrados en este período.
                </td>
              </tr>
            )}
            {movimientos.map((movimiento) => (
              <tr key={movimiento.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2">{movimiento.fecha.slice(0, 10)}</td>
                <td className={`px-4 py-2 font-medium ${ESTILO_TIPO[movimiento.tipo]}`}>
                  {ETIQUETA_TIPO[movimiento.tipo]}
                </td>
                <td className="px-4 py-2">{movimiento.concepto}</td>
                <td className="px-4 py-2">{movimiento.proyecto?.nombre ?? '—'}</td>
                <td className="px-4 py-2">${movimiento.valor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
