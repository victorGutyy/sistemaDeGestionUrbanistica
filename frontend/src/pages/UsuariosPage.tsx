import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { actualizarEstadoUsuario, desbloquearUsuario, listarUsuarios, type Usuario } from '../lib/api'
import { formatearFecha } from '../lib/formato'

const CLASE_ACCION = 'text-sm font-medium text-blue-600 hover:underline disabled:opacity-50'

function estaBloqueado(usuario: Usuario) {
  return usuario.bloqueadoHasta !== null && new Date(usuario.bloqueadoHasta).getTime() > Date.now()
}

export function UsuariosPage() {
  const { usuario: usuarioActual } = useAuth()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [actualizandoId, setActualizandoId] = useState<string | null>(null)

  useEffect(() => {
    listarUsuarios()
      .then(setUsuarios)
      .catch((err: Error) => setError(err.message))
      .finally(() => setCargando(false))
  }, [])

  async function ejecutar(usuario: Usuario, accion: () => Promise<Usuario>, mensajeError: string) {
    setActualizandoId(usuario.id)
    setError(null)
    try {
      const actualizado = await accion()
      setUsuarios((previos) => previos.map((u) => (u.id === usuario.id ? actualizado : u)))
    } catch (err) {
      setError(err instanceof Error ? err.message : mensajeError)
    } finally {
      setActualizandoId(null)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Usuarios</h1>
          <p className="text-sm text-slate-500">Cuentas con acceso a la app y su rol.</p>
        </div>
        <Link
          to="/usuarios/nuevo"
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Nuevo usuario
        </Link>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <ul className="mt-6 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {!cargando && usuarios.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-slate-400">Todavía no hay usuarios registrados.</li>
        )}
        {usuarios.map((u) => {
          const bloqueado = estaBloqueado(u)
          const esUnoMismo = u.id === usuarioActual?.id
          return (
            <li key={u.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  {u.nombre}
                  {esUnoMismo && <span className="ml-2 text-xs font-normal text-slate-400">(tú)</span>}
                </p>
                <p className="truncate text-sm text-slate-500">{u.email}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">{u.rol.nombre}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 font-medium ${
                      u.estado === 'ACTIVO' ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {u.estado === 'ACTIVO' ? 'Activo' : 'Inactivo'}
                  </span>
                  {bloqueado && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">Bloqueado</span>
                  )}
                  <span className="text-slate-400">
                    {u.ultimoIngreso ? `Último ingreso: ${formatearFecha(u.ultimoIngreso)}` : 'Aún no ha ingresado'}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Link to={`/usuarios/${u.id}/editar`} className={CLASE_ACCION}>
                  Editar
                </Link>
                {bloqueado && (
                  <button
                    type="button"
                    disabled={actualizandoId === u.id}
                    onClick={() => void ejecutar(u, () => desbloquearUsuario(u.id), 'No se pudo desbloquear')}
                    className={CLASE_ACCION}
                  >
                    Desbloquear
                  </button>
                )}
                {!esUnoMismo && (
                  <button
                    type="button"
                    disabled={actualizandoId === u.id}
                    onClick={() =>
                      void ejecutar(
                        u,
                        () => actualizarEstadoUsuario(u.id, u.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO'),
                        'No se pudo actualizar el usuario',
                      )
                    }
                    className={CLASE_ACCION}
                  >
                    {u.estado === 'ACTIVO' ? 'Desactivar' : 'Activar'}
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
