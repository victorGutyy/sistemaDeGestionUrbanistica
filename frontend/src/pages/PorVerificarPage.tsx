import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  abrirComprobante,
  listarCuentasActivas,
  listarPorVerificar,
  verificarAbonos,
  type CuentaBancaria,
  type ListaPorVerificar,
} from '../lib/api'
import { ETIQUETA_MEDIO_PAGO } from '../lib/cierres'
import { formatearCOP, formatearFecha } from '../lib/formato'
import { textoDeEspera } from '../lib/verificacion'

const CLASE_INPUT =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500'

// Pagos por consignación, transferencia o billetera que esperan confirmarse contra el extracto del banco (RF-REC-10).
// Cuentan igual en el saldo del cliente: confirmar es un control, no un requisito para que el pago valga. Si un pago no
// aparece en el extracto, el administrador avisa al gerente y este lo anula desde la venta.
export function PorVerificarPage() {
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([])
  const [cuentaId, setCuentaId] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [lista, setLista] = useState<ListaPorVerificar | null>(null)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [nota, setNota] = useState('')
  // Los filtros con los que se cargó la lista que se ve: mientras sean distintos de los actuales, está cargando.
  const [cargadaPara, setCargadaPara] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const clave = `${cuentaId}|${desde}|${hasta}`
  const cargando = cargadaPara !== clave

  const filtros = useMemo(() => ({ cuentaId: cuentaId || undefined, desde: desde || undefined, hasta: hasta || undefined }), [cuentaId, desde, hasta])

  // Pone la lista recibida en pantalla. Lo que ya no está (porque se verificó o se anuló) deja de estar seleccionado.
  const aplicar = useCallback((recibida: ListaPorVerificar) => {
    setLista(recibida)
    setSeleccion((actual) => new Set([...actual].filter((id) => recibida.abonos.some((abono) => abono.id === id))))
    setError(null)
  }, [])

  useEffect(() => {
    listarCuentasActivas()
      .then(setCuentas)
      .catch(() => setCuentas([]))
  }, [])

  useEffect(() => {
    listarPorVerificar(filtros)
      .then(aplicar)
      .catch((err: Error) => setError(err.message))
      .finally(() => setCargadaPara(clave))
  }, [filtros, aplicar, clave])

  async function recargar() {
    try {
      aplicar(await listarPorVerificar(filtros))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo consultar')
    }
  }

  const abonos = useMemo(() => lista?.abonos ?? [], [lista])
  const elegidos = useMemo(() => abonos.filter((abono) => seleccion.has(abono.id)), [abonos, seleccion])
  const valorElegido = elegidos.reduce((suma, abono) => suma + Number(abono.valor), 0)
  const todosElegidos = abonos.length > 0 && elegidos.length === abonos.length

  function alternar(id: string) {
    setSeleccion((actual) => {
      const siguiente = new Set(actual)
      if (siguiente.has(id)) siguiente.delete(id)
      else siguiente.add(id)
      return siguiente
    })
  }

  async function handleConfirmar(event: FormEvent) {
    event.preventDefault()
    if (elegidos.length === 0) return
    const pregunta = `Vas a marcar como verificados ${elegidos.length} abono${elegidos.length === 1 ? '' : 's'} por ${formatearCOP(valorElegido)} contra el extracto del banco. No se puede deshacer. ¿Continuar?`
    if (!window.confirm(pregunta)) return
    setConfirmando(true)
    setError(null)
    setOk(null)
    try {
      const resultado = await verificarAbonos([...seleccion], nota.trim() || undefined)
      setOk(`${resultado.verificados} abono${resultado.verificados === 1 ? '' : 's'} verificado${resultado.verificados === 1 ? '' : 's'}.`)
      setSeleccion(new Set())
      setNota('')
      await recargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo verificar')
      await recargar()
    } finally {
      setConfirmando(false)
    }
  }

  async function verSoporte(abonoId: string) {
    try {
      await abrirComprobante(abonoId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir el soporte')
    }
  }

  return (
    <div className={`max-w-4xl ${elegidos.length > 0 ? 'pb-36' : ''}`}>
      <h1 className="text-lg font-semibold text-slate-900">Pagos por verificar</h1>
      <p className="text-sm text-slate-500">
        Consignaciones, transferencias y pagos por billetera que faltan por confirmar contra el extracto del banco. Ya cuentan en el saldo del cliente.
      </p>

      {lista && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs text-slate-500">Por verificar</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{lista.total}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs text-slate-500">Valor</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{formatearCOP(lista.valorTotal)}</p>
          </div>
          <div className={`rounded-lg border p-3 ${lista.total > 0 && lista.masAntiguaDias >= lista.diasAlerta ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
            <p className={`text-xs ${lista.total > 0 && lista.masAntiguaDias >= lista.diasAlerta ? 'text-red-700' : 'text-slate-500'}`}>El más antiguo lleva</p>
            <p className={`mt-1 text-lg font-semibold ${lista.total > 0 && lista.masAntiguaDias >= lista.diasAlerta ? 'text-red-900' : 'text-slate-900'}`}>
              {lista.total > 0 ? textoDeEspera(lista.masAntiguaDias) : '—'}
            </p>
          </div>
        </div>
      )}

      <form onSubmit={(evento) => evento.preventDefault()} className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="cuenta" className="block text-sm font-medium text-slate-700">
            Cuenta
          </label>
          <select id="cuenta" value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} className={CLASE_INPUT}>
            <option value="">Todas</option>
            {cuentas.map((cuenta) => (
              <option key={cuenta.id} value={cuenta.id}>
                {cuenta.alias} — {cuenta.banco}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="desde" className="block text-sm font-medium text-slate-700">
            Pagado desde
          </label>
          <input id="desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={CLASE_INPUT} />
        </div>
        <div>
          <label htmlFor="hasta" className="block text-sm font-medium text-slate-700">
            Pagado hasta
          </label>
          <input id="hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={CLASE_INPUT} />
        </div>
      </form>

      {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {ok && <div className="mt-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{ok}</div>}

      {lista && abonos.length > 0 && (
        <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={todosElegidos}
            onChange={() => setSeleccion(todosElegidos ? new Set() : new Set(abonos.map((abono) => abono.id)))}
            className="h-5 w-5 accent-blue-600"
          />
          Elegir todos los que se ven ({abonos.length})
        </label>
      )}

      {lista && (
        <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {!cargando && abonos.length === 0 && <li className="px-4 py-10 text-center text-sm text-slate-400">No hay pagos por verificar con esos datos.</li>}
          {abonos.map((abono) => (
            <li key={abono.id} className={`px-4 py-3 text-sm ${seleccion.has(abono.id) ? 'bg-blue-50/60' : ''}`}>
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  aria-label={`Elegir el recibo ${abono.recibo ?? ''} de ${abono.cliente.nombre}`}
                  checked={seleccion.has(abono.id)}
                  onChange={() => alternar(abono.id)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-blue-600"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-base font-semibold text-slate-900">{formatearCOP(abono.valor)}</p>
                    <span
                      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${abono.enAlerta ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}
                      title="Días desde que se registró el pago"
                    >
                      Espera: {textoDeEspera(abono.diasEspera)}
                    </span>
                  </div>
                  <p className="break-words text-slate-700">
                    <Link to={`/clientes/${abono.cliente.id}`} className="font-medium text-blue-600 hover:underline">
                      {abono.cliente.nombre}
                    </Link>{' '}
                    ·{' '}
                    <Link to={`/ventas/${abono.ventaId}`} className="text-blue-600 hover:underline">
                      {abono.proyecto.nombre}, lote {abono.lote}
                    </Link>
                  </p>
                  <p className="break-words text-xs text-slate-500">
                    {ETIQUETA_MEDIO_PAGO[abono.medioPago]}
                    {abono.cuenta ? ` · ${abono.cuenta.alias} (${abono.cuenta.banco})` : ''}
                    {abono.referencia ? ` · Ref. ${abono.referencia}` : ''} · Pagó el {formatearFecha(abono.fecha)}
                    {abono.recibo ? ` · ${abono.recibo}` : ''}
                    {abono.registradoPor ? ` · Registró ${abono.registradoPor}` : ''}
                  </p>
                  {abono.conSoporte && (
                    <button type="button" onClick={() => void verSoporte(abono.id)} className="mt-1 text-sm font-medium text-blue-600 hover:underline">
                      Ver soporte
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {elegidos.length > 0 && (
        <form
          onSubmit={(evento) => void handleConfirmar(evento)}
          className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] md:left-60"
        >
          <div className="mx-auto flex max-w-4xl flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="nota" className="block text-xs font-medium text-slate-700">
                Nota (opcional): por ejemplo, el movimiento del extracto
              </label>
              <input id="nota" maxLength={200} value={nota} onChange={(e) => setNota(e.target.value)} className={CLASE_INPUT} />
            </div>
            <button
              type="submit"
              disabled={confirmando}
              className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 sm:w-auto sm:py-2"
            >
              {confirmando ? 'Verificando...' : `Confirmar ${elegidos.length} (${formatearCOP(valorElegido)})`}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
