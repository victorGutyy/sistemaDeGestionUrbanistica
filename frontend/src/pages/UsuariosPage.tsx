import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { actualizarEstadoUsuario, listarUsuarios, type Usuario } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

const ETIQUETA_ROL: Record<Usuario['rol'], string> = {
  PROPIETARIO: 'Propietario',
  ADMINISTRADOR: 'Administrador',
  CONSULTA: 'Consulta',
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

  async function handleCambiarEstado(usuario: Usuario) {
    const nuevoEstado = usuario.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO'
    setActualizandoId(usuario.id)
    setError(null)
    try {
      const actualizado = await actualizarEstadoUsuario(usuario.id, nuevoEstado)
      setUsuarios((previos) => previos.map((u) => (u.id === usuario.id ? actualizado : u)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el usuario')
    } finally {
      setActualizandoId(null)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
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

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Correo</th>
              <th className="px-4 py-3 font-medium">Rol</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {!cargando && usuarios.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  Todavía no hay usuarios registrados.
                </td>
              </tr>
            )}
            {usuarios.map((u) => (
              <tr key={u.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">{u.nombre}</td>
                <td className="px-4 py-3">{u.email}</td>
                <td className="px-4 py-3">{ETIQUETA_ROL[u.rol]}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      u.estado === 'ACTIVO' ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {u.estado === 'ACTIVO' ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {u.id !== usuarioActual?.id && (
                    <button
                      type="button"
                      onClick={() => handleCambiarEstado(u)}
                      disabled={actualizandoId === u.id}
                      className="text-sm font-medium text-blue-600 hover:underline disabled:opacity-50"
                    >
                      {u.estado === 'ACTIVO' ? 'Desactivar' : 'Activar'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
