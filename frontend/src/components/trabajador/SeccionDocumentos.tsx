import { useRef, useState, type FormEvent } from 'react'
import { abrirDocumentoTrabajador, subirDocumentoTrabajador, type DocumentoTrabajador, type TipoDocumentoTrabajador } from '../../lib/api'
import { formatearFecha } from '../../lib/formato'
import { ETIQUETA_TIPO_DOCUMENTO_TRABAJADOR, tamanoLegible } from '../../lib/seguridadSocial'
import { Aviso, CLASE_BOTON, CLASE_BOTON_SECUNDARIO, CLASE_INPUT, Campo, Seccion } from '../formulario'

const TAMANO_MAXIMO = 10 * 1024 * 1024

interface Props {
  trabajadorId: string
  documentos: DocumentoTrabajador[]
  // Qué tipos puede adjuntar quien mira la pantalla (según sus permisos). Vacío = solo consulta.
  tiposPermitidos: TipoDocumentoTrabajador[]
  onCambio: () => void
}

// Documentos del trabajador (RF-PER-06): certificados de afiliación, autorización de datos, contrato. Se abren con la
// sesión (no hay enlaces públicos) y no se borran.
export function SeccionDocumentos({ trabajadorId, documentos, tiposPermitidos, onCambio }: Props) {
  const entrada = useRef<HTMLInputElement>(null)
  const [tipo, setTipo] = useState<TipoDocumentoTrabajador>(tiposPermitidos[0] ?? 'CERTIFICADO_AFILIACION')
  const [descripcion, setDescripcion] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function abrir(documento: DocumentoTrabajador) {
    setError(null)
    try {
      await abrirDocumentoTrabajador(trabajadorId, documento.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir el documento')
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setOk(null)
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
      await subirDocumentoTrabajador(trabajadorId, archivo, tipo, descripcion.trim() || undefined)
      setOk('Documento adjuntado')
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
    <Seccion titulo="Documentos" descripcion="Certificados de afiliación, autorización de datos y otros soportes. Se conservan siempre: no se borran.">
      <Aviso error={error} ok={ok} />
      <ul className="divide-y divide-slate-100">
        {documentos.length === 0 && <li className="py-3 text-sm text-slate-400">Todavía no hay documentos adjuntos.</li>}
        {documentos.map((documento) => (
          <li key={documento.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">{documento.nombreOriginal}</p>
              <p className="text-xs text-slate-500">
                {ETIQUETA_TIPO_DOCUMENTO_TRABAJADOR[documento.tipo]} · {tamanoLegible(documento.tamano)} · {formatearFecha(documento.createdAt)}
                {documento.subidoPor && ` · ${documento.subidoPor.nombre}`}
              </p>
              {documento.descripcion && <p className="text-xs text-slate-500">{documento.descripcion}</p>}
            </div>
            <button type="button" className={CLASE_BOTON_SECUNDARIO} onClick={() => void abrir(documento)}>
              Abrir
            </button>
          </li>
        ))}
      </ul>

      {tiposPermitidos.length > 0 && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo id="tipo-documento" etiqueta="Tipo de documento">
              <select id="tipo-documento" value={tipo} onChange={(e) => setTipo(e.target.value as TipoDocumentoTrabajador)} className={CLASE_INPUT}>
                {tiposPermitidos.map((t) => (
                  <option key={t} value={t}>
                    {ETIQUETA_TIPO_DOCUMENTO_TRABAJADOR[t]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo id="archivo-documento" etiqueta="Archivo" ayuda="PDF, PNG o JPG de hasta 10 MB.">
              <input
                id="archivo-documento"
                ref={entrada}
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
                className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
              />
            </Campo>
          </div>
          <Campo id="descripcion-documento" etiqueta="Descripción (opcional)">
            <input id="descripcion-documento" maxLength={300} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={CLASE_INPUT} />
          </Campo>
          <button type="submit" disabled={enviando} className={`${CLASE_BOTON} w-full sm:w-auto`}>
            {enviando ? 'Adjuntando…' : 'Adjuntar documento'}
          </button>
        </form>
      )}
    </Seccion>
  )
}
