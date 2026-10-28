import { useRef, useState, type FormEvent } from 'react'
import { abrirDocumentoSst, subirDocumentoSst, type DocumentoSst, type RutaDocumentosSst } from '../../lib/api'
import { formatearFecha } from '../../lib/formato'
import { tamanoLegible } from '../../lib/seguridadSocial'
import { Aviso, CLASE_BOTON, CLASE_BOTON_SECUNDARIO, CLASE_INPUT } from '../formulario'

const TAMANO_MAXIMO = 10 * 1024 * 1024

interface Props {
  // A qué registro pertenecen: el acta de una entrega, la evidencia de una actividad o el soporte de una capacitación.
  ruta: RutaDocumentosSst
  registroId: string
  documentos: DocumentoSst[]
  // Quién puede adjuntar (sst.gestionar). Los demás solo abren.
  puedeAdjuntar: boolean
  // Se llama después de adjuntar, para que la pantalla vuelva a cargar el registro.
  onCambio: () => void
  etiquetaAdjuntar?: string
}

// Adjuntos de un registro SST (RF-SST-21): se abren con la sesión (no hay enlaces públicos) y no se borran.
export function AdjuntosSst({ ruta, registroId, documentos, puedeAdjuntar, onCambio, etiquetaAdjuntar = 'Adjuntar documento' }: Props) {
  const entrada = useRef<HTMLInputElement>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [descripcion, setDescripcion] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function abrir(documento: DocumentoSst) {
    setError(null)
    try {
      await abrirDocumentoSst(ruta, registroId, documento.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir el documento')
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!archivo) {
      setError('Elige el archivo que vas a adjuntar')
      return
    }
    if (archivo.size > TAMANO_MAXIMO) {
      setError('El archivo pesa más de 10 MB')
      return
    }
    setEnviando(true)
    try {
      await subirDocumentoSst(ruta, registroId, archivo, descripcion.trim() || undefined)
      setArchivo(null)
      setDescripcion('')
      if (entrada.current) entrada.current.value = ''
      onCambio()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo adjuntar el documento')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div>
      <Aviso error={error} />
      <ul className="divide-y divide-slate-100">
        {documentos.length === 0 && <li className="py-2 text-sm text-slate-400">Todavía no hay documentos adjuntos.</li>}
        {documentos.map((documento) => (
          <li key={documento.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">{documento.nombreOriginal}</p>
              <p className="text-xs text-slate-500">
                {tamanoLegible(documento.tamano)} · {formatearFecha(documento.createdAt)}
                {documento.subidoPor && ` · ${documento.subidoPor.nombre}`}
                {documento.descripcion && ` · ${documento.descripcion}`}
              </p>
            </div>
            <button type="button" className={CLASE_BOTON_SECUNDARIO} onClick={() => void abrir(documento)}>
              Abrir
            </button>
          </li>
        ))}
      </ul>

      {puedeAdjuntar && (
        <form onSubmit={handleSubmit} className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          <input
            ref={entrada}
            type="file"
            aria-label="Archivo a adjuntar"
            accept="application/pdf,image/png,image/jpeg"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
          />
          <input aria-label="Descripción del documento" placeholder="Descripción (opcional)" maxLength={300} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={CLASE_INPUT} />
          <p className="text-xs text-slate-400">PDF, PNG o JPG de hasta 10 MB.</p>
          <button type="submit" disabled={enviando} className={`${CLASE_BOTON} w-full sm:w-auto`}>
            {enviando ? 'Adjuntando…' : etiquetaAdjuntar}
          </button>
        </form>
      )}
    </div>
  )
}
