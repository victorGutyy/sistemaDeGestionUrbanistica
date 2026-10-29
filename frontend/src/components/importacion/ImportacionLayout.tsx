import { NavLink, Outlet } from 'react-router-dom'

// Marco de las cargas desde Excel: el título y una pestaña por tipo de carga (ventas, o seguridad y salud en el trabajo).
export function ImportacionLayout() {
  const pestanas = [
    { to: '/importacion', etiqueta: 'Ventas y abonos', fin: true },
    { to: '/importacion/sst', etiqueta: 'Seguridad y salud (SST)', fin: false },
  ]
  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-semibold text-slate-900">Importar desde Excel</h1>
      <nav aria-label="Tipo de carga" className="mt-3 -mx-4 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1">
          {pestanas.map((pestana) => (
            <li key={pestana.to}>
              <NavLink
                to={pestana.to}
                end={pestana.fin}
                className={({ isActive }) =>
                  `block whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium ${
                    isActive ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
                  }`
                }
              >
                {pestana.etiqueta}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </div>
  )
}
