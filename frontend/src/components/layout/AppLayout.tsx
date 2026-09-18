import { Building2, Calculator, Users, Wallet } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '../../lib/utils'

const navItems = [
  { to: '/proyectos', label: 'Proyectos', icon: Building2 },
  { to: '/cartera', label: 'Cartera', icon: Wallet },
  { to: '/contabilidad', label: 'Contabilidad', icon: Calculator },
  { to: '/nomina', label: 'Nómina', icon: Users },
]

export function AppLayout() {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-60 flex-col border-r border-slate-200 bg-white">
        <div className="px-5 py-5">
          <p className="text-sm font-semibold text-slate-900">Sistema Urbanismo</p>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {navItems.map(({ to, label, icon: Icon }) => (
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
      </aside>

      <main className="flex-1 p-8">
        <Outlet />
      </main>
    </div>
  )
}
