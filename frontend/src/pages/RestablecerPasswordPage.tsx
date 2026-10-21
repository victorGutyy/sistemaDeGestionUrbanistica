import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { TarjetaAcceso } from '../components/TarjetaAcceso'
import { useAuth } from '../contexts/AuthContext'
import { restablecerConEnlace } from '../lib/api'

const CLASE_INPUT =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500'

// Mismo formato que valida el servidor: 32 bytes en base64url son 43 caracteres.
const FORMATO_TOKEN = /^[A-Za-z0-9_-]{43}$/
const MINIMO = 8
const MAXIMO = 72

// Elige la contraseña nueva con el enlace que llegó por correo (RF-USR-06). El enlace sirve una sola vez.
export function RestablecerPasswordPage() {
  const [parametros] = useSearchParams()
  const token = parametros.get('token') ?? ''
  const { usuario, logout } = useAuth()
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [verClave, setVerClave] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enlaceMalo, setEnlaceMalo] = useState(false)

  if (!FORMATO_TOKEN.test(token) || enlaceMalo) {
    return (
      <TarjetaAcceso titulo="Enlace no válido">
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error ?? 'Este enlace no es válido o ya venció. Cada enlace sirve una sola vez.'}
        </div>
        <Link to="/recuperar" className="mt-6 block w-full rounded-md bg-blue-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-blue-700">
          Pedir un enlace nuevo
        </Link>
        <Link to="/login" className="mt-3 block text-center text-sm font-medium text-blue-600 hover:underline">
          Volver a ingresar
        </Link>
      </TarjetaAcceso>
    )
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (password.length < MINIMO) {
      setError(`La contraseña debe tener al menos ${MINIMO} caracteres.`)
      return
    }
    if (password.length > MAXIMO) {
      setError(`La contraseña no puede pasar de ${MAXIMO} caracteres.`)
      return
    }
    if (password !== confirmacion) {
      setError('Las dos contraseñas no coinciden.')
      return
    }

    setEnviando(true)
    try {
      const respuesta = await restablecerConEnlace(token, password)
      // Si en este equipo había una sesión abierta, el servidor ya la cerró: se limpia también aquí.
      if (usuario) logout()
      navigate('/login', { replace: true, state: { aviso: respuesta.mensaje } })
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'No se pudo cambiar la contraseña'
      // Un 400 por enlace usado o vencido no se arregla reintentando: se muestra la pantalla de enlace no válido.
      if (/no es válido o ya venció/.test(mensaje)) {
        setError(mensaje)
        setEnlaceMalo(true)
      } else {
        setError(mensaje)
      }
    } finally {
      setEnviando(false)
    }
  }

  return (
    <TarjetaAcceso titulo="Elige tu contraseña nueva" descripcion={`Mínimo ${MINIMO} caracteres. Al cambiarla se cierran tus sesiones abiertas.`}>
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <form onSubmit={(evento) => void handleSubmit(evento)} className="space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700">
            Contraseña nueva
          </label>
          <input
            id="password"
            type={verClave ? 'text' : 'password'}
            autoComplete="new-password"
            required
            minLength={MINIMO}
            maxLength={MAXIMO}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={CLASE_INPUT}
          />
        </div>
        <div>
          <label htmlFor="confirmacion" className="block text-sm font-medium text-slate-700">
            Repite la contraseña
          </label>
          <input
            id="confirmacion"
            type={verClave ? 'text' : 'password'}
            autoComplete="new-password"
            required
            maxLength={MAXIMO}
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            className={CLASE_INPUT}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={verClave} onChange={(e) => setVerClave(e.target.checked)} className="h-4 w-4 accent-blue-600" />
          Mostrar las contraseñas
        </label>
        <button type="submit" disabled={enviando} className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {enviando ? 'Cambiando...' : 'Cambiar contraseña'}
        </button>
      </form>
    </TarjetaAcceso>
  )
}
