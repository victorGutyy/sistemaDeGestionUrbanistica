import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { crearEquipo, listarTiposEquipoActivos, obtenerProyecto, type EstadoEquipo, type TipoEquipo } from '../lib/api'
import { ESTADOS_EQUIPO, ETIQUETA_ESTADO_EQUIPO } from '../lib/equipos'

const CLASE_INPUT =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500'

// Registro de un equipo de maquinaria (RF-MAQ-01). La placa o serie no se repite entre equipos.
export function RegistrarEquipoPage() {
  const { id: proyectoId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [nombreProyecto, setNombreProyecto] = useState('')
  const [tipos, setTipos] = useState<TipoEquipo[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const [nombre, setNombre] = useState('')
  const [tipoEquipoId, setTipoEquipoId] = useState('')
  const [marca, setMarca] = useState('')
  const [modelo, setModelo] = useState('')
  const [anio, setAnio] = useState('')
  const [placaSerie, setPlacaSerie] = useState('')
  const [estado, setEstado] = useState<EstadoEquipo>('ACTIVO')

  useEffect(() => {
    if (!proyectoId) return
    Promise.all([obtenerProyecto(proyectoId), listarTiposEquipoActivos()])
      .then(([proyecto, tiposRecibidos]) => {
        setNombreProyecto(proyecto.nombre)
        setTipos(tiposRecibidos)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setCargando(false))
  }, [proyectoId])

  async function guardar(event: FormEvent) {
    event.preventDefault()
    if (!proyectoId) return
    setError(null)
    setEnviando(true)
    try {
      const equipo = await crearEquipo(proyectoId, {
        nombre: nombre.trim(),
        tipoEquipoId,
        marca: marca.trim() || undefined,
        modelo: modelo.trim() || undefined,
        anio: anio ? Number(anio) : undefined,
        placaSerie: placaSerie.trim() || undefined,
        estado,
      })
      navigate(`/equipos/${equipo.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el equipo')
      setEnviando(false)
    }
  }

  if (cargando) return <p className="text-sm text-slate-500">Cargando…</p>

  return (
    <div className="max-w-xl">
      <Link to={`/proyectos/${proyectoId}`} className="text-sm text-blue-600 hover:underline">
        ← {nombreProyecto || 'Proyecto'}
      </Link>
      <h1 className="mt-2 text-lg font-semibold text-slate-900">Nuevo equipo</h1>
      <p className="text-sm text-slate-500">Un equipo de maquinaria del proyecto {nombreProyecto}. No hay límite de equipos.</p>

      {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {tipos.length === 0 && !error && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No hay tipos de equipo activos. El gerente los crea en Configuración, sección "Tipos de equipo".
        </div>
      )}

      <form onSubmit={guardar} className="mt-6 space-y-4">
        <div>
          <label htmlFor="nombre" className="block text-sm font-medium text-slate-700">
            Nombre del equipo
          </label>
          <input id="nombre" required minLength={2} maxLength={120} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Excavadora 320, Volqueta 1" className={CLASE_INPUT} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="tipo" className="block text-sm font-medium text-slate-700">
              Tipo
            </label>
            <select id="tipo" required value={tipoEquipoId} onChange={(e) => setTipoEquipoId(e.target.value)} className={CLASE_INPUT}>
              <option value="">Elige un tipo…</option>
              {tipos.map((tipo) => (
                <option key={tipo.id} value={tipo.id}>
                  {tipo.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="estado" className="block text-sm font-medium text-slate-700">
              Estado
            </label>
            <select id="estado" value={estado} onChange={(e) => setEstado(e.target.value as EstadoEquipo)} className={CLASE_INPUT}>
              {ESTADOS_EQUIPO.map((valor) => (
                <option key={valor} value={valor}>
                  {ETIQUETA_ESTADO_EQUIPO[valor]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="marca" className="block text-sm font-medium text-slate-700">
              Marca (opcional)
            </label>
            <input id="marca" maxLength={60} value={marca} onChange={(e) => setMarca(e.target.value)} className={CLASE_INPUT} />
          </div>
          <div>
            <label htmlFor="modelo" className="block text-sm font-medium text-slate-700">
              Modelo (opcional)
            </label>
            <input id="modelo" maxLength={60} value={modelo} onChange={(e) => setModelo(e.target.value)} className={CLASE_INPUT} />
          </div>
          <div>
            <label htmlFor="anio" className="block text-sm font-medium text-slate-700">
              Año (opcional)
            </label>
            <input id="anio" inputMode="numeric" maxLength={4} value={anio} onChange={(e) => setAnio(e.target.value.replace(/\D/g, ''))} className={CLASE_INPUT} />
          </div>
        </div>

        <div>
          <label htmlFor="placa" className="block text-sm font-medium text-slate-700">
            Placa o serie (opcional)
          </label>
          <input id="placa" maxLength={60} value={placaSerie} onChange={(e) => setPlacaSerie(e.target.value)} className={CLASE_INPUT} />
          <p className="mt-1 text-xs text-slate-500">No se puede repetir entre equipos.</p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="submit"
            disabled={enviando || tipos.length === 0}
            className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 sm:w-auto sm:py-2"
          >
            {enviando ? 'Guardando…' : 'Guardar equipo'}
          </button>
          <Link to={`/proyectos/${proyectoId}`} className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-center text-sm font-medium text-slate-700 hover:bg-slate-50 sm:w-auto sm:py-2">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  )
}
