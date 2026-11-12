import { useState, type FormEvent } from 'react'
import { crearAcuerdoPago, finalizarAcuerdoPago, type AcuerdoPago } from '../lib/api'
import { formatearFecha, hoyEnBogota } from '../lib/formato'
import { Aviso, CLASE_BOTON, CLASE_BOTON_SECUNDARIO, CLASE_INPUT, Campo } from './formulario'

interface Props {
  ventaId: string
  acuerdos: AcuerdoPago[]
  // Quien tiene el permiso de acuerdos puede registrar y finalizar; los demás solo lo ven.
  puedeGestionar: boolean
  // Solo una venta activa y financiada puede tener acuerdo.
  admiteAcuerdo: boolean
  // Se llama después de registrar o finalizar, para recargar la venta (el interés y los avisos cambian).
  onCambio: () => void
}

const ETIQUETA_ESTADO: Record<AcuerdoPago['estado'], string> = {
  VIGENTE: 'Vigente',
  PROGRAMADO: 'Programado',
  FINALIZADO: 'Finalizado',
}

const CLASE_ESTADO: Record<AcuerdoPago['estado'], string> = {
  VIGENTE: 'bg-amber-100 text-amber-800',
  PROGRAMADO: 'bg-blue-100 text-blue-700',
  FINALIZADO: 'bg-slate-100 text-slate-600',
}

function periodo(acuerdo: AcuerdoPago) {
  const hasta = acuerdo.finalizadoEn ? `hasta el ${formatearFecha(acuerdo.finalizadoEn)} (finalizado)` : acuerdo.hastaPrevista ? `hasta el ${formatearFecha(acuerdo.hastaPrevista)}` : 'sin fecha final'
  return `Desde el ${formatearFecha(acuerdo.desde)}, ${hasta}`
}

