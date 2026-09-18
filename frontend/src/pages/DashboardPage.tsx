import { useEffect, useState } from 'react'
import { ejecutarRecordatorios, obtenerDashboard, urlExportarDashboard, type ResumenDashboard } from '../lib/api'

export function DashboardPage() {
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [resumen, setResumen] = useState<ResumenDashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enviandoRecordatorios, setEnviandoRecordatorios] = useState(false)
  const [resultadoRecordatorios, setResultadoRecordatorios] = useState<string | null>(null)

  async function handleEnviarRecordatorios() {
    setEnviandoRecordatorios(true)
    setResultadoRecordatorios(null)
    setError(null)
    try {
      const resultado = await ejecutarRecordatorios()
      setResultadoRecordatorios(
        `${resultado.enviados} recordatorio(s) enviado(s)` +
          (resultado.omitidosSinCorreo > 0
            ? `, ${resultado.omitidosSinCorreo} omitido(s) por no tener correo registrado`
            : ''),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron enviar los recordatorios')
    } finally {
      setEnviandoRecordatorios(false)
    }
  }

  useEffect(() => {
    const filtro = { desde: desde || undefined, hasta: hasta || undefined }
    obtenerDashboard(filtro)
      .then(setResumen)
      .catch((err: Error) => setError(err.message))
  }, [desde, hasta])

  const filtroActual = { desde: desde || undefined, hasta: hasta || undefined }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Panel general</h1>
          <p className="text-sm text-slate-500">Ingresos, egresos y cartera, consolidado y por proyecto.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleEnviarRecordatorios}
            disabled={enviandoRecordatorios}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {enviandoRecordatorios ? 'Enviando...' : 'Enviar recordatorios de pago'}
          </button>
          <a
            href={urlExportarDashboard('pdf', filtroActual)}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Exportar PDF
          </a>
          <a
            href={urlExportarDashboard('excel', filtroActual)}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Exportar Excel
          </a>
        </div>
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

      {resultadoRecordatorios && (
        <div className="mt-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {resultadoRecordatorios}
        </div>
      )}

      {resumen && (
        <>
          <h2 className="mt-6 text-sm font-semibold text-slate-900">Finanzas</h2>
          <div className="mt-2 grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Ingresos por ventas</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">${resumen.finanzas.ingresosPorVentas}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Ingresos generales</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">${resumen.finanzas.ingresosGenerales}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Gastos</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">${resumen.finanzas.gastos}</p>
            </div>
            <div className="col-span-2 rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Total ingresos</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">${resumen.finanzas.totalIngresos}</p>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <p className="text-xs text-blue-700">Caja neta</p>
              <p className="mt-1 text-lg font-semibold text-blue-900">${resumen.finanzas.cajaNeta}</p>
            </div>
          </div>

          <h2 className="mt-6 text-sm font-semibold text-slate-900">Cartera</h2>
          <div className="mt-2 grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-xs text-red-700">Cartera vencida</p>
              <p className="mt-1 text-lg font-semibold text-red-900">${resumen.cartera.saldoVencido}</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs text-amber-700">Cartera por vencer</p>
              <p className="mt-1 text-lg font-semibold text-amber-900">${resumen.cartera.saldoPorVencer}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Interés de mora</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">${resumen.cartera.interesMora}</p>
            </div>
          </div>

          <h2 className="mt-8 text-sm font-semibold text-slate-900">Por proyecto</h2>
          <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Proyecto</th>
                  <th className="px-4 py-2 font-medium">Caja neta</th>
                  <th className="px-4 py-2 font-medium">Cartera vencida</th>
                  <th className="px-4 py-2 font-medium">Por vencer</th>
                  <th className="px-4 py-2 font-medium">Interés mora</th>
                </tr>
              </thead>
              <tbody>
                {resumen.porProyecto.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                      No hay proyectos con movimientos en este período.
                    </td>
                  </tr>
                )}
                {resumen.porProyecto.map((fila) => (
                  <tr key={fila.proyectoId} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2">{fila.nombre}</td>
                    <td className="px-4 py-2">${fila.cajaNeta}</td>
                    <td className="px-4 py-2">${fila.saldoVencido}</td>
                    <td className="px-4 py-2">${fila.saldoPorVencer}</td>
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
