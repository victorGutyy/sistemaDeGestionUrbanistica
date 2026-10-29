import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { obtenerResumenSst, type ResumenSst } from '../../lib/api'
import { PERMISOS } from '../../lib/permisos'

interface Pestana {
  to: string
  etiqueta: string
  // Cuántas alertas tiene (se muestra como un contador en la pestaña).
  alertas?: number
  fin?: boolean
}

// Marco del módulo de seguridad y salud en el trabajo: el título y las pestañas (Trabajadores, EPP, Plan de trabajo,
// Capacitaciones, Ausentismo y Avisos). Cada pestaña muestra cuántas alertas tiene, con el mismo cálculo del panel.
export function SstLayout() {
  const { tiene } = useAuth()
  const [resumen, setResumen] = useState<ResumenSst | null>(null)

  // Se vuelve a consultar al cambiar de pestaña, para que los contadores reflejen lo que se acaba de registrar.
  const { pathname } = useLocation()
  useEffect(() => {
    obtenerResumenSst()
      .then(setResumen)
      .catch(() => setResumen(null))
  }, [pathname])

  const pestanas: Pestana[] = [
    { to: '/sst', etiqueta: 'Trabajadores', fin: true },
    { to: '/sst/epp', etiqueta: 'EPP', alertas: resumen ? resumen.epp.vencidos + resumen.epp.porReponer : 0 },
    { to: '/sst/plan', etiqueta: 'Plan de trabajo', alertas: resumen ? resumen.plan.vencidas + resumen.plan.proximas : 0 },
    { to: '/sst/capacitaciones', etiqueta: 'Capacitaciones', alertas: resumen ? resumen.capacitaciones.vencidas + resumen.capacitaciones.proximas : 0 },
    { to: '/sst/ausentismo', etiqueta: 'Ausentismo' },
    { to: '/sst/avisos', etiqueta: 'Avisos', fin: true },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Seguridad y salud en el trabajo</h1>
          <p className="text-sm text-slate-500">Afiliaciones, elementos de protección, plan de trabajo, capacitaciones y ausentismo.</p>
        </div>
        {tiene(PERMISOS.CONFIGURACION_EDITAR) && (
          <Link to="/configuracion/seguridad-social" className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Parámetros y entidades
          </Link>
        )}
      </div>

      <nav aria-label="Secciones de seguridad y salud" className="-mx-4 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1">
          {pestanas.map((pestana) => (
            <li key={pestana.to}>
              <NavLink
                to={pestana.to}
                end={pestana.fin}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium ${
                    isActive ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
                  }`
                }
              >
                {pestana.etiqueta}
                {pestana.alertas !== undefined && pestana.alertas > 0 && (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800" title={`${pestana.alertas} por atender`}>
                    {pestana.alertas}
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <Outlet />
    </div>
  )
}
