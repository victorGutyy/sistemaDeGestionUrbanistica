import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { crearLote, ErrorApi, obtenerProyecto, type ProyectoConLotes } from '../lib/api'
import { formatearArea } from '../lib/area'

const CLASE_INPUT =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500'

export function RegistrarLotePage() {
  const { id: proyectoId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [proyecto, setProyecto] = useState<ProyectoConLotes | null>(null)

  const [manzanaId, setManzanaId] = useState('')
  const [numero, setNumero] = useState('')
  const [area, setArea] = useState('')
  const [linderos, setLinderos] = useState('')
  const [valorPorM2, setValorPorM2] = useState('')
  const [valorVenta, setValorVenta] = useState('')

  useEffect(() => {
    if (!proyectoId) return
    obtenerProyecto(proyectoId)
      .then(setProyecto)
      .catch((err: Error) => setError(err.message))
  }, [proyectoId])

  const areaDisponibleActual = proyecto ? Number(proyecto.resumenAreas.areaDisponible) : null
  const areaDisponibleDespues = areaDisponibleActual !== null ? areaDisponibleActual - (Number(area) || 0) : null

  // Si se escribe el valor por m² y el área, se sugiere el precio (el precio de venta sigue siendo lo que manda).
  function alCambiarValorPorM2(valor: string) {
    setValorPorM2(valor)
    const calculado = Number(valor) * Number(area)
    if (valor && area && Number.isFinite(calculado)) setValorVenta(String(Math.round(calculado)))
  }

  async function enviar(confirmarExcesoArea: boolean) {
    if (!proyectoId) return
    await crearLote({
      proyectoId,
      manzanaId: manzanaId || undefined,
      numero,
      area,
      linderos: linderos.trim() || undefined,
      valorPorM2: valorPorM2 || undefined,
      valorVenta,
      confirmarExcesoArea: confirmarExcesoArea || undefined,
    })
    navigate(`/proyectos/${proyectoId}`)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setEnviando(true)

    try {
      try {
        await enviar(false)
      } catch (err) {
        // El servidor avisa cuando el lote supera el área disponible; si la persona confirma, se crea igual.
        if (err instanceof ErrorApi && err.codigo === 'AREA_EXCEDIDA' && window.confirm(`${err.message}`)) {
          await enviar(true)
        } else {
          throw err
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el lote')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-lg font-semibold text-slate-900">Nuevo lote</h1>
      <p className="text-sm text-slate-500">
        {proyecto ? `De "${proyecto.nombre}"` : 'Una subdivisión de este proyecto'}, lista para vender.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {areaDisponibleActual !== null && (
        <div
          className={`mt-4 rounded-md border px-4 py-3 text-sm ${
            areaDisponibleDespues !== null && areaDisponibleDespues < 0
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-blue-200 bg-blue-50 text-blue-700'
          }`}
        >
          Área disponible antes de este lote: <strong>{formatearArea(areaDisponibleActual)} m²</strong>
          {area && (
            <>
              {' '}
              · Quedaría después: <strong>{formatearArea(areaDisponibleDespues ?? 0)} m²</strong>
              {areaDisponibleDespues !== null && areaDisponibleDespues < 0 && ' — supera el área disponible'}
            </>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {proyecto && proyecto.manzanas.length > 0 && (
          <div>
            <label htmlFor="manzana" className="block text-sm font-medium text-slate-700">
              Manzana
            </label>
            <select id="manzana" value={manzanaId} onChange={(event) => setManzanaId(event.target.value)} className={CLASE_INPUT}>
              <option value="">Sin manzana</option>
              {proyecto.manzanas.map((manzana) => (
                <option key={manzana.id} value={manzana.id}>
                  Manzana {manzana.nombre}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="numero" className="block text-sm font-medium text-slate-700">
            Número del lote
          </label>
          <input
            id="numero"
            required
            maxLength={40}
            value={numero}
            onChange={(event) => setNumero(event.target.value)}
            placeholder="Ej. L-1"
            className={CLASE_INPUT}
          />
          <p className="mt-1 text-xs text-slate-400">No se puede repetir dentro de la misma manzana (o del proyecto, si no hay manzanas).</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="area" className="block text-sm font-medium text-slate-700">
              Área (m²)
            </label>
            <input id="area" required inputMode="decimal" value={area} onChange={(event) => setArea(event.target.value)} className={CLASE_INPUT} />
          </div>
          <div>
            <label htmlFor="valorPorM2" className="block text-sm font-medium text-slate-700">
              Valor por m² (opcional)
            </label>
            <input
              id="valorPorM2"
              inputMode="decimal"
              value={valorPorM2}
              onChange={(event) => alCambiarValorPorM2(event.target.value)}
              className={CLASE_INPUT}
            />
          </div>
          <div>
            <label htmlFor="valorVenta" className="block text-sm font-medium text-slate-700">
              Precio de venta
            </label>
            <input
              id="valorVenta"
              required
              inputMode="decimal"
              value={valorVenta}
              onChange={(event) => setValorVenta(event.target.value)}
              className={CLASE_INPUT}
            />
          </div>
        </div>

        <div>
          <label htmlFor="linderos" className="block text-sm font-medium text-slate-700">
            Medidas y linderos (opcional)
          </label>
          <textarea
            id="linderos"
            rows={3}
            maxLength={2000}
            value={linderos}
            onChange={(event) => setLinderos(event.target.value)}
            placeholder="Ej. Norte: vía principal, 20 m. Sur: lote 2, 20 m…"
            className={CLASE_INPUT}
          />
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