// Acuerdo de pago de una venta (CC-07): arreglo con el cliente (por ejemplo, dejar algunas cuotas para el final). Mientras
// está vigente no se envían recordatorios ni avisos de mora y no se causa interés de mora; la deuda y los días de atraso
// siguen contándose. Al terminar, el interés vuelve a contarse solo desde ese día.
export function TarjetaAcuerdoPago({ ventaId, acuerdos, puedeGestionar, admiteAcuerdo, onCambio }: Props) {
  const activo = acuerdos.find((a) => a.estado === 'VIGENTE') ?? acuerdos.find((a) => a.estado === 'PROGRAMADO') ?? null
  const historial = acuerdos.filter((a) => a.id !== activo?.id)
  const puedeRegistrar = puedeGestionar && admiteAcuerdo && !activo

  const [formulario, setFormulario] = useState<'registrar' | 'finalizar' | null>(null)
  const [motivo, setMotivo] = useState('')
  const [desde, setDesde] = useState(() => hoyEnBogota())
  const [hasta, setHasta] = useState('')
  const [motivoFin, setMotivoFin] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (acuerdos.length === 0 && !puedeRegistrar) return null

  function cerrar() {
    setFormulario(null)
    setError(null)
    setMotivo('')
    setHasta('')
    setMotivoFin('')
    setDesde(hoyEnBogota())
  }

  async function handleRegistrar(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (
      !window.confirm(
        'Mientras el acuerdo esté vigente, esta venta NO recibirá recordatorios ni avisos de mora y NO se causará interés de mora. ¿Registrar el acuerdo?',
      )
    ) {
      return
    }
    setEnviando(true)
    try {
      await crearAcuerdoPago(ventaId, { motivo: motivo.trim(), desde: desde || undefined, hasta: hasta || undefined })
      cerrar()
      onCambio()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el acuerdo')
    } finally {
      setEnviando(false)
    }
  }

  async function handleFinalizar(event: FormEvent) {
    event.preventDefault()
    if (!activo) return
    setError(null)
    if (!window.confirm('Desde hoy se reanudan los avisos y el interés de mora vuelve a contarse. ¿Finalizar el acuerdo?')) return
    setEnviando(true)
    try {
      await finalizarAcuerdoPago(ventaId, activo.id, motivoFin.trim() || undefined)
      cerrar()
      onCambio()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo finalizar el acuerdo')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">Acuerdo de pago</h2>
          <p className="text-xs text-slate-500">
            Para arreglos con el cliente (por ejemplo, dejar algunas cuotas para el final): pausa los avisos y el interés de mora.
          </p>
        </div>
        {puedeRegistrar && formulario === null && (
          <button type="button" onClick={() => setFormulario('registrar')} className={CLASE_BOTON_SECUNDARIO}>
            Registrar acuerdo
          </button>
        )}
      </div>

      {activo && (
        <div className={`mt-3 rounded-md border px-3 py-3 text-sm ${activo.estado === 'VIGENTE' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-blue-200 bg-blue-50 text-blue-900'}`}>
          <p className="flex flex-wrap items-center gap-2 font-medium">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CLASE_ESTADO[activo.estado]}`}>{ETIQUETA_ESTADO[activo.estado]}</span>
            {periodo(activo)}
          </p>
          <p className="mt-1">Motivo: {activo.motivo}</p>
          <p className="mt-1 text-xs opacity-80">
            Registrado por {activo.creadoPor.nombre}.{' '}
            {activo.estado === 'VIGENTE'
              ? 'Mientras dure: no se envían recordatorios ni avisos de mora y no se causa interés de mora. La deuda y los días de atraso siguen contándose.'
              : 'Empieza más adelante: hasta entonces la venta sigue con sus avisos normales.'}
          </p>
          {puedeGestionar && formulario === null && (
            <button type="button" onClick={() => setFormulario('finalizar')} className={`${CLASE_BOTON_SECUNDARIO} mt-2 bg-white`}>
              {activo.estado === 'VIGENTE' ? 'Finalizar acuerdo' : 'Cancelar acuerdo'}
            </button>
          )}
        </div>
      )}

      {formulario === 'registrar' && (
        <form onSubmit={handleRegistrar} className="mt-3 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <Aviso error={error} />
          <Campo id="acuerdo-motivo" etiqueta="¿Qué se acordó con el cliente?" ayuda="Queda escrito para quien revise después. Mínimo 10 caracteres.">
            <textarea
              id="acuerdo-motivo"
              required
              minLength={10}
              maxLength={500}
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. Acuerdo verbal: las últimas 3 cuotas se pagan al final del plan"
              className={CLASE_INPUT}
            />
          </Campo>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo id="acuerdo-desde" etiqueta="Desde">
              <input id="acuerdo-desde" type="date" required value={desde} onChange={(e) => setDesde(e.target.value)} className={CLASE_INPUT} />
            </Campo>
            <Campo id="acuerdo-hasta" etiqueta="Hasta (opcional)" ayuda="Último día del acuerdo. Al día siguiente se reanudan los avisos y el interés. Sin fecha, sigue hasta que lo finalices.">
              <input id="acuerdo-hasta" type="date" min={desde || undefined} value={hasta} onChange={(e) => setHasta(e.target.value)} className={CLASE_INPUT} />
            </Campo>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={enviando} className={CLASE_BOTON}>
              {enviando ? 'Guardando...' : 'Registrar acuerdo'}
            </button>
            <button type="button" onClick={cerrar} disabled={enviando} className={CLASE_BOTON_SECUNDARIO}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {formulario === 'finalizar' && activo && (
        <form onSubmit={handleFinalizar} className="mt-3 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <Aviso error={error} />
          <Campo id="acuerdo-motivo-fin" etiqueta="Motivo (opcional)" ayuda="Por ejemplo: el cliente se puso al día o se rompió el acuerdo.">
            <input id="acuerdo-motivo-fin" maxLength={500} value={motivoFin} onChange={(e) => setMotivoFin(e.target.value)} className={CLASE_INPUT} />
          </Campo>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={enviando} className={CLASE_BOTON}>
              {enviando ? 'Guardando...' : activo.estado === 'VIGENTE' ? 'Finalizar acuerdo' : 'Cancelar acuerdo'}
            </button>
            <button type="button" onClick={cerrar} disabled={enviando} className={CLASE_BOTON_SECUNDARIO}>
              Volver
            </button>
          </div>
        </form>
      )}

      {historial.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-slate-500">Historial de acuerdos</p>
          <ul className="mt-1 divide-y divide-slate-100 text-sm">
            {historial.map((acuerdo) => (
              <li key={acuerdo.id} className="py-2">
                <p className="text-slate-700">{periodo(acuerdo)}</p>
                <p className="text-xs text-slate-500">
                  {acuerdo.motivo} · Registrado por {acuerdo.creadoPor.nombre}
                  {acuerdo.finalizadoPor ? ` · Finalizado por ${acuerdo.finalizadoPor.nombre}${acuerdo.motivoFin ? `: ${acuerdo.motivoFin}` : ''}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
