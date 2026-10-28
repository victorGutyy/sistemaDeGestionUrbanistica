import { useState, type FormEvent } from 'react'
import { registrarEntregaEpp, subirDocumentoSst, type ElementoEpp, type EntregaEpp, type MotivoEntregaEpp, type TrabajadorSst } from '../../lib/api'
import { fechaParaInput, hoyEnBogota } from '../../lib/formato'
import { ETIQUETA_MOTIVO_EPP, MOTIVOS_EPP } from '../../lib/sst'
import { Aviso, CLASE_BOTON, CLASE_BOTON_SECUNDARIO, CLASE_INPUT, Campo } from '../formulario'

interface Props {
  // Solo trabajadores activos y elementos activos: el servidor rechaza los demás.
  trabajadores: TrabajadorSst[]
  elementos: ElementoEpp[]
  // Para una reposición se llega con el trabajador, el elemento y el motivo ya elegidos.
  inicial?: { trabajadorId: string; elementoId: string; motivo: MotivoEntregaEpp }
  onRegistrada: (entrega: EntregaEpp) => void
  onCancelar: () => void
}

// Entrega de un elemento de protección personal a un trabajador (RF-SST-13). La vida útil y la próxima reposición se
// calculan y quedan fijas el día de la entrega; si se equivocan, la entrega se anula con motivo y se registra la correcta.
export function FormularioEntregaEpp({ trabajadores, elementos, inicial, onRegistrada, onCancelar }: Props) {
  const [trabajadorId, setTrabajadorId] = useState(inicial?.trabajadorId ?? '')
  const [elementoId, setElementoId] = useState(inicial?.elementoId ?? '')
  const [fecha, setFecha] = useState(() => hoyEnBogota())
  const [cantidad, setCantidad] = useState('1')
  const [talla, setTalla] = useState('')
  const [motivo, setMotivo] = useState<MotivoEntregaEpp>(inicial?.motivo ?? 'DOTACION_INICIAL')
  const [entregadoPor, setEntregadoPor] = useState('')
  const [firmo, setFirmo] = useState(false)
  const [acta, setActa] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trabajador = trabajadores.find((t) => t.id === trabajadorId)
  const elemento = elementos.find((e) => e.id === elementoId)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      const entrega = await registrarEntregaEpp({
        trabajadorId,
        elementoId,
        fecha,
        cantidad: Number(cantidad),
        tallaReferencia: talla.trim() || undefined,
        motivo,
        entregadoPor: entregadoPor.trim() || undefined,
        firmoRecibido: firmo,
      })
      // El acta se adjunta aparte: si falla, la entrega ya quedó registrada y se puede adjuntar después.
      if (acta) {
        try {
          await subirDocumentoSst('epp/entregas', entrega.id, acta)
        } catch (err) {
          setError(`La entrega quedó registrada, pero no se pudo adjuntar el acta: ${err instanceof Error ? err.message : 'error desconocido'}. Adjúntala desde el detalle de la entrega.`)
          setEnviando(false)
          onRegistrada(entrega)
          return
        }
      }
      onRegistrada(entrega)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la entrega')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
      <h3 className="text-base font-semibold text-slate-900">Registrar entrega de EPP</h3>
      <Aviso error={error} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo id="entrega-trabajador" etiqueta="Trabajador">
          <select id="entrega-trabajador" required value={trabajadorId} onChange={(e) => setTrabajadorId(e.target.value)} className={CLASE_INPUT}>
            <option value="">Elige un trabajador…</option>
            {trabajadores.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre} — {t.documento}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="entrega-elemento" etiqueta="Elemento" ayuda={elemento ? `Vida útil: ${elemento.vidaUtilDias} días.` : undefined}>
          <select id="entrega-elemento" required value={elementoId} onChange={(e) => setElementoId(e.target.value)} className={CLASE_INPUT}>
            <option value="">Elige un elemento…</option>
            {elementos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="entrega-fecha" etiqueta="Fecha de entrega" ayuda="No puede ser futura ni anterior al ingreso del trabajador.">
          <input id="entrega-fecha" type="date" required max={hoyEnBogota()} min={trabajador ? fechaParaInput(trabajador.fechaIngreso) : undefined} value={fecha} onChange={(e) => setFecha(e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <Campo id="entrega-cantidad" etiqueta="Cantidad">
          <input id="entrega-cantidad" type="number" required min={1} max={1000} value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <Campo id="entrega-talla" etiqueta="Talla o referencia (opcional)">
          <input id="entrega-talla" maxLength={30} value={talla} onChange={(e) => setTalla(e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <Campo id="entrega-motivo" etiqueta="Motivo">
          <select id="entrega-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoEntregaEpp)} className={CLASE_INPUT}>
            {MOTIVOS_EPP.map((m) => (
              <option key={m} value={m}>
                {ETIQUETA_MOTIVO_EPP[m]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="entrega-entregado-por" etiqueta="Quién entrega (opcional)" ayuda="Si lo dejas vacío, queda quien registra.">
          <input id="entrega-entregado-por" maxLength={120} value={entregadoPor} onChange={(e) => setEntregadoPor(e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <Campo id="entrega-acta" etiqueta="Acta firmada (opcional)" ayuda="PDF, PNG o JPG de hasta 10 MB.">
          <input
            id="entrega-acta"
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            onChange={(e) => setActa(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
          />
        </Campo>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={firmo} onChange={(e) => setFirmo(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
        El trabajador ya firmó el recibido
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="submit" disabled={enviando} className={CLASE_BOTON}>
          {enviando ? 'Guardando…' : 'Registrar entrega'}
        </button>
        <button type="button" onClick={onCancelar} className={CLASE_BOTON_SECUNDARIO}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
