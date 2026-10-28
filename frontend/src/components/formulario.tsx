import type { ReactNode } from 'react'

// Piezas de formulario con el mismo aspecto que Configuración, para las pantallas de seguridad social y SST.

export const CLASE_INPUT =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
export const CLASE_BOTON = 'rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'
export const CLASE_BOTON_SECUNDARIO =
  'rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50'
export const CLASE_BOTON_PELIGRO = 'rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50'

export function Seccion({ titulo, descripcion, acciones, children }: { titulo: string; descripcion?: string; acciones?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
          {descripcion && <p className="text-sm text-slate-500">{descripcion}</p>}
        </div>
        {acciones}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function Aviso({ error, ok }: { error: string | null; ok?: string | null }) {
  if (error) {
    return <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
  }
  if (ok) {
    return <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{ok}</div>
  }
  return null
}

export function Campo({ id, etiqueta, ayuda, children }: { id: string; etiqueta: string; ayuda?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {etiqueta}
      </label>
      {children}
      {ayuda && <p className="mt-1 text-xs text-slate-400">{ayuda}</p>}
    </div>
  )
}

// Un dato de solo lectura: etiqueta pequeña y valor.
export function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{etiqueta}</dt>
      <dd className="mt-0.5 break-words text-sm text-slate-900">{children}</dd>
    </div>
  )
}

export function Insignia({ children, tono }: { children: ReactNode; tono: 'verde' | 'ambar' | 'rojo' | 'gris' | 'azul' }) {
  const clase = {
    verde: 'bg-green-100 text-green-700',
    ambar: 'bg-amber-100 text-amber-800',
    rojo: 'bg-red-100 text-red-700',
    gris: 'bg-slate-100 text-slate-600',
    azul: 'bg-blue-100 text-blue-700',
  }[tono]
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${clase}`}>{children}</span>
}
