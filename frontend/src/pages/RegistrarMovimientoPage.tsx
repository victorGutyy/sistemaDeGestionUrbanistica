import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { crearMovimiento, listarProyectos, type Proyecto, type TipoMovimiento } from '../lib/api'

export function RegistrarMovimientoPage() {
  const navigate = useNavigate()

  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const [tipo, setTipo] = useState<TipoMovimiento>('GASTO')
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [valor, setValor] = useState('')
  const [concepto, setConcepto] = useState('')
  const [proyectoId, setProyectoId] = useState('')

  useEffect(() => {
    listarProyectos()
      .then(setProyectos)
      .catch((err: Error) => setError(err.message))
  }, [])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setEnviando(true)

    try {
      await crearMovimiento({
        tipo,
        fecha,
        valor,
        concepto,
        proyectoId: proyectoId || undefined,
      })
      navigate('/contabilidad')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el movimiento')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-lg font-semibold text-slate-900">Registrar movimiento</h1>
      <p className="text-sm text-slate-500">Un gasto o ingreso de la empresa, ligado a un proyecto o general.</p>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <span className="block text-sm font-medium text-slate-700">Tipo</span>
          <div className="mt-1 flex gap-4 text-sm text-slate-600">
            <label className="flex items-center gap-1">
              <input type="radio" checked={tipo === 'GASTO'} onChange={() => setTipo('GASTO')} />
              Gasto
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={tipo === 'INGRESO'} onChange={() => setTipo('INGRESO')} />
              Ingreso
            </label>
          </div>
        </div>

        <div>
          <label htmlFor="concepto" className="block text-sm font-medium text-slate-700">
            Concepto
          </label>
          <input
            id="concepto"
            required
            minLength={3}
            value={concepto}
            onChange={(event) => setConcepto(event.target.value)}
            placeholder="Ej. Arriendo de oficina, adecuación de vías..."
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
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
          <label htmlFor="proyecto" className="block text-sm font-medium text-slate-700">
            Proyecto (opcional)
          </label>
          <select
            id="proyecto"
            value={proyectoId}
            onChange={(event) => setProyectoId(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option value="">General de la empresa (sin proyecto)</option>
            {proyectos.map((proyecto) => (
              <option key={proyecto.id} value={proyecto.id}>
                {proyecto.nombre}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={enviando}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {enviando ? 'Registrando...' : 'Registrar movimiento'}
        </button>
      </form>
    </div>
  )
}
