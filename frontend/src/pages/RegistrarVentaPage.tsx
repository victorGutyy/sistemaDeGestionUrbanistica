import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  crearVenta,
  listarClientes,
  listarLotesDisponibles,
  type Cliente,
  type FormaPago,
  type Lote,
} from '../lib/api'

type OrigenCliente = 'existente' | 'nuevo'

export function RegistrarVentaPage() {
  const navigate = useNavigate()

  const [lotes, setLotes] = useState<Lote[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const [loteId, setLoteId] = useState('')
  const [origenCliente, setOrigenCliente] = useState<OrigenCliente>('existente')
  const [clienteId, setClienteId] = useState('')
  const [clienteNombre, setClienteNombre] = useState('')
  const [clienteDocumento, setClienteDocumento] = useState('')
  const [formaPago, setFormaPago] = useState<FormaPago>('CONTADO')
  const [valorTotal, setValorTotal] = useState('')
  const [cuotaInicial, setCuotaInicial] = useState('')
  const [numeroCuotas, setNumeroCuotas] = useState('')
  const [tasaInteres, setTasaInteres] = useState('')
  const [fechaVenta, setFechaVenta] = useState(() => new Date().toISOString().slice(0, 10))

  useEffect(() => {
    Promise.all([listarLotesDisponibles(), listarClientes()])
      .then(([lotesRecibidos, clientesRecibidos]) => {
        setLotes(lotesRecibidos)
        setClientes(clientesRecibidos)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setCargando(false))
  }, [])

  function alSeleccionarLote(id: string) {
    setLoteId(id)
    const lote = lotes.find((l) => l.id === id)
    if (lote) {
      setValorTotal(lote.valorVenta)
      if (formaPago === 'CONTADO') {
        setCuotaInicial(lote.valorVenta)
      }
    }
  }

  function alCambiarFormaPago(nuevaFormaPago: FormaPago) {
    setFormaPago(nuevaFormaPago)
    if (nuevaFormaPago === 'CONTADO') {
      setCuotaInicial(valorTotal)
      setNumeroCuotas('')
      setTasaInteres('')
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setEnviando(true)

    try {
      const venta = await crearVenta({
        loteId,
        ...(origenCliente === 'existente'
          ? { clienteId }
          : { clienteNuevo: { nombre: clienteNombre, documento: clienteDocumento } }),
        formaPago,
        valorTotal,
        cuotaInicial,
        numeroCuotas: formaPago === 'FINANCIADO' ? Number(numeroCuotas) : undefined,
        tasaInteres: formaPago === 'FINANCIADO' && tasaInteres ? tasaInteres : undefined,
        fechaVenta,
      })

      navigate('/ventas/' + venta.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la venta')
    } finally {
      setEnviando(false)
    }
  }

  if (cargando) {
    return <p className="text-sm text-slate-500">Cargando lotes y clientes...</p>
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-semibold text-slate-900">Registrar venta</h1>
      <p className="text-sm text-slate-500">Elige un lote disponible y las condiciones de pago.</p>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <div>
          <label htmlFor="lote" className="block text-sm font-medium text-slate-700">
            Lote
          </label>
          <select
            id="lote"
            required
            value={loteId}
            onChange={(event) => alSeleccionarLote(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option value="" disabled>
              Selecciona un lote disponible
            </option>
            {lotes.map((lote) => (
              <option key={lote.id} value={lote.id}>
                {lote.proyecto.nombre} — Lote {lote.numero} ({lote.area} m², ${lote.valorVenta})
              </option>
            ))}
          </select>
          {lotes.length === 0 && (
            <p className="mt-1 text-xs text-amber-600">No hay lotes disponibles para vender.</p>
          )}
        </div>

        <div>
          <span className="block text-sm font-medium text-slate-700">Comprador</span>
          <div className="mt-1 flex gap-4 text-sm text-slate-600">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={origenCliente === 'existente'}
                onChange={() => setOrigenCliente('existente')}
              />
              Cliente existente
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={origenCliente === 'nuevo'}
                onChange={() => setOrigenCliente('nuevo')}
              />
              Cliente nuevo
            </label>
          </div>

          {origenCliente === 'existente' ? (
            <select
              required
              value={clienteId}
              onChange={(event) => setClienteId(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="" disabled>
                Selecciona un cliente
              </option>
              {clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nombre} — {cliente.documento}
                </option>
              ))}
            </select>
          ) : (
            <div className="mt-2 grid grid-cols-2 gap-3">
              <input
                required
                placeholder="Nombre completo"
                value={clienteNombre}
                onChange={(event) => setClienteNombre(event.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <input
                required
                placeholder="Documento"
                value={clienteDocumento}
                onChange={(event) => setClienteDocumento(event.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          )}
        </div>

        <div>
          <span className="block text-sm font-medium text-slate-700">Forma de pago</span>
          <div className="mt-1 flex gap-4 text-sm text-slate-600">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={formaPago === 'CONTADO'}
                onChange={() => alCambiarFormaPago('CONTADO')}
              />
              Contado
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={formaPago === 'FINANCIADO'}
                onChange={() => alCambiarFormaPago('FINANCIADO')}
              />
              Financiado
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="valorTotal" className="block text-sm font-medium text-slate-700">
              Valor total
            </label>
            <input
              id="valorTotal"
              required
              inputMode="decimal"
              value={valorTotal}
              onChange={(event) => setValorTotal(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="cuotaInicial" className="block text-sm font-medium text-slate-700">
              Cuota inicial
            </label>
            <input
              id="cuotaInicial"
              required
              inputMode="decimal"
              disabled={formaPago === 'CONTADO'}
              value={cuotaInicial}
              onChange={(event) => setCuotaInicial(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100"
            />
          </div>
        </div>

        {formaPago === 'FINANCIADO' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="numeroCuotas" className="block text-sm font-medium text-slate-700">
                Número de cuotas
              </label>
              <input
                id="numeroCuotas"
                required
                type="number"
                min={1}
                value={numeroCuotas}
                onChange={(event) => setNumeroCuotas(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="tasaInteres" className="block text-sm font-medium text-slate-700">
                Tasa de interés mensual (%)
              </label>
              <input
                id="tasaInteres"
                inputMode="decimal"
                placeholder="Opcional"
                value={tasaInteres}
                onChange={(event) => setTasaInteres(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        <div>
          <label htmlFor="fechaVenta" className="block text-sm font-medium text-slate-700">
            Fecha de venta
          </label>
          <input
            id="fechaVenta"
            required
            type="date"
            value={fechaVenta}
            onChange={(event) => setFechaVenta(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={enviando || lotes.length === 0}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {enviando ? 'Registrando...' : 'Registrar venta'}
        </button>
      </form>
    </div>
  )
}
