import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { ITEMS_MENU } from '../lib/menu'

// Lleva al usuario a la primera pantalla que su rol puede ver.
export function RutaInicial() {
  const { tiene } = useAuth()
  const inicio = ITEMS_MENU.find((item) => tiene(item.permiso))

  if (!inicio) {
    return <p className="text-sm text-slate-500">Tu rol todavía no tiene acceso a ninguna sección. Habla con el gerente.</p>
  }
  return <Navigate to={inicio.to} replace />
}
