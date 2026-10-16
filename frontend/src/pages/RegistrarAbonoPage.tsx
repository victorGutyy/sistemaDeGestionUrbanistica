import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CuentaYReferencia } from '../components/CuentaYReferencia'
import {
  abrirRecibo,
  crearAbono,
  listarCuentasActivas,
  listarMediosPago,
  obtenerVenta,
  type AbonoRegistrado,
  type CuentaBancaria,
  type MedioPago,
  type MedioPagoConfig,
  type Venta,
} from '../lib/api'
import { formatearCOP, hoyEnBogota } from '../lib/formato'
import { etiquetaCuota } from '../lib/ventas'

const CLASE_INPUT =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500'

interface ParteVista {
  numero: number
  valor: number
  completa: boolean
}

// Vista previa de cómo se repartirá el abono: igual que el servidor, por fecha de vencimiento y luego por número.
// El servidor repite y valida el reparto; esto solo le muestra a quien registra qué va a pasar.
function repartirEnPantalla(venta: Venta, valor: number): { partes: ParteVista[]; sobrante: number } {
  let restante = valor
  const partes: ParteVista[] = []
  const cuotas = [...venta.cuotas].sort(
    (a, b) => new Date(a.fechaVencimiento).getTime() - new Date(b.fechaVencimiento).getTime() || a.numero - b.numero,
  )
  for (const cuota of cuotas) {
    if (restante <= 0) break
    const saldo = Number(cuota.valor) - Number(cuota.pagado ?? 0)
    if (saldo <= 0) continue
    const aplicado = Math.min(restante, saldo)
    partes.push({ numero: cuota.numero, valor: aplicado, completa: aplicado >= saldo })
    restante -= aplicado
  }
  return { partes, sobrante: restante }
}

