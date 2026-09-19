import { Building2, Calculator, LayoutDashboard, LogOut, Shield, Users, Wallet } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { cn } from '../../lib/utils'

const navItems = [
  { to: '/dashboard', label: 'Panel general', icon: LayoutDashboard },
  { to: '/proyectos', label: 'Proyectos', icon: Building2 },
  { to: '/cartera', label: 'Cartera', icon: Wallet },
  { to: '/contabilidad', label: 'Contabilidad', icon: Calculator },
  { to: '/nomina', label: 'Nómina', icon: Users },
]

const ETIQUETA_ROL: Record<string, string> = {
  PROPIETARIO: 'Propietario',
  ADMINISTRADOR: 'Administrador',
  CONSULTA: 'Consulta',
}

export function AppLayout() {
  const { usuario, logout } = useAuth()
  const items = usuario?.rol === 'PROPIETARIO' ? [...navItems, { to: '/usuarios', label: 'Usuarios', icon: Shield }] : navItems

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-60 flex-col border-r border-slate-200 bg-white">
        <div className="px-5 py-5">
          <p className="text-sm font-semibold text-slate-900">Urbanix</p>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  isActive && 'bg-blue-50 text-blue-700 hover:bg-blue-50 hover:text-blue-700',
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        {usuario && (
          <div className="border-t border-slate-200 px-3 py-3">
            <p className="truncate px-2 text-sm font-medium text-slate-900">{usuario.nombre}</p>
            <p className="px-2 text-xs text-slate-400">{ETIQUETA_ROL[usuario.rol]}</p>
            <button
              type="button"
              onClick={logout}
              className="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </button>
          </div>
        )}
      </aside>

      <main className="flex-1 p-8">
        <Outlet />
      </main>
    </div>
  )
}
