import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { PERMISOS } from '../lib/permisos'

// Marco de la pestaña Ausentismo (CC-03, fase C): los registros de incapacidades y licencias, el resumen mensual, el recobro a
// las entidades y las novedades para la nómina. Las novedades traen valores: solo aparecen para quien puede verlos.
export function SstAusentismoLayout() {
  const { tiene } = useAuth()
  const secciones = [
    { to: '/sst/ausentismo', etiqueta: 'Registros', fin: true },
    { to: '/sst/ausentismo/resumen', etiqueta: 'Resumen mensual', fin: true },
    { to: '/sst/ausentismo/recobros', etiqueta: 'Recobro a entidades', fin: true },
    ...(tiene(PERMISOS.SST_VALORES_VER) ? [{ to: '/sst/ausentismo/novedades', etiqueta: 'Novedades para nómina', fin: true }] : []),
  ]

  return (
    <div className="space-y-5">
      <nav aria-label="Secciones del ausentismo" className="flex flex-wrap gap-2">
        {secciones.map((seccion) => (
          <NavLink
            key={seccion.to}
            to={seccion.to}
            end={seccion.fin}
            className={({ isActive }) =>
              `rounded-full border px-3 py-1.5 text-sm font-medium ${isActive ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`
            }
          >
            {seccion.etiqueta}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
