import { useEffect, useState, type FormEvent } from 'react'
import {
  listarAusentismos,
  registrarAusentismo,
  subirDocumentoSst,
  type AusentismoDetalle,
  type AusentismoFila,
  type DiagnosticoCie10,
  type TipoAusentismo,
  type TrabajadorSst,
} from '../../lib/api'
import { REGLAS_CON_PRORROGA, textoDiasAusentismo } from '../../lib/ausentismo'
import { formatearFecha, hoyEnBogota } from '../../lib/formato'
import { Aviso, CLASE_BOTON, CLASE_BOTON_SECUNDARIO, CLASE_INPUT, Campo } from '../formulario'
import { SelectorDiagnostico } from './SelectorDiagnostico'

interface Props {
  // Solo los trabajadores y los tipos activos: el servidor rechaza los demás.
  trabajadores: TrabajadorSst[]
  tipos: TipoAusentismo[]
  onRegistrado: (ausentismo: AusentismoDetalle, avisoDelCertificado?: string) => void
  onCancelar: () => void
}

// Registro de una incapacidad o licencia (RF-SST-01 a 03). La liquidación la calcula el servidor con los parámetros legales
// del año; si se equivoca el registro, se anula con motivo y se registra de nuevo (no se edita).
export function FormularioAusentismo({ trabajadores, tipos, onRegistrado, onCancelar }: Props) {
  const [trabajadorId, setTrabajadorId] = useState('')
  const [tipoId, setTipoId] = useState('')
  const [fechaInicio, setFechaInicio] = useState(() => hoyEnBogota())
  const [fechaFin, setFechaFin] = useState(() => hoyEnBogota())
  const [numero, setNumero] = useState('')
  const [esProrroga, setEsProrroga] = useState(false)
  const [anteriorId, setAnteriorId] = useState('')
  const [diasPrevios, setDiasPrevios] = useState('')
  const [diagnostico, setDiagnostico] = useState<DiagnosticoCie10 | null>(null)
  const [observaciones, setObservaciones] = useState('')
  const [certificado, setCertificado] = useState<File | null>(null)
  const [candidatas, setCandidatas] = useState<AusentismoFila[]>([])
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tipo = tipos.find((t) => t.id === tipoId)
  const permiteProrroga = tipo ? REGLAS_CON_PRORROGA.includes(tipo.regla) : false
  const exigeDiagnostico = tipo?.requiereDiagnostico ?? false

  // Las incapacidades anteriores de ese trabajador y de ese tipo, para encadenar una prórroga.
  useEffect(() => {
    if (!esProrroga || !trabajadorId || !tipoId) return
    listarAusentismos({ trabajadorId, tipoId, estado: 'VIGENTES' })
      .then((lista) => setCandidatas(lista.sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio))))
      .catch(() => setCandidatas([]))
  }, [esProrroga, trabajadorId, tipoId])

  // Solo valen mientras se está eligiendo una prórroga de ese trabajador y tipo.
  const anteriores = esProrroga && trabajadorId && tipoId ? candidatas : []

  const dias = fechaInicio && fechaFin && fechaFin >= fechaInicio ? Math.round((Date.parse(fechaFin) - Date.parse(fechaInicio)) / 86_400_000) + 1 : null

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (exigeDiagnostico && !diagnostico) {
      setError('Elige el diagnóstico CIE-10: este tipo de ausentismo lo exige')
      return
    }
    setEnviando(true)
    try {
      const registrado = await registrarAusentismo({
        trabajadorId,
        tipoId,
        fechaInicio,
        fechaFin,
        numeroDocumento: numero.trim() || undefined,
        esProrroga: esProrroga || undefined,
        prorrogaDeId: esProrroga && anteriorId ? anteriorId : undefined,
        diasPrevios: esProrroga && !anteriorId && diasPrevios.trim() !== '' ? Number(diasPrevios) : undefined,
        diagnosticoId: diagnostico?.id,
        observaciones: observaciones.trim() || undefined,
      })
      // El certificado se adjunta aparte: si falla, el ausentismo ya quedó registrado y se puede adjuntar después.
      let aviso: string | undefined
      if (certificado) {
        try {
          await subirDocumentoSst('ausentismo', registrado.id, certificado)
        } catch (err) {
          aviso = `El ausentismo quedó registrado, pero no se pudo adjuntar el certificado: ${err instanceof Error ? err.message : 'error desconocido'}. Puedes adjuntarlo desde su detalle.`
        }
      }
      onRegistrado(registrado, aviso)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el ausentismo')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
      <h3 className="text-base font-semibold text-slate-900">Registrar incapacidad o licencia</h3>
      <Aviso error={error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="aus-trabajador" etiqueta="Trabajador">
          <select id="aus-trabajador" required value={trabajadorId} onChange={(e) => setTrabajadorId(e.target.value)} className={CLASE_INPUT}>
            <option value="">Elige un trabajador…</option>
            {trabajadores.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre} — {t.documento}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="aus-tipo" etiqueta="Tipo de ausentismo" ayuda={tipo ? (tipo.requiereDiagnostico ? 'Este tipo exige el diagnóstico CIE-10.' : 'Este tipo no exige diagnóstico.') : undefined}>
          <select
            id="aus-tipo"
            required
            value={tipoId}
            onChange={(e) => {
              setTipoId(e.target.value)
              setEsProrroga(false)
              setAnteriorId('')
            }}
            className={CLASE_INPUT}
          >
            <option value="">Elige un tipo…</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="aus-inicio" etiqueta="Primer día del ausentismo">
          <input id="aus-inicio" type="date" required value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <Campo id="aus-fin" etiqueta="Último día del ausentismo" ayuda={dias ? `Son ${textoDiasAusentismo(dias)}.` : fechaFin && fechaInicio ? 'La fecha de fin no puede ser anterior a la de inicio.' : undefined}>
          <input id="aus-fin" type="date" required min={fechaInicio} value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <Campo id="aus-numero" etiqueta="N.º de la incapacidad o del certificado (opcional)">
          <input id="aus-numero" maxLength={60} value={numero} onChange={(e) => setNumero(e.target.value)} className={CLASE_INPUT} />
        </Campo>
      </div>

      {permiteProrroga && (
        <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={esProrroga} onChange={(e) => setEsProrroga(e.target.checked)} className="h-4 w-4" />
            Es una prórroga de una incapacidad anterior
          </label>
          {esProrroga && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo id="aus-anterior" etiqueta="Incapacidad que continúa" ayuda="Sus días cuentan para los tramos de pago.">
                <select id="aus-anterior" value={anteriorId} onChange={(e) => setAnteriorId(e.target.value)} className={CLASE_INPUT}>
                  <option value="">{trabajadorId ? 'No está en el sistema (digitaré los días)' : 'Elige primero el trabajador…'}</option>
                  {anteriores.map((a) => (
                    <option key={a.id} value={a.id}>
                      {formatearFecha(a.fechaInicio)} al {formatearFecha(a.fechaFin)} ({textoDiasAusentismo(a.dias)})
                    </option>
                  ))}
                </select>
              </Campo>
              {!anteriorId && (
                <Campo id="aus-previos" etiqueta="Días que llevaba acumulados" ayuda="Los de la incapacidad anterior, si venía de fuera del sistema.">
                  <input id="aus-previos" required inputMode="numeric" pattern="[0-9]+" value={diasPrevios} onChange={(e) => setDiasPrevios(e.target.value)} className={CLASE_INPUT} />
                </Campo>
              )}
            </div>
          )}
        </div>
      )}

      <Campo id="aus-diagnostico" etiqueta={exigeDiagnostico ? 'Diagnóstico CIE-10' : 'Diagnóstico CIE-10 (opcional)'} ayuda="Es un dato de salud (Ley 1581): se guarda aquí, pero solo lo ven las personas con permiso para eso.">
        <SelectorDiagnostico id="aus-diagnostico" valor={diagnostico} onCambio={setDiagnostico} />
      </Campo>

      <Campo id="aus-observaciones" etiqueta="Observaciones (opcional)" ayuda="También son un dato de salud: solo las ven quienes pueden ver diagnósticos.">
        <textarea id="aus-observaciones" rows={2} maxLength={1000} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} className={CLASE_INPUT} />
      </Campo>

      <Campo id="aus-certificado" etiqueta="Certificado de la incapacidad (opcional)" ayuda="PDF, PNG o JPG de hasta 10 MB. Trae el diagnóstico escrito: solo lo abren quienes pueden ver diagnósticos.">
        <input
          id="aus-certificado"
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          onChange={(e) => setCertificado(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
        />
      </Campo>

      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="submit" disabled={enviando} className={`${CLASE_BOTON} w-full sm:w-auto`}>
          {enviando ? 'Registrando…' : 'Registrar ausentismo'}
        </button>
        <button type="button" onClick={onCancelar} className={`${CLASE_BOTON_SECUNDARIO} w-full sm:w-auto`}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
