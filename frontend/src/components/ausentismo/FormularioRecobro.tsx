import { useState, type FormEvent } from 'react'
import { actualizarRecobro, type EntidadRecobro, type EstadoRecobro, type RecobroAusentismo } from '../../lib/api'
import { ESTADOS_RECOBRO, ETIQUETA_ENTIDAD_RECOBRO, ETIQUETA_ESTADO_RECOBRO } from '../../lib/ausentismo'
import { fechaParaInput } from '../../lib/formato'
import { pesosATexto } from '../../lib/seguridadSocial'
import { Aviso, CLASE_BOTON, CLASE_BOTON_SECUNDARIO, CLASE_INPUT, Campo } from '../formulario'

interface Props {
  ausentismoId: string
  entidad: EntidadRecobro
  actual: RecobroAusentismo
  onGuardado: (recobro: RecobroAusentismo) => void
  onCancelar: () => void
}

// Cambia el estado del cobro a la EPS, la ARL o el fondo de pensiones (RF-SST-09). Cada estado pide sus datos: radicado, la
// fecha en que se radicó; pagado, las dos fechas y el valor que reconoció la entidad; rechazado, la fecha y el motivo. El
// sistema solo lleva el seguimiento: no transmite nada a la entidad.
export function FormularioRecobro({ ausentismoId, entidad, actual, onGuardado, onCancelar }: Props) {
  const [estado, setEstado] = useState<EstadoRecobro>(actual.estado)
  const [radicacion, setRadicacion] = useState(fechaParaInput(actual.fechaRadicacion))
  const [pago, setPago] = useState(fechaParaInput(actual.fechaPago))
  const [valor, setValor] = useState(actual.valorReconocido ? String(Number(actual.valorReconocido)) : '')
  const [observaciones, setObservaciones] = useState(actual.observaciones ?? '')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pideRadicacion = estado !== 'PENDIENTE'
  const pidePago = estado === 'PAGADA'
  const pideValor = estado === 'PAGADA' || estado === 'RADICADA'
  const pideMotivo = estado === 'RECHAZADA'

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      onGuardado(
        await actualizarRecobro(ausentismoId, entidad, {
          estado,
          fechaRadicacion: pideRadicacion ? radicacion || undefined : undefined,
          fechaPago: pidePago ? pago || undefined : undefined,
          valorReconocido: pideValor && valor.trim() !== '' ? pesosATexto(valor) : undefined,
          observaciones: observaciones.trim() || undefined,
        }),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el recobro')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm font-medium text-slate-800">Recobro a {ETIQUETA_ENTIDAD_RECOBRO[entidad]}</p>
      <Aviso error={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id={`rec-estado-${entidad}`} etiqueta="Estado">
          <select id={`rec-estado-${entidad}`} value={estado} onChange={(e) => setEstado(e.target.value as EstadoRecobro)} className={CLASE_INPUT}>
            {ESTADOS_RECOBRO.map((e) => (
              <option key={e} value={e}>
                {ETIQUETA_ESTADO_RECOBRO[e]}
              </option>
            ))}
          </select>
        </Campo>
        {pideRadicacion && (
          <Campo id={`rec-radicacion-${entidad}`} etiqueta="Fecha de radicación">
            <input id={`rec-radicacion-${entidad}`} type="date" required value={radicacion} onChange={(e) => setRadicacion(e.target.value)} className={CLASE_INPUT} />
          </Campo>
        )}
        {pidePago && (
          <Campo id={`rec-pago-${entidad}`} etiqueta="Fecha en que pagaron" ayuda="No puede ser anterior a la de radicación.">
            <input id={`rec-pago-${entidad}`} type="date" required min={radicacion} value={pago} onChange={(e) => setPago(e.target.value)} className={CLASE_INPUT} />
          </Campo>
        )}
        {pideValor && (
          <Campo id={`rec-valor-${entidad}`} etiqueta={pidePago ? 'Valor que reconoció la entidad ($)' : 'Valor reclamado ($, opcional)'}>
            <input id={`rec-valor-${entidad}`} required={pidePago} inputMode="numeric" value={valor} onChange={(e) => setValor(e.target.value)} className={CLASE_INPUT} />
          </Campo>
        )}
      </div>
      <Campo id={`rec-obs-${entidad}`} etiqueta={pideMotivo ? 'Motivo del rechazo' : 'Observaciones (opcional)'}>
        <input id={`rec-obs-${entidad}`} required={pideMotivo} maxLength={500} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} className={CLASE_INPUT} />
      </Campo>
      <div className="flex gap-2">
        <button type="submit" disabled={enviando} className={CLASE_BOTON}>
          {enviando ? 'Guardando…' : 'Guardar recobro'}
        </button>
        <button type="button" onClick={onCancelar} className={CLASE_BOTON_SECUNDARIO}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
