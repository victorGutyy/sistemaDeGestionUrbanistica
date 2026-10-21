import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { TarjetaAcceso } from '../components/TarjetaAcceso'
import { solicitarRecuperacion } from '../lib/api'

const CLASE_INPUT =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500'

// Pide el enlace para recuperar la contraseña (RF-USR-06). El servidor responde lo mismo exista o no el correo, y aquí
// tampoco se insinúa nada: el mensaje es siempre el mismo.
export function RecuperarPasswordPage() {
  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      const respuesta = await solicitarRecuperacion(email.trim())
      setEnviado(respuesta.mensaje)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar la solicitud')
    } finally {
      setEnviando(false)
    }
  }

  if (enviado) {
    return (
      <TarjetaAcceso titulo="Revisa tu correo">
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{enviado}</div>
        <p className="mt-3 text-xs text-slate-500">
          El enlace sirve una sola vez y vence pronto. Si no llega en unos minutos, revisa la carpeta de correo no deseado o pide uno nuevo.
        </p>
        <Link to="/login" className="mt-6 block w-full rounded-md bg-blue-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-blue-700">
          Volver a ingresar
        </Link>
      </TarjetaAcceso>
    )
  }

  return (
    <TarjetaAcceso titulo="Recupera tu contraseña" descripcion="Escribe el correo de tu cuenta y te enviamos un enlace para elegir una contraseña nueva.">
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <form onSubmit={(evento) => void handleSubmit(evento)} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700">
            Correo
          </label>
          <input id="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} className={CLASE_INPUT} />
        </div>
        <button type="submit" disabled={enviando} className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {enviando ? 'Enviando...' : 'Enviar enlace'}
        </button>
      </form>
      <Link to="/login" className="mt-4 block text-center text-sm font-medium text-blue-600 hover:underline">
        Volver a ingresar
      </Link>
    </TarjetaAcceso>
  )
}
