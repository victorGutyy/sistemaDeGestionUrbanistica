import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { PERMISOS } from '../lib/permisos'
import { ejecutarRecordatorios, exportarDashboard, listarProyectos, obtenerDashboard, type Proyecto, type ResumenDashboard } from '../lib/api'
import { ETIQUETA_ESTADO_LOTE } from '../lib/estadoLote'
import { formatearCOP } from '../lib/formato'

export function DashboardPage() {
  const { tiene } = useAuth()
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [proyectoId, setProyectoId] = useState('')
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [resumen, setResumen] = useState<ResumenDashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enviandoRecordatorios, setEnviandoRecordatorios] = useState(false)
  const [resultadoRecordatorios, setResultadoRecordatorios] = useState<string | null>(null)
  const [exportando, setExportando] = useState<'pdf' | 'excel' | null>(null)

  async function handleExportar(formato: 'pdf' | 'excel') {
    setExportando(formato)
    setError(null)
    try {
      await exportarDashboard(formato, { desde: desde || undefined, hasta: hasta || undefined, proyectoId: proyectoId || undefined })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo exportar el reporte')
    } finally {
      setExportando(null)
    }
  }

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

  // Los proyectos que se pueden elegir para mirar el panel de uno solo (RF-REP-01).
  useEffect(() => {
    listarProyectos()
      .then(setProyectos)
      .catch(() => setProyectos([]))
  }, [])

  useEffect(() => {
    const filtro = { desde: desde || undefined, hasta: hasta || undefined, proyectoId: proyectoId || undefined }
    obtenerDashboard(filtro)
      .then((datos) => {
        setError(null)
        setResumen(datos)
      })
      .catch((err: Error) => setError(err.message))
  }, [desde, hasta, proyectoId])

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Panel general</h1>
          <p className="text-sm text-slate-500">
            Ingresos, egresos, utilidad, cartera y lotes, {resumen?.proyecto ? `del proyecto ${resumen.proyecto.nombre}` : 'consolidado y por proyecto'}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tiene(PERMISOS.RECORDATORIOS_EJECUTAR) && (
            <button
              type="button"
              onClick={handleEnviarRecordatorios}
              disabled={enviandoRecordatorios}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {enviandoRecordatorios ? 'Enviando...' : 'Enviar recordatorios de pago'}
            </button>
          )}
          <button
            type="button"
            onClick={() => handleExportar('pdf')}
            disabled={exportando !== null}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {exportando === 'pdf' ? 'Generando...' : 'Exportar PDF'}
          </button>
          <button
            type="button"
            onClick={() => handleExportar('excel')}
            disabled={exportando !== null}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {exportando === 'excel' ? 'Generando...' : 'Exportar Excel'}
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
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
        <div>
          <label htmlFor="proyecto" className="block text-xs font-medium text-slate-700">
            Proyecto
          </label>
          <select
            id="proyecto"
            value={proyectoId}
            onChange={(event) => setProyectoId(event.target.value)}
            className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Todos</option>
            {proyectos.map((proyecto) => (
              <option key={proyecto.id} value={proyecto.id}>
                {proyecto.nombre}
              </option>
            ))}
          </select>
        </div>
        {(desde || hasta || proyectoId) && (
          <button
            type="button"
            onClick={() => {
              setDesde('')
              setHasta('')
              setProyectoId('')
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
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Ingresos por ventas</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{formatearCOP(resumen.finanzas.ingresosPorVentas)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Ingresos generales</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{formatearCOP(resumen.finanzas.ingresosGenerales)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Gastos</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{formatearCOP(resumen.finanzas.gastos)}</p>
            </div>
            <div className="rounded-lg sm:col-span-2 border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Total ingresos</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{formatearCOP(resumen.finanzas.totalIngresos)}</p>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <p className="text-xs text-blue-700">Utilidad del período (caja neta)</p>
              <p className="mt-1 text-lg font-semibold text-blue-900">{formatearCOP(resumen.finanzas.cajaNeta)}</p>
            </div>
          </div>

          {(resumen.comisionesPendientes || resumen.cierresPorAprobar !== undefined) && <h2 className="mt-6 text-sm font-semibold text-slate-900">Pendientes</h2>}
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {resumen.cierresPorAprobar !== undefined && (
            <Link
              to="/caja"
              className={`block rounded-lg border p-4 ${resumen.cierresPorAprobar > 0 ? 'border-amber-200 bg-amber-50 hover:bg-amber-100' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
            >
              <p className={`text-xs ${resumen.cierresPorAprobar > 0 ? 'text-amber-800' : 'text-slate-500'}`}>Cierres de caja por aprobar</p>
              <p className={`mt-1 text-lg font-semibold ${resumen.cierresPorAprobar > 0 ? 'text-amber-900' : 'text-slate-900'}`}>{resumen.cierresPorAprobar}</p>
            </Link>
          )}
          {resumen.comisionesPendientes && (
            <Link
              to="/comisiones?estado=PENDIENTE"
              className="block rounded-lg border border-amber-200 bg-amber-50 p-4 hover:bg-amber-100"
            >
              <p className="text-xs text-amber-800">Comisiones por pagar</p>
              <p className="mt-1 text-lg font-semibold text-amber-900">
                {formatearCOP(resumen.comisionesPendientes.valor)}{' '}
                <span className="text-sm font-normal">({resumen.comisionesPendientes.cantidad} pendiente{resumen.comisionesPendientes.cantidad === 1 ? '' : 's'})</span>
              </p>
            </Link>
          )}
          </div>

          <h2 className="mt-6 text-sm font-semibold text-slate-900">Cartera</h2>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-xs text-red-700">Cartera vencida</p>
              <p className="mt-1 text-lg font-semibold text-red-900">{formatearCOP(resumen.cartera.saldoVencido)}</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs text-amber-700">Por vencer (próximos {resumen.cartera.diasAlerta} días)</p>
              <p className="mt-1 text-lg font-semibold text-amber-900">{formatearCOP(resumen.cartera.saldoProximoAVencer)}</p>
            </div>
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="text-xs text-green-700">Al día (más de {resumen.cartera.diasAlerta} días para vencer)</p>
              <p className="mt-1 text-lg font-semibold text-green-900">{formatearCOP(Number(resumen.cartera.saldoPorVencer) - Number(resumen.cartera.saldoProximoAVencer))}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Interés de mora</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{formatearCOP(resumen.cartera.interesMora)}</p>
            </div>
          </div>

          <h2 className="mt-6 text-sm font-semibold text-slate-900">Lotes por estado</h2>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(Object.keys(resumen.lotesPorEstado) as (keyof typeof resumen.lotesPorEstado)[]).map((estado) => (
              <div key={estado} className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-500">{ETIQUETA_ESTADO_LOTE[estado]}</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{resumen.lotesPorEstado[estado]}</p>
              </div>
            ))}
          </div>

          <h2 className="mt-8 text-sm font-semibold text-slate-900">Por proyecto</h2>
          <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full min-w-[30rem] text-left text-sm">
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
                    <td className="px-4 py-2">{formatearCOP(fila.cajaNeta)}</td>
                    <td className="px-4 py-2">{formatearCOP(fila.saldoVencido)}</td>
                    <td className="px-4 py-2">{formatearCOP(fila.saldoPorVencer)}</td>
                    <td className="px-4 py-2">{formatearCOP(fila.interesMora)}</td>
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
