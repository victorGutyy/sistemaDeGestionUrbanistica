import type { Proyecto } from '../lib/api'

interface Props {
  proyectos: Proyecto[]
  todos: boolean
  seleccion: string[]
  onCambio: (cambio: { todos: boolean; seleccion: string[] }) => void
}

// Elige a qué proyectos tiene acceso un usuario (solo para roles que se pueden limitar, como Consulta).
export function SelectorAlcance({ proyectos, todos, seleccion, onCambio }: Props) {
  function alternar(id: string) {
    const nueva = seleccion.includes(id) ? seleccion.filter((x) => x !== id) : [...seleccion, id]
    onCambio({ todos, seleccion: nueva })
  }

  return (
    <fieldset className="rounded-md border border-slate-200 p-3">
      <legend className="px-1 text-sm font-medium text-slate-700">Proyectos a los que tiene acceso</legend>

      <label className="flex items-center gap-2 py-1 text-sm text-slate-800">
        <input
          type="radio"
          name="alcance"
          checked={todos}
          onChange={() => onCambio({ todos: true, seleccion })}
          className="h-4 w-4 accent-blue-600"
        />
        Todos los proyectos
      </label>
      <label className="flex items-center gap-2 py-1 text-sm text-slate-800">
        <input
          type="radio"
          name="alcance"
          checked={!todos}
          onChange={() => onCambio({ todos: false, seleccion })}
          className="h-4 w-4 accent-blue-600"
        />
        Solo algunos proyectos
      </label>

      {!todos && (
        <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
          {proyectos.length === 0 && <p className="text-sm text-slate-500">Todavía no hay proyectos.</p>}
          {proyectos.map((proyecto) => (
            <label key={proyecto.id} className="flex items-center gap-2 py-1 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={seleccion.includes(proyecto.id)}
                onChange={() => alternar(proyecto.id)}
                className="h-4 w-4 accent-blue-600"
              />
              {proyecto.nombre}
            </label>
          ))}
          {seleccion.length === 0 && <p className="text-xs text-amber-700">Elige al menos un proyecto.</p>}
        </div>
      )}
      <p className="mt-2 text-xs text-slate-400">
        Una persona limitada a ciertos proyectos solo ve sus datos; no ve nómina, configuración ni otros proyectos.
      </p>
    </fieldset>
  )
}
