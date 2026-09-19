import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function ProtectedRoute() {
  const { usuario, cargando } = useAuth()

  if (cargando) {
    return <p className="p-8 text-sm text-slate-500">Cargando...</p>
  }

  if (!usuario) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
