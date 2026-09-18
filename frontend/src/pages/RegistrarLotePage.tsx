import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { crearLote } from '../lib/api'

export function RegistrarLotePage() {
  const { id: proyectoId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const [numero, setNumero] = useState('')
  const [area, setArea] = useState('')
  const [valorVenta, setValorVenta] = useState('')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!proyectoId) return
    setError(null)
    setEnviando(true)

    try {
      await crearLote({ proyectoId, numero, area, valorVenta })
      navigate(`/proyectos/${proyectoId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el lote')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-lg font-semibold text-slate-900">Nuevo lote</h1>
      <p className="text-sm text-slate-500">Una subdivisión de este proyecto, lista para vender.</p>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="numero" className="block text-sm font-medium text-slate-700">
            Número del lote
          </label>
          <input
            id="numero"
            required
            value={numero}
            onChange={(event) => setNumero(event.target.value)}
            placeholder="Ej. L-1"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="area" className="block text-sm font-medium text-slate-700">
              Área (m²)
            </label>
            <input
              id="area"
              required
              inputMode="decimal"
              value={area}
              onChange={(event) => setArea(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="valorVenta" className="block text-sm font-medium text-slate-700">
              Valor de venta
            </label>
            <input
              id="valorVenta"
              required
              inputMode="decimal"
              value={valorVenta}
              onChange={(event) => setValorVenta(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={enviando}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {enviando ? 'Guardando...' : 'Registrar lote'}
        </button>
      </form>
    </div>
  )
}
