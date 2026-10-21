import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { EtiquetaVerificacion } from '../components/EtiquetaVerificacion'
import { abrirRecibo, buscarRecibos, type EstadoAbono, type ReciboResumen } from '../lib/api'
import { formatearCOP, formatearFecha } from '../lib/formato'

const CLASE_INPUT =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500'

// Búsqueda de recibos de caja (RF-REC-05): por número, cliente, documento, lote o referencia.
export function RecibosPage() {
  const [buscar, setBuscar] = useState('')
  const [estado, setEstado] = useState<EstadoAbono | ''>('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [recibos, setRecibos] = useState<ReciboResumen[] | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const consultar = useCallback(async (filtro: { buscar: string; estado: EstadoAbono | ''; desde: string; hasta: string }) => {
    setCargando(true)
    setError(null)
    try {
      setRecibos(
        await buscarRecibos({
          buscar: filtro.buscar.trim() || undefined,
          estado: filtro.estado || undefined,
          desde: filtro.desde || undefined,
          hasta: filtro.hasta || undefined,
        }),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron consultar los recibos')
    } finally {
      setCargando(false)
    }
  }, [])

  // Carga inicial: los recibos más recientes, sin filtros.
  useEffect(() => {
    let vigente = true
    buscarRecibos()
      .then((lista) => vigente && setRecibos(lista))
      .catch((err: Error) => vigente && setError(err.message))
      .finally(() => vigente && setCargando(false))
    return () => {
      vigente = false
    }
  }, [])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void consultar({ buscar, estado, desde, hasta })
  }

  async function handleVerRecibo(abonoId: string) {
    setError(null)
    try {
      await abrirRecibo(abonoId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir el recibo')
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-semibold text-slate-900">Recibos</h1>
      <p className="text-sm text-slate-500">Busca un recibo por su número, el nombre o documento del cliente, el lote o la referencia del pago.</p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-white p-3">
        <div>
          <label htmlFor="buscar" className="block text-sm font-medium text-slate-700">
            Buscar
          </label>
          <input
            id="buscar"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="RC-000012, nombre, documento, lote o referencia"
            className={CLASE_INPUT}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="estado" className="block text-sm font-medium text-slate-700">
              Estado
            </label>
            <select id="estado" value={estado} onChange={(e) => setEstado(e.target.value as EstadoAbono | '')} className={CLASE_INPUT}>
              <option value="">Todos</option>
              <option value="ACTIVO">Vigentes</option>
              <option value="ANULADO">Anulados</option>
            </select>
          </div>
          <div>
            <label htmlFor="desde" className="block text-sm font-medium text-slate-700">
              Desde
            </label>
            <input id="desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={CLASE_INPUT} />
          </div>
          <div>
            <label htmlFor="hasta" className="block text-sm font-medium text-slate-700">
              Hasta
            </label>
            <input id="hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={CLASE_INPUT} />
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

      {recibos && (
        <>
          <p className="mt-4 text-xs text-slate-500">
            {recibos.length === 0
              ? 'No hay recibos con esos datos.'
              : `${recibos.length} recibo${recibos.length === 1 ? '' : 's'}${recibos.length >= 200 ? ' (se muestran los 200 más recientes: afina la búsqueda)' : ''}`}
          </p>
          <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {recibos.map((recibo) => {
              const anulado = recibo.estado === 'ANULADO'
              return (
                <li key={recibo.abonoId} className={`px-4 py-3 text-sm ${anulado ? 'bg-red-50/60' : ''}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono font-medium text-slate-900">
                        {recibo.recibo.numeroTexto}
                        {anulado && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 font-sans text-xs font-medium text-red-700">ANULADO</span>}
                        {recibo.recibo.esHistorico && <span className="ml-2 font-sans text-xs text-slate-500">(histórico)</span>}
                        {!anulado && (
                          <span className="ml-2 font-sans">
                            <EtiquetaVerificacion estado={recibo.verificacion} />
                          </span>
                        )}
                      </p>
                      <p className="text-slate-700">
                        {recibo.cliente.nombre} · {recibo.proyecto} · Lote {recibo.lote}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatearFecha(recibo.fecha)}
                        {recibo.cuenta ? ` · ${recibo.cuenta.alias}` : ''}
                        {recibo.referencia ? ` · Ref. ${recibo.referencia}` : ''}
                      </p>
                    </div>
                    <p className={`text-base font-semibold ${anulado ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{formatearCOP(recibo.valor)}</p>
                  </div>
                  <div className="mt-2 flex gap-4">
                    <button type="button" onClick={() => void handleVerRecibo(recibo.abonoId)} className="font-medium text-blue-600 hover:underline">
                      Ver recibo
                    </button>
                    <Link to={`/ventas/${recibo.ventaId}`} className="text-blue-600 hover:underline">
                      Ver la venta
                    </Link>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
