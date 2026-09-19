import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  listarCartera,
  obtenerReporteCartera,
  type FilaCartera,
  type ReporteCartera,
  type Semaforo,
} from '../lib/api'

const ESTILO_SEMAFORO: Record<Semaforo, string> = {
  VERDE: 'bg-green-100 text-green-700',
  AMARILLO: 'bg-amber-100 text-amber-700',
  ROJO: 'bg-red-100 text-red-700',
}

const ETIQUETA_SEMAFORO: Record<Semaforo, string> = {
  VERDE: 'Al día',
  AMARILLO: 'Próximo a vencer',
  ROJO: 'En mora',
}

export function CarteraPage() {
  const [filas, setFilas] = useState<FilaCartera[]>([])
  const [reporte, setReporte] = useState<ReporteCartera | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    Promise.all([listarCartera(), obtenerReporteCartera()])
      .then(([filasRecibidas, reporteRecibido]) => {
        setFilas(filasRecibidas)
        setReporte(reporteRecibido)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setCargando(false))
  }, [])

  return (
    <div>
      <h1 className="text-lg font-semibold text-slate-900">Cartera y mora</h1>
      <p className="text-sm text-slate-500">Estado de pago de cada cliente y cartera vencida por proyecto.</p>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {reporte && (
        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Cartera vencida (consolidado)</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">${reporte.consolidado.saldoVencido}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Interés de mora acumulado</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">${reporte.consolidado.interesMora}</p>
          </div>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Saldo vencido</th>
              <th className="px-4 py-3 font-medium">Interés de mora</th>
              <th className="px-4 py-3 font-medium">Próxima cuota</th>
              <th className="px-4 py-3 font-medium">Seguimiento</th>
            </tr>
          </thead>
          <tbody>
            {!cargando && filas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  No hay clientes con ventas activas todavía.
                </td>
              </tr>
            )}
            {filas.map((fila) => (
              <tr key={fila.cliente.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">
                  {fila.cliente.nombre}
                  <span className="ml-1 text-xs text-slate-400">— {fila.cliente.documento}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTILO_SEMAFORO[fila.semaforo]}`}>
                    {ETIQUETA_SEMAFORO[fila.semaforo]}
                  </span>
                </td>
                <td className="px-4 py-3">${fila.saldoVencido}</td>
                <td className="px-4 py-3">${fila.interesMora}</td>
                <td className="px-4 py-3">
                  {fila.proximaCuota
                    ? `#${fila.proximaCuota.numero} · ${fila.proximaCuota.fechaVencimiento.slice(0, 10)}`
                    : '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    {fila.ventas.map((venta) => (
                      <Link
                        key={venta.id}
                        to={`/ventas/${venta.id}`}
                        className="text-sm font-medium text-blue-600 hover:underline"
                      >
                        Lote {venta.numeroLote} ({venta.nombreProyecto})
                      </Link>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {reporte && reporte.porProyecto.length > 0 && (
        <>
          <h2 className="mt-8 text-sm font-semibold text-slate-900">Cartera vencida por proyecto</h2>
          <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Proyecto</th>
                  <th className="px-4 py-2 font-medium">Saldo vencido</th>
                  <th className="px-4 py-2 font-medium">Interés de mora</th>
                </tr>
              </thead>
              <tbody>
                {reporte.porProyecto.map((fila) => (
                  <tr key={fila.proyectoId} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2">{fila.nombre}</td>
                    <td className="px-4 py-2">${fila.saldoVencido}</td>
                    <td className="px-4 py-2">${fila.interesMora}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
