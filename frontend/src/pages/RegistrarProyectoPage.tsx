import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { crearProyecto, type TipoProyecto } from '../lib/api'
import { ETIQUETA_TIPO_PROYECTO } from '../lib/estadoLote'

export function RegistrarProyectoPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<TipoProyecto>('LOTES')
  const [ubicacion, setUbicacion] = useState('')
  const [municipio, setMunicipio] = useState('')
  const [areaTotal, setAreaTotal] = useState('')
  const [valorCompra, setValorCompra] = useState('')
  const [fechaCompra, setFechaCompra] = useState('')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setEnviando(true)

    try {
      const proyecto = await crearProyecto({
        nombre,
        tipo,
        ubicacion: ubicacion || undefined,
        municipio: municipio.trim() || undefined,
        areaTotal,
        valorCompra: valorCompra || undefined,
        fechaCompra: fechaCompra || undefined,
      })
      navigate(`/proyectos/${proyecto.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el proyecto')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-lg font-semibold text-slate-900">Nuevo proyecto</h1>
      <p className="text-sm text-slate-500">Un predio para subdividir y vender en lotes, o un proyecto de remodelación o de maquinaria.</p>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="nombre" className="block text-sm font-medium text-slate-700">
            Nombre del proyecto
          </label>
          <input
            id="nombre"
            required
            minLength={3}
            value={nombre}
            onChange={(event) => setNombre(event.target.value)}
            placeholder="Ej. Urbanización El Roble"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="tipo" className="block text-sm font-medium text-slate-700">
            Tipo de proyecto
          </label>
          <select
            id="tipo"
            value={tipo}
            onChange={(event) => setTipo(event.target.value as TipoProyecto)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            {(Object.keys(ETIQUETA_TIPO_PROYECTO) as TipoProyecto[]).map((valor) => (
              <option key={valor} value={valor}>
                {ETIQUETA_TIPO_PROYECTO[valor]}
              </option>
            ))}
          </select>
          {tipo !== 'LOTES' && (
            <p className="mt-1 text-xs text-slate-500">
              Este tipo de proyecto no tiene manzanas ni lotes: se maneja con sus propios ingresos y egresos.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="ubicacion" className="block text-sm font-medium text-slate-700">
            Ubicación (opcional)
          </label>
          <input
            id="ubicacion"
            value={ubicacion}
            onChange={(event) => setUbicacion(event.target.value)}
            placeholder="Ej. Calarcá, Quindío"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="municipio" className="block text-sm font-medium text-slate-700">
            Municipio (opcional)
          </label>
          <input
            id="municipio"
            value={municipio}
            onChange={(event) => setMunicipio(event.target.value)}
            placeholder="Ej. Calarcá"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="areaTotal" className="block text-sm font-medium text-slate-700">
              Área total (m²)
            </label>
            <input
              id="areaTotal"
              required
              inputMode="decimal"
              value={areaTotal}
              onChange={(event) => setAreaTotal(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="valorCompra" className="block text-sm font-medium text-slate-700">
              Valor de compra (opcional)
            </label>
            <input
              id="valorCompra"
              inputMode="decimal"
              value={valorCompra}
              onChange={(event) => setValorCompra(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label htmlFor="fechaCompra" className="block text-sm font-medium text-slate-700">
            Fecha de compra (opcional)
          </label>
          <input
            id="fechaCompra"
            type="date"
            value={fechaCompra}
            onChange={(event) => setFechaCompra(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={enviando}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {enviando ? 'Guardando...' : 'Registrar proyecto'}
        </button>
      </form>
    </div>
  )
}
