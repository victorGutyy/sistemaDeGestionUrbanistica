import { Building2, Calculator, LayoutDashboard, LogOut, Menu, Settings, Shield, Users, Wallet, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useEmpresa } from '../../contexts/EmpresaContext'
import { cn } from '../../lib/utils'
import { LogoEmpresa } from '../LogoEmpresa'

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
  const { marca } = useEmpresa()
  const [menuAbierto, setMenuAbierto] = useState(false)
  const items =
    usuario?.rol === 'PROPIETARIO'
      ? [...navItems, { to: '/usuarios', label: 'Usuarios', icon: Shield }, { to: '/configuracion', label: 'Configuración', icon: Settings }]
      : navItems
  // Nombre que se muestra en pantalla: el de la empresa; si aún no hay, el del producto.
  const nombreMarca = marca.nombreComercial || marca.nombreProducto

  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      {/* Barra superior: solo en celular */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <button
          type="button"
          onClick={() => setMenuAbierto(true)}
          aria-label="Abrir menú"
          className="-ml-1 rounded-md p-2 text-slate-600 hover:bg-slate-100"
        >
          <Menu className="h-5 w-5" />
        </button>
        <LogoEmpresa className="h-7 w-7 shrink-0" />
        <p className="truncate text-sm font-semibold text-slate-900">{nombreMarca}</p>
      </header>

      {/* Fondo oscuro detrás del menú en celular */}
      {menuAbierto && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 md:hidden" onClick={() => setMenuAbierto(false)} aria-hidden="true" />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:translate-x-0',
          menuAbierto ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <div className="flex min-w-0 items-center gap-2">
            <LogoEmpresa className="h-8 w-8 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{nombreMarca}</p>
              {marca.nombreComercial && <p className="truncate text-xs text-slate-400">{marca.nombreProducto}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMenuAbierto(false)}
            aria-label="Cerrar menú"
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMenuAbierto(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900',
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

      <main className="min-w-0 flex-1 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  )
}
