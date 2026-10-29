import { useState, type ReactNode } from 'react'
import type { ProblemaImportacion } from '../../lib/api'
import { MAXIMO_PROBLEMAS_VISIBLES } from '../../lib/importacion'

// Piezas de las pantallas de carga desde Excel (ventas y seguridad y salud en el trabajo).

export function Tarjeta({ numero, titulo, children }: { numero: number; titulo: string; children: ReactNode }) {
  return (
    <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs text-white">{numero}</span>
        {titulo}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

export function Dato({ etiqueta, valor, detalle }: { etiqueta: string; valor: string | number; detalle?: string }) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{etiqueta}</p>
      <p className="text-base font-semibold text-slate-900">{valor}</p>
      {detalle && <p className="text-xs text-slate-500">{detalle}</p>}
    </div>
  )
}

// Los errores o avisos de una carga, agrupados por hoja y ubicados por fila y columna para poder corregirlos en el Excel.
export function ListaProblemas({ titulo, problemas, total, tono }: { titulo: string; problemas: ProblemaImportacion[]; total: number; tono: 'error' | 'aviso' }) {
  const [verTodo, setVerTodo] = useState(false)
  if (problemas.length === 0) return null

  const hojas = new Map<string, ProblemaImportacion[]>()
  for (const problema of problemas) hojas.set(problema.hoja, [...(hojas.get(problema.hoja) ?? []), problema])

  const estilo = tono === 'error' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'
  const estiloTitulo = tono === 'error' ? 'text-red-800' : 'text-amber-800'

  return (
    <div className={`mt-4 rounded-md border p-3 ${estilo}`}>
      <p className={`text-sm font-medium ${estiloTitulo}`}>
        {titulo} ({total})
      </p>
      {[...hojas.entries()].map(([hoja, lista]) => (
        <div key={hoja} className="mt-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Hoja {hoja}</p>
          <ul className="mt-1 space-y-1.5">
            {(verTodo ? lista : lista.slice(0, MAXIMO_PROBLEMAS_VISIBLES)).map((problema, indice) => (
              <li key={indice} className="rounded bg-white/70 px-2 py-1.5 text-sm text-slate-800">
                <span className="text-xs font-medium text-slate-500">
                  {problema.fila ? `Fila ${problema.fila}` : 'General'}
                  {problema.columna ? ` · ${problema.columna}` : ''}
                </span>
                <p className="break-words">{problema.mensaje}</p>
              </li>
            ))}
          </ul>
          {!verTodo && lista.length > MAXIMO_PROBLEMAS_VISIBLES && (
            <button type="button" onClick={() => setVerTodo(true)} className="mt-1 text-xs font-medium text-blue-600 hover:underline">
              Ver los {lista.length - MAXIMO_PROBLEMAS_VISIBLES} restantes de esta hoja
            </button>
          )}
        </div>
      ))}
      {total > problemas.length && <p className="mt-2 text-xs text-slate-600">Se muestran los primeros {problemas.length}; corrige estos y vuelve a validar para ver los demás.</p>}
    </div>
  )
}
