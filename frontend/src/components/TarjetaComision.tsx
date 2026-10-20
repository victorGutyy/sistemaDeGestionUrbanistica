import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CuentaYReferencia } from './CuentaYReferencia'
import { anularComision, listarCuentasActivas, listarMediosPago, pagarComision, type Comision, type CuentaBancaria, type MedioPago, type MedioPagoConfig } from '../lib/api'
import { CLASE_ESTADO_COMISION, ETIQUETA_ESTADO_COMISION, ETIQUETA_TIPO_VENDEDOR, nombreDelLote } from '../lib/comisiones'
import { formatearCOP, formatearFecha, hoyEnBogota } from '../lib/formato'

const CLASE_INPUT =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500'

interface Props {
  comision: Comision
  puedePagar: boolean
  puedeAnular: boolean
  // Enlace a la venta (en la lista de comisiones sí; dentro de la propia venta sobra).
  mostrarVenta?: boolean
  onCambio: (comision: Comision) => void
}

// Una comisión con sus acciones (RF-COM-02 y 03): pagarla (crea el egreso) o anularla (la pagada anula también su egreso).
export function TarjetaComision({ comision, puedePagar, puedeAnular, mostrarVenta = true, onCambio }: Props) {
  const [accion, setAccion] = useState<'pagar' | 'anular' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  // Pago
  const [mediosPago, setMediosPago] = useState<MedioPagoConfig[]>([])
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([])
  const [fecha, setFecha] = useState(() => hoyEnBogota())
  const [medioPago, setMedioPago] = useState<MedioPago | ''>('')
  const [cuentaId, setCuentaId] = useState('')
  const [referencia, setReferencia] = useState('')
  const [soporte, setSoporte] = useState<File | null>(null)
  const [motivoSinSoporte, setMotivoSinSoporte] = useState('')
  // Anulación
  const [motivo, setMotivo] = useState('')

  useEffect(() => {
    if (accion !== 'pagar' || mediosPago.length > 0) return
    Promise.all([listarMediosPago(), listarCuentasActivas().catch(() => [] as CuentaBancaria[])])
      .then(([medios, cuentasActivas]) => {
        const activos = medios.filter((m) => m.activo)
        setMediosPago(activos)
        setMedioPago((actual) => actual || (activos[0]?.medio ?? ''))
        setCuentas(cuentasActivas)
      })
      .catch((err: Error) => setError(err.message))
  }, [accion, mediosPago.length])

  function abrir(nueva: 'pagar' | 'anular') {
    setError(null)
    setAccion((actual) => (actual === nueva ? null : nueva))
  }

  async function handlePagar(event: FormEvent) {
    event.preventDefault()
    if (!medioPago) return
    if (!window.confirm(`¿Registrar el pago de ${formatearCOP(comision.valor)} a ${comision.vendedor.nombre}? Se crea el egreso en Finanzas.`)) return
    setEnviando(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('fecha', fecha)
      formData.append('medioPago', medioPago)
      if (medioPago !== 'EFECTIVO' && cuentaId) formData.append('cuentaId', cuentaId)
      if (referencia.trim()) formData.append('referencia', referencia.trim())
      if (soporte) formData.append('soporte', soporte)
      else formData.append('motivoSinSoporte', motivoSinSoporte.trim())
      onCambio(await pagarComision(comision.id, formData))
      setAccion(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el pago')
    } finally {
      setEnviando(false)
    }
  }

  async function handleAnular(event: FormEvent) {
    event.preventDefault()
    const aviso =
      comision.estado === 'PAGADA'
        ? '¿Anular la comisión? También se anula el egreso del pago y deja de contar en la caja y las finanzas.'
        : '¿Anular la comisión? Ya no se podrá pagar.'
    if (!window.confirm(aviso)) return
    setEnviando(true)
    setError(null)
    try {
      onCambio(await anularComision(comision.id, motivo.trim()))
      setAccion(null)
      setMotivo('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo anular la comisión')
    } finally {
      setEnviando(false)
    }
  }

  const movimiento = comision.movimiento

  return (
    <div className="px-4 py-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-slate-900">
            {comision.vendedor.nombre}
            <span className={`ml-2 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${CLASE_ESTADO_COMISION[comision.estado]}`}>
              {ETIQUETA_ESTADO_COMISION[comision.estado]}
            </span>
          </p>
          <p className="text-xs text-slate-500">
            {ETIQUETA_TIPO_VENDEDOR[comision.tipoVendedor]} · Doc. {comision.vendedor.documento}
          </p>
          <p className="text-slate-700">
            {comision.venta.lote.proyecto.nombre} · Lote {nombreDelLote(comision.venta.lote)} · {comision.venta.cliente.nombre}
          </p>
          <p className="text-xs text-slate-500">Venta del {formatearFecha(comision.venta.fechaVenta)}</p>
        </div>
        <p className={`text-base font-semibold ${comision.estado === 'ANULADA' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{formatearCOP(comision.valor)}</p>
      </div>

      {movimiento && (
        <p className="mt-2 text-xs text-slate-600">
          {comision.estado === 'ANULADA' ? 'Había sido pagada' : 'Pagada'} el {formatearFecha(movimiento.fecha)}
          {comision.pagadaPor ? ` por ${comision.pagadaPor.nombre}` : ''} · {movimiento.medioPago.toLowerCase()}
          {movimiento.cuenta ? ` · ${movimiento.cuenta.alias}` : ''}
          {movimiento.referencia ? ` · Ref. ${movimiento.referencia}` : ''}
          {movimiento.tieneSoporte ? ' · con soporte' : movimiento.motivoSinSoporte ? ` · sin soporte: ${movimiento.motivoSinSoporte}` : ''}
        </p>
      )}
      {comision.estado === 'ANULADA' && (
        <p className="mt-1 text-xs text-slate-600">
          Anulada{comision.anuladaPor ? ` por ${comision.anuladaPor.nombre}` : ''}
          {comision.anuladaEn ? ` el ${formatearFecha(comision.anuladaEn)}` : ''}: {comision.motivoAnulacion}
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {comision.estado === 'PENDIENTE' && puedePagar && (
          <button type="button" onClick={() => abrir('pagar')} className="font-medium text-blue-600 hover:underline">
            Pagar
          </button>
        )}
        {comision.estado !== 'ANULADA' && puedeAnular && (
          <button type="button" onClick={() => abrir('anular')} className="font-medium text-red-600 hover:underline">
            Anular
          </button>
        )}
        {movimiento && (
          <Link to={`/finanzas/movimientos/${movimiento.id}`} className="text-blue-600 hover:underline">
            Ver el egreso
          </Link>
        )}
        {mostrarVenta && (
          <Link to={`/ventas/${comision.venta.id}`} className="text-blue-600 hover:underline">
            Ver la venta
          </Link>
        )}
      </div>

      {error && <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {accion === 'pagar' && (
        <form onSubmit={handlePagar} className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-600">
            Se crea un egreso de {formatearCOP(comision.valor)} en la categoría Comisiones del proyecto {comision.venta.lote.proyecto.nombre}.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`fecha-${comision.id}`} className="block text-sm font-medium text-slate-700">
                Fecha del pago
              </label>
              <input id={`fecha-${comision.id}`} required type="date" max={hoyEnBogota()} value={fecha} onChange={(e) => setFecha(e.target.value)} className={CLASE_INPUT} />
            </div>
            <div>
              <label htmlFor={`medio-${comision.id}`} className="block text-sm font-medium text-slate-700">
                Medio de pago
              </label>
              <select id={`medio-${comision.id}`} value={medioPago} onChange={(e) => setMedioPago(e.target.value as MedioPago)} className={CLASE_INPUT}>
                {mediosPago.map((medio) => (
                  <option key={medio.medio} value={medio.medio}>
                    {medio.etiqueta}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <CuentaYReferencia
            medioPago={medioPago}
            cuentas={cuentas}
            cuentaId={cuentaId}
            onCuentaChange={setCuentaId}
            referencia={referencia}
            onReferenciaChange={setReferencia}
            etiquetaCuenta="Cuenta de donde salió el dinero"
            ayudaReferencia=""
          />
          <div>
            <label htmlFor={`soporte-${comision.id}`} className="block text-sm font-medium text-slate-700">
              Soporte del pago (imagen o PDF; si no hay, explica por qué)
            </label>
            <input
              id={`soporte-${comision.id}`}
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              onChange={(e) => setSoporte(e.target.files?.[0] ?? null)}
              className="mt-1 w-full text-sm text-slate-700"
            />
          </div>
          {!soporte && (
            <div>
              <label htmlFor={`sinsoporte-${comision.id}`} className="block text-sm font-medium text-slate-700">
                ¿Por qué no hay soporte?
              </label>
              <textarea
                id={`sinsoporte-${comision.id}`}
                required
                rows={2}
                maxLength={300}
                value={motivoSinSoporte}
                onChange={(e) => setMotivoSinSoporte(e.target.value)}
                placeholder="Ej. Se pagó en efectivo y el vendedor no entregó recibo"
                className={CLASE_INPUT}
              />
            </div>
          )}
          <button
            type="submit"
            disabled={enviando || !medioPago}
            className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 sm:w-auto sm:py-2"
          >
            {enviando ? 'Registrando...' : 'Registrar el pago'}
          </button>
        </form>
      )}

      {accion === 'anular' && (
        <form onSubmit={handleAnular} className="mt-3 space-y-3 rounded-lg border border-red-200 bg-red-50/50 p-3">
          {comision.estado === 'PAGADA' && (
            <p className="text-xs text-red-700">Esta comisión ya se pagó: al anularla también se anula el egreso del pago.</p>
          )}
          <div>
            <label htmlFor={`motivo-${comision.id}`} className="block text-sm font-medium text-slate-700">
              Motivo de la anulación
            </label>
            <textarea id={`motivo-${comision.id}`} required minLength={5} maxLength={500} rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={CLASE_INPUT} />
          </div>
          <button
            type="submit"
            disabled={enviando}
            className="w-full rounded-md bg-red-600 px-4 py-3 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 sm:w-auto sm:py-2"
          >
            {enviando ? 'Anulando...' : 'Confirmar la anulación'}
          </button>
        </form>
      )}
    </div>
  )
}
