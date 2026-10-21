import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { LogoEmpresa } from '../components/LogoEmpresa'
import { useAuth } from '../contexts/AuthContext'
import { useEmpresa } from '../contexts/EmpresaContext'

export function LoginPage() {
  const { usuario, login, avisoSesion } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { marca } = useEmpresa()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  // Mensaje que deja otra pantalla al volver aquí (por ejemplo, "Contraseña cambiada").
  const aviso = (location.state as { aviso?: string } | null)?.aviso

  if (usuario) {
    const destino = (location.state as { from?: string } | null)?.from ?? '/'
    return <Navigate to={destino} replace />
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setEnviando(true)

    try {
      await login(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <LogoEmpresa grande />
        <h1 className="mt-4 text-center text-lg font-semibold text-slate-900">{marca.nombreComercial || marca.nombreProducto}</h1>
        {marca.nombreComercial && <p className="text-center text-xs text-slate-400">{marca.nombreProducto}</p>}
        <p className="mt-1 text-center text-sm text-slate-500">Ingresa con tu cuenta para continuar.</p>

        {aviso && !error && (
          <div className="mt-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{aviso}</div>
        )}

        {avisoSesion && !error && !aviso && (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {avisoSesion}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              Correo
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>

          <button
            type="submit"
            disabled={enviando}
            className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {enviando ? 'Ingresando...' : 'Ingresar'}
          </button>
          <Link to="/recuperar" className="block text-center text-sm font-medium text-blue-600 hover:underline">
            ¿Olvidaste tu contraseña?
          </Link>
        </form>
      </div>
    </div>
  )
}
