import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { crearPagoNomina, type CrearNovedadPayload, type TipoNovedad } from '../lib/api'

type NovedadFormulario = CrearNovedadPayload & { id: number }

let siguienteId = 1

export function RegistrarPagoNominaPage() {
  const { id: trabajadorId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const [periodoInicio, setPeriodoInicio] = useState('')
  const [periodoFin, setPeriodoFin] = useState('')
  const [fechaPago, setFechaPago] = useState(() => new Date().toISOString().slice(0, 10))
  const [novedades, setNovedades] = useState<NovedadFormulario[]>([])

  function agregarNovedad() {
    setNovedades((actual) => [...actual, { id: siguienteId++, tipo: 'HORAS_EXTRA', valor: '', descripcion: '' }])
  }

  function actualizarNovedad(id: number, cambios: Partial<NovedadFormulario>) {
    setNovedades((actual) => actual.map((novedad) => (novedad.id === id ? { ...novedad, ...cambios } : novedad)))
  }

  function quitarNovedad(id: number) {
    setNovedades((actual) => actual.filter((novedad) => novedad.id !== id))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!trabajadorId) return
    setError(null)
    setEnviando(true)

    try {
      await crearPagoNomina({
        trabajadorId,
        periodoInicio,
        periodoFin,
        fechaPago,
        novedades: novedades.map(({ tipo, valor, descripcion }) => ({
          tipo,
          valor,
          descripcion: descripcion || undefined,
        })),
      })
      navigate(`/trabajadores/${trabajadorId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el pago')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-lg font-semibold text-slate-900">Registrar pago de nómina</h1>
      <p className="text-sm text-slate-500">El salario base se toma del trabajador en este momento.</p>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="periodoInicio" className="block text-sm font-medium text-slate-700">
              Período desde
            </label>
            <input
              id="periodoInicio"
              required
              type="date"
              value={periodoInicio}
              onChange={(event) => setPeriodoInicio(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="periodoFin" className="block text-sm font-medium text-slate-700">
              Período hasta
            </label>
            <input
              id="periodoFin"
              required
              type="date"
              value={periodoFin}
              onChange={(event) => setPeriodoFin(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="fechaPago" className="block text-sm font-medium text-slate-700">
              Fecha de pago
            </label>
            <input
              id="fechaPago"
              required
              type="date"
              value={fechaPago}
              onChange={(event) => setFechaPago(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <span className="block text-sm font-medium text-slate-700">Novedades (opcional)</span>
            <button type="button" onClick={agregarNovedad} className="text-sm font-medium text-blue-600 hover:underline">
              + Agregar novedad
            </button>
          </div>

          <div className="mt-2 space-y-2">
            {novedades.map((novedad) => (
              <div key={novedad.id} className="flex items-center gap-2">
                <select
                  value={novedad.tipo}
                  onChange={(event) => actualizarNovedad(novedad.id, { tipo: event.target.value as TipoNovedad })}
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="HORAS_EXTRA">Horas extra</option>
                  <option value="DESCUENTO">Descuento</option>
                  <option value="INCAPACIDAD">Incapacidad</option>
                </select>
                <input
                  required
                  inputMode="decimal"
                  placeholder="Valor"
                  value={novedad.valor}
                  onChange={(event) => actualizarNovedad(novedad.id, { valor: event.target.value })}
                  className="w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <input
                  placeholder="Descripción (opcional)"
                  value={novedad.descripcion}
                  onChange={(event) => actualizarNovedad(novedad.id, { descripcion: event.target.value })}
                  className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => quitarNovedad(novedad.id)}
                  className="text-sm text-red-600 hover:underline"
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={enviando}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {enviando ? 'Registrando...' : 'Registrar pago'}
        </button>
      </form>
    </div>
  )
}
