import { useState, type FormEvent } from 'react'
import { actualizarAusentismo, type AusentismoDetalle, type DiagnosticoCie10 } from '../../lib/api'
import { Aviso, CLASE_BOTON, CLASE_BOTON_SECUNDARIO, CLASE_INPUT, Campo } from '../formulario'
import { SelectorDiagnostico } from './SelectorDiagnostico'

interface Props {
  ausentismo: AusentismoDetalle
  // Si puede ver diagnósticos, se edita también el diagnóstico y las observaciones; si no, solo el número del documento.
  puedeVerDiagnostico: boolean
  onGuardado: (ausentismo: AusentismoDetalle) => void
  onCancelar: () => void
}

// Lo único que se corrige de un ausentismo ya registrado (RF-SST-01): el número del documento, el diagnóstico y las
// observaciones. El trabajador, el tipo y las fechas no cambian: se anula y se registra de nuevo.
export function FormularioEdicionAusentismo({ ausentismo, puedeVerDiagnostico, onGuardado, onCancelar }: Props) {
  const [numero, setNumero] = useState(ausentismo.numeroDocumento ?? '')
  const [diagnostico, setDiagnostico] = useState<DiagnosticoCie10 | null>(ausentismo.diagnostico ?? null)
  const [observaciones, setObservaciones] = useState(ausentismo.observaciones ?? '')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (puedeVerDiagnostico && ausentismo.tipo.requiereDiagnostico && !diagnostico) {
      setError('Este tipo de ausentismo exige el diagnóstico CIE-10')
      return
    }
    setEnviando(true)
    try {
      onGuardado(
        await actualizarAusentismo(ausentismo.id, {
          numeroDocumento: numero.trim(),
          ...(puedeVerDiagnostico ? { diagnosticoId: diagnostico?.id ?? null, observaciones: observaciones.trim() } : {}),
        }),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-md border border-slate-200 bg-slate-50 p-3 sm:p-4">
      <Aviso error={error} />
      <Campo id="edit-numero" etiqueta="N.º de la incapacidad o del certificado">
        <input id="edit-numero" maxLength={60} value={numero} onChange={(e) => setNumero(e.target.value)} className={CLASE_INPUT} />
      </Campo>
      {puedeVerDiagnostico && (
        <>
          <Campo id="edit-diagnostico" etiqueta="Diagnóstico CIE-10">
            <SelectorDiagnostico id="edit-diagnostico" valor={diagnostico} onCambio={setDiagnostico} />
          </Campo>
          <Campo id="edit-observaciones" etiqueta="Observaciones">
            <textarea id="edit-observaciones" rows={2} maxLength={1000} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} className={CLASE_INPUT} />
          </Campo>
        </>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={enviando} className={CLASE_BOTON}>
          {enviando ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={onCancelar} className={CLASE_BOTON_SECUNDARIO}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
