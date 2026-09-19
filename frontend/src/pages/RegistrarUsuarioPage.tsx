import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { crearUsuario, type Rol } from '../lib/api'

export function RegistrarUsuarioPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rol, setRol] = useState<Rol>('ADMINISTRADOR')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setEnviando(true)

    try {
      await crearUsuario({ nombre, email, password, rol })
      navigate('/usuarios')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el usuario')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-lg font-semibold text-slate-900">Nuevo usuario</h1>
      <p className="text-sm text-slate-500">Crea una cuenta de acceso y define su rol.</p>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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
          <label htmlFor="email" className="block text-sm font-medium text-slate-700">
            Correo
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-slate-400">Mínimo 8 caracteres. Compártela con la persona por un medio seguro.</p>
        </div>

        <div>
          <label htmlFor="rol" className="block text-sm font-medium text-slate-700">
            Rol
          </label>
          <select
            id="rol"
            value={rol}
            onChange={(event) => setRol(event.target.value as Rol)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option value="ADMINISTRADOR">Administrador — acceso operativo completo</option>
            <option value="CONSULTA">Consulta — solo lectura, sin crear ni editar</option>
            <option value="PROPIETARIO">Propietario — acceso total, incluida gestión de usuarios</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={enviando}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {enviando ? 'Guardando...' : 'Crear usuario'}
        </button>
      </form>
    </div>
  )
}
