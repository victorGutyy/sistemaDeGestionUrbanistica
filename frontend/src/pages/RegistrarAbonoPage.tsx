import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { crearAbono, obtenerVenta, type MedioPago, type Venta } from '../lib/api'

export function RegistrarAbonoPage() {
  const { ventaId } = useParams<{ ventaId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const [venta, setVenta] = useState<Venta | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const [cuotaId, setCuotaId] = useState(searchParams.get('cuotaId') ?? '')
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [valor, setValor] = useState('')
  const [medioPago, setMedioPago] = useState<MedioPago>('EFECTIVO')
  const [comprobante, setComprobante] = useState<File | null>(null)

  useEffect(() => {
    if (!ventaId) return
    obtenerVenta(ventaId)
      .then((data) => {
        setVenta(data)
        const cuotaPreseleccionada = data.cuotas.find((c) => c.id === cuotaId)
        if (cuotaPreseleccionada) {
          setValor(cuotaPreseleccionada.valor)
        }
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setCargando(false))
  }, [ventaId, cuotaId])

  function alSeleccionarCuota(id: string) {
    setCuotaId(id)
    const cuota = venta?.cuotas.find((c) => c.id === id)
    if (cuota) {
      setValor(cuota.valor)
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!ventaId) return
    setError(null)
    setEnviando(true)

    try {
      const formData = new FormData()
      formData.append('ventaId', ventaId)
      if (cuotaId) formData.append('cuotaId', cuotaId)
      formData.append('fecha', fecha)
      formData.append('valor', valor)
      formData.append('medioPago', medioPago)
      if (comprobante) formData.append('comprobante', comprobante)

      await crearAbono(formData)
      navigate(`/ventas/${ventaId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el abono')
    } finally {
      setEnviando(false)
    }
  }

  if (cargando) {
    return <p className="text-sm text-slate-500">Cargando venta...</p>
  }

  if (!venta) {
    return <p className="text-sm text-red-600">{error ?? 'No se encontró la venta.'}</p>
  }

  const cuotasSeleccionables = venta.cuotas.filter((c) => c.estado !== 'PAGADA')

  return (
    <div className="max-w-xl">
      <h1 className="text-lg font-semibold text-slate-900">Registrar abono</h1>
      <p className="text-sm text-slate-500">
        Lote {venta.lote.numero} — {venta.cliente.nombre}
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="cuota" className="block text-sm font-medium text-slate-700">
            Cuota (opcional)
          </label>
          <select
            id="cuota"
            value={cuotaId}
            onChange={(event) => alSeleccionarCuota(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Sin asignar a una cuota específica</option>
            {cuotasSeleccionables.map((c) => (
              <option key={c.id} value={c.id}>
                Cuota {c.numero} — vence {c.fechaVencimiento.slice(0, 10)} — ${c.valor} ({c.estado})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="valor" className="block text-sm font-medium text-slate-700">
              Valor
            </label>
            <input
              id="valor"
              required
              inputMode="decimal"
              value={valor}
              onChange={(event) => setValor(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="fecha" className="block text-sm font-medium text-slate-700">
              Fecha
            </label>
            <input
              id="fecha"
              required
              type="date"
              value={fecha}
              onChange={(event) => setFecha(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label htmlFor="medioPago" className="block text-sm font-medium text-slate-700">
            Medio de pago
          </label>
          <select
            id="medioPago"
            value={medioPago}
            onChange={(event) => setMedioPago(event.target.value as MedioPago)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option value="EFECTIVO">Efectivo</option>
            <option value="TRANSFERENCIA">Transferencia</option>
            <option value="CHEQUE">Cheque</option>
            <option value="TARJETA">Tarjeta</option>
          </select>
        </div>

        <div>
          <label htmlFor="comprobante" className="block text-sm font-medium text-slate-700">
            Comprobante (opcional, imagen o PDF)
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
          disabled={enviando}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {enviando ? 'Registrando...' : 'Registrar abono'}
        </button>
      </form>
    </div>
  )
}