export function RegistrarAbonoPage() {
  const { ventaId } = useParams<{ ventaId: string }>()
  const navigate = useNavigate()

  const [venta, setVenta] = useState<Venta | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [registrado, setRegistrado] = useState<AbonoRegistrado | null>(null)
  const [abonoId, setAbonoId] = useState<string | null>(null)

  const [fecha, setFecha] = useState(() => hoyEnBogota())
  const [valor, setValor] = useState('')
  const [mediosPago, setMediosPago] = useState<MedioPagoConfig[]>([])
  const [medioPago, setMedioPago] = useState<MedioPago | ''>('')
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([])
  const [cuentaId, setCuentaId] = useState('')
  const [referencia, setReferencia] = useState('')
  const [comprobante, setComprobante] = useState<File | null>(null)

  useEffect(() => {
    if (!ventaId) return
    Promise.all([obtenerVenta(ventaId), listarMediosPago(), listarCuentasActivas().catch(() => [] as CuentaBancaria[])])
      .then(([data, medios, cuentasActivas]) => {
        // Solo los medios que el gerente tiene habilitados.
        const activos = medios.filter((m) => m.activo)
        setMediosPago(activos)
        setMedioPago((actual) => actual || (activos[0]?.medio ?? ''))
        setCuentas(cuentasActivas)
        setVenta(data)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setCargando(false))
  }, [ventaId])

  const valorNumero = Number(valor) || 0
  const saldo = venta?.estadoCuenta ? Number(venta.estadoCuenta.saldoPendiente) : 0
  const reparto = useMemo(() => (venta && valorNumero > 0 ? repartirEnPantalla(venta, valorNumero) : null), [venta, valorNumero])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!ventaId) return
    setError(null)
    setEnviando(true)

    try {
      if (!medioPago) throw new Error('No hay medios de pago habilitados')
      if (reparto && reparto.sobrante > 0) throw new Error(`El abono supera el saldo pendiente (${formatearCOP(saldo)})`)

      const formData = new FormData()
      formData.append('ventaId', ventaId)
      formData.append('fecha', fecha)
      formData.append('valor', valor)
      formData.append('medioPago', medioPago)
      if (medioPago !== 'EFECTIVO' && cuentaId) formData.append('cuentaDestinoId', cuentaId)
      if (referencia.trim()) formData.append('referencia', referencia.trim())
      if (comprobante) formData.append('comprobante', comprobante)

      const resultado = await crearAbono(formData)
      setRegistrado(resultado)
      setAbonoId(resultado.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el abono')
    } finally {
      setEnviando(false)
    }
  }

  async function handleVerRecibo() {
    if (!abonoId) return
    setError(null)
    try {
      await abrirRecibo(abonoId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir el recibo')
    }
  }

  function registrarOtro() {
    setRegistrado(null)
    setAbonoId(null)
    setValor('')
    setReferencia('')
    setComprobante(null)
    setError(null)
    // El saldo y las cuotas cambiaron: se vuelve a pedir la venta.
    if (ventaId) obtenerVenta(ventaId).then(setVenta).catch((err: Error) => setError(err.message))
  }

  if (cargando) {
    return <p className="text-sm text-slate-500">Cargando venta...</p>
  }

  if (!venta) {
    return <p className="text-sm text-red-600">{error ?? 'No se encontró la venta.'}</p>
  }

  if (registrado) {
    return (
      <div className="max-w-xl">
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-medium text-green-800">Abono registrado</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">Recibo {registrado.recibo.numeroTexto}</p>
          <p className="mt-1 text-sm text-slate-700">
            {formatearCOP(registrado.valor)} · Lote {venta.lote.numero} — {venta.cliente.nombre}
          </p>
          <ul className="mt-3 space-y-1 text-sm text-slate-700">
            {registrado.cuotasCubiertas.map((parte) => (
              <li key={parte.numero}>
                {etiquetaCuota(parte.numero)}: {formatearCOP(parte.valor)} {parte.completa ? '(queda pagada)' : '(pago parcial)'}
              </li>
            ))}
          </ul>
        </div>

        {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleVerRecibo()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Ver recibo (PDF)
          </button>
          <button
            type="button"
            onClick={registrarOtro}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Registrar otro abono
          </button>
          <button
            type="button"
            onClick={() => navigate(`/ventas/${venta.id}`)}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Ver la venta
          </button>
        </div>
      </div>
    )
  }

  if (venta.estado !== 'ACTIVA') {
    return (
      <div className="max-w-xl">
        <p className="text-sm text-slate-700">Solo se pueden registrar abonos en una venta activa.</p>
        <Link to={`/ventas/${venta.id}`} className="text-sm font-medium text-blue-600 hover:underline">
          Volver a la venta
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-lg font-semibold text-slate-900">Registrar abono</h1>
      <p className="text-sm text-slate-500">
        Lote {venta.lote.numero} — {venta.cliente.nombre}
      </p>
      <p className="mt-1 text-sm text-slate-700">
        Saldo pendiente: <span className="font-semibold">{formatearCOP(saldo)}</span>
      </p>

      {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="valor" className="block text-sm font-medium text-slate-700">
              Valor recibido (pesos)
            </label>
            <input
              id="valor"
              required
              inputMode="numeric"
              value={valor}
              onChange={(event) => setValor(event.target.value.replace(/\D/g, '').replace(/^0+/, ''))}
              className={CLASE_INPUT}
            />
            {valorNumero > 0 && <p className="mt-1 text-xs text-slate-500">{formatearCOP(valorNumero)}</p>}
          </div>
          <div>
            <label htmlFor="fecha" className="block text-sm font-medium text-slate-700">
              Fecha del pago
            </label>
            <input id="fecha" required type="date" max={hoyEnBogota()} value={fecha} onChange={(event) => setFecha(event.target.value)} className={CLASE_INPUT} />
          </div>
        </div>

        {reparto && (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <p className="font-medium">Se aplicará así (por orden de vencimiento):</p>
            <ul className="mt-1 space-y-0.5">
              {reparto.partes.map((parte) => (
                <li key={parte.numero}>
                  {etiquetaCuota(parte.numero)}: {formatearCOP(parte.valor)} {parte.completa ? '(queda pagada)' : '(pago parcial)'}
                </li>
              ))}
            </ul>
            {reparto.sobrante > 0 && (
              <p className="mt-1 text-red-700">Sobran {formatearCOP(reparto.sobrante)}: el abono supera el saldo y no se puede registrar.</p>
            )}
          </div>
        )}

        <div>
          <label htmlFor="medioPago" className="block text-sm font-medium text-slate-700">
            Medio de pago
          </label>
          <select id="medioPago" value={medioPago} onChange={(event) => setMedioPago(event.target.value as MedioPago)} className={CLASE_INPUT}>
            {mediosPago.map((m) => (
              <option key={m.medio} value={m.medio}>
                {m.etiqueta}
              </option>
            ))}
          </select>
        </div>

        <CuentaYReferencia
          medioPago={medioPago}
          cuentas={cuentas}
          cuentaId={cuentaId}
          onCuentaChange={setCuentaId}
          referencia={referencia}
          onReferenciaChange={setReferencia}
        />

        <div>
          <label htmlFor="comprobante" className="block text-sm font-medium text-slate-700">
            Soporte del pago (opcional, imagen o PDF)
          </label>
          <input
            id="comprobante"
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            onChange={(event) => setComprobante(event.target.files?.[0] ?? null)}
            className="mt-1 w-full text-sm text-slate-700"
          />
        </div>

        <button
          type="submit"
          disabled={enviando || valorNumero <= 0 || Boolean(reparto && reparto.sobrante > 0)}
          className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 sm:w-auto sm:py-2"
        >
          {enviando ? 'Registrando...' : 'Registrar abono y emitir recibo'}
        </button>
      </form>
    </div>
  )
}
