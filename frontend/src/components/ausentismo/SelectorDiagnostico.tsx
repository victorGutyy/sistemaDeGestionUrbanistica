import { useEffect, useState } from 'react'
import { listarDiagnosticosCie10, type DiagnosticoCie10 } from '../../lib/api'
import { CLASE_BOTON_SECUNDARIO, CLASE_INPUT } from '../formulario'

interface Props {
  id: string
  // El diagnóstico elegido (con su descripción para mostrarlo) y qué hacer al elegir otro o quitarlo.
  valor: DiagnosticoCie10 | null
  onCambio: (diagnostico: DiagnosticoCie10 | null) => void
}

// Búsqueda de un diagnóstico CIE-10 por código o por descripción. El catálogo puede tener miles de códigos, así que se
// consulta al escribir y se muestran pocos resultados. Elegir uno no revela datos de nadie: es solo el catálogo.
export function SelectorDiagnostico({ id, valor, onCambio }: Props) {
  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState<DiagnosticoCie10[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const consulta = texto.trim()
    if (valor || consulta.length < 2) return
    // Se espera un instante después de la última tecla para no consultar por cada letra.
    const espera = setTimeout(() => {
      listarDiagnosticosCie10({ q: consulta, limite: 8 })
        .then((lista) => {
          setResultados(lista)
          setError(null)
        })
        .catch((err: Error) => setError(err.message))
    }, 250)
    return () => clearTimeout(espera)
  }, [texto, valor])

  // Con menos de dos letras no se muestra nada (aunque quede una búsqueda anterior en memoria).
  const visibles = texto.trim().length >= 2 ? resultados : []

  if (valor) {
    return (
      <div className="mt-1 flex items-center justify-between gap-3 rounded-md border border-slate-300 bg-slate-50 px-3 py-2">
        <p className="min-w-0 text-sm text-slate-900">
          <span className="font-semibold">{valor.codigo}</span> — {valor.descripcion}
        </p>
        <button
          type="button"
          className={CLASE_BOTON_SECUNDARIO}
          onClick={() => {
            onCambio(null)
            setTexto('')
          }}
        >
          Cambiar
        </button>
      </div>
    )
  }

  return (
    <div>
      <input id={id} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe el código (J06.9) o parte del nombre" autoComplete="off" className={CLASE_INPUT} />
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      {texto.trim().length >= 2 && visibles.length === 0 && !error && <p className="mt-1 text-xs text-slate-500">No hay códigos con ese texto. Quien gestiona SST puede agregarlos desde Configuración → Seguridad social.</p>}
      {visibles.length > 0 && (
        <ul className="mt-1 max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200 bg-white">
          {visibles.map((d) => (
            <li key={d.id}>
              <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => onCambio(d)}>
                <span className="font-semibold text-slate-900">{d.codigo}</span> <span className="text-slate-700">— {d.descripcion}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
