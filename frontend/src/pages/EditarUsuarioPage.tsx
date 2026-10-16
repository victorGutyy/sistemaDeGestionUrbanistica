import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  actualizarUsuario,
  listarRoles,
  listarUsuarios,
  restablecerPasswordUsuario,
  type RolConPermisos,
  type Usuario,
} from '../lib/api'

const CLASE_INPUT =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
const CLASE_BOTON =
  'rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'

export function EditarUsuarioPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [roles, setRoles] = useState<RolConPermisos[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [rolId, setRolId] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [passwordNueva, setPasswordNueva] = useState('')
  const [reiniciando, setReiniciando] = useState(false)
  const [errorPassword, setErrorPassword] = useState<string | null>(null)
  const [okPassword, setOkPassword] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([listarUsuarios(), listarRoles()])
      .then(([usuarios, { roles: recibidos }]) => {
        const encontrado = usuarios.find((u) => u.id === id)
        if (!encontrado) {
          setErrorCarga('No se encontró el usuario.')
          return
        }
        setUsuario(encontrado)
        setNombre(encontrado.nombre)
        setEmail(encontrado.email)
        setRolId(encontrado.rol.id)
        setRoles(recibidos)
      })
      .catch((err: Error) => setErrorCarga(err.message))
      .finally(() => setCargando(false))
  }, [id])

  const rolElegido = roles.find((r) => r.id === rolId)

  async function handleGuardar(event: FormEvent) {
    event.preventDefault()
    if (!id) return
    setError(null)
    setEnviando(true)
    try {
      await actualizarUsuario(id, { nombre: nombre.trim(), email: email.trim(), rolId })
      navigate('/usuarios')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setEnviando(false)
    }
  }

  async function handleRestablecer(event: FormEvent) {
    event.preventDefault()
    if (!id) return
    setErrorPassword(null)
    setOkPassword(null)
    setReiniciando(true)
    try {
      await restablecerPasswordUsuario(id, passwordNueva)
      setPasswordNueva('')
      setOkPassword('Contraseña restablecida. Se cerraron las sesiones abiertas de esta persona y la cuenta quedó desbloqueada.')
    } catch (err) {
      setErrorPassword(err instanceof Error ? err.message : 'No se pudo restablecer la contraseña')
    } finally {
      setReiniciando(false)
    }
  }

  if (cargando) {
    return <p className="text-sm text-slate-500">Cargando usuario...</p>
  }
  if (!usuario) {
    return <p className="text-sm text-red-600">{errorCarga ?? 'No se encontró el usuario.'}</p>
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link to="/usuarios" className="text-sm text-blue-600 hover:underline">
          ← Volver a usuarios
        </Link>
        <h1 className="mt-2 text-lg font-semibold text-slate-900">Editar usuario</h1>
        <p className="text-sm text-slate-500">{usuario.email}</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
        <h2 className="text-base font-semibold text-slate-900">Datos y rol</h2>
        {error && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
        <form onSubmit={handleGuardar} className="mt-4 space-y-4">
          <div>
            <label htmlFor="nombre" className="block text-sm font-medium text-slate-700">
              Nombre completo
            </label>
            <input id="nombre" required minLength={3} value={nombre} onChange={(e) => setNombre(e.target.value)} className={CLASE_INPUT} />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              Correo
            </label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={CLASE_INPUT} />
          </div>
          <div>
            <label htmlFor="rol" className="block text-sm font-medium text-slate-700">
              Rol
            </label>
            <select id="rol" required value={rolId} onChange={(e) => setRolId(e.target.value)} className={CLASE_INPUT}>
              {roles.map((rol) => (
                <option key={rol.id} value={rol.id}>
                  {rol.nombre}
                </option>
              ))}
            </select>
            {rolElegido?.descripcion && <p className="mt-1 text-xs text-slate-500">{rolElegido.descripcion}</p>}
            <p className="mt-1 text-xs text-slate-400">El cambio de rol aplica de inmediato, sin que la persona tenga que volver a ingresar.</p>
          </div>
          <button type="submit" disabled={enviando} className={CLASE_BOTON}>
            {enviando ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
        <h2 className="text-base font-semibold text-slate-900">Restablecer contraseña</h2>
        <p className="text-sm text-slate-500">
          Define una contraseña nueva y compártela por un medio seguro. Se cierran las sesiones abiertas de esta cuenta y se desbloquea si
          estaba bloqueada.
        </p>
        {errorPassword && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorPassword}</div>
        )}
        {okPassword && (
          <div className="mt-3 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{okPassword}</div>
        )}
        <form onSubmit={handleRestablecer} className="mt-4 space-y-4">
          <div>
            <label htmlFor="passwordNueva" className="block text-sm font-medium text-slate-700">
              Contraseña nueva
            </label>
            <input
              id="passwordNueva"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={passwordNueva}
              onChange={(e) => setPasswordNueva(e.target.value)}
              className={CLASE_INPUT}
            />
            <p className="mt-1 text-xs text-slate-400">Mínimo 8 caracteres.</p>
          </div>
          <button type="submit" disabled={reiniciando} className={CLASE_BOTON}>
            {reiniciando ? 'Restableciendo...' : 'Restablecer contraseña'}
          </button>
        </form>
      </section>
    </div>
  )
}
