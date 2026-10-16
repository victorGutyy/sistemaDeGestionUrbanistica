import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

// Exige sesión y, si se indica, un permiso. Ocultar la pantalla es comodidad:
// el servidor rechaza igualmente cualquier petición sin permiso.
export function ProtectedRoute({ permiso }: { permiso?: string }) {
  const { usuario, cargando, tiene } = useAuth()

  if (cargando) {
    return <p className="p-8 text-sm text-slate-500">Cargando...</p>
  }

  if (!usuario) {
    return <Navigate to="/login" replace />
  }

  if (permiso && !tiene(permiso)) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
