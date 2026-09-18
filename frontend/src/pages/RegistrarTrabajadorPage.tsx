import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { crearTrabajador } from '../lib/api'

export function RegistrarTrabajadorPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const [nombre, setNombre] = useState('')
  const [documento, setDocumento] = useState('')
  const [cargo, setCargo] = useState('')
  const [salarioBase, setSalarioBase] = useState('')
  const [fechaIngreso, setFechaIngreso] = useState(() => new Date().toISOString().slice(0, 10))
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setEnviando(true)

    try {
      const trabajador = await crearTrabajador({
        nombre,
        documento,
        cargo,
        salarioBase,
        fechaIngreso,
        telefono: telefono || undefined,
        email: email || undefined,
      })
      navigate(`/trabajadores/${trabajador.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el trabajador')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-lg font-semibold text-slate-900">Nuevo trabajador</h1>
      <p className="text-sm text-slate-500">Datos básicos y salario base.</p>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="nombre" className="block text-sm font-medium text-slate-700">
              Nombre completo
            </label>
            <input
              id="nombre"
              required
              minLength={3}
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="documento" className="block text-sm font-medium text-slate-700">
              Documento
            </label>
            <input
              id="documento"
              required
              minLength={3}
              value={documento}
              onChange={(event) => setDocumento(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label htmlFor="cargo" className="block text-sm font-medium text-slate-700">
            Cargo
          </label>
          <input
            id="cargo"
            required
            minLength={2}
            value={cargo}
            onChange={(event) => setCargo(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="salarioBase" className="block text-sm font-medium text-slate-700">
              Salario base
            </label>
            <input
              id="salarioBase"
              required
              inputMode="decimal"
              value={salarioBase}
              onChange={(event) => setSalarioBase(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="fechaIngreso" className="block text-sm font-medium text-slate-700">
              Fecha de ingreso
            </label>
            <input
              id="fechaIngreso"
              required
              type="date"
              value={fechaIngreso}
              onChange={(event) => setFechaIngreso(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="telefono" className="block text-sm font-medium text-slate-700">
              Teléfono (opcional)
            </label>
            <input
              id="telefono"
              value={telefono}
              onChange={(event) => setTelefono(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              Correo (opcional)
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={enviando}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {enviando ? 'Guardando...' : 'Registrar trabajador'}
        </button>
      </form>
    </div>
  )
}
