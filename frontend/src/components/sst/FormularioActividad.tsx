import { useState, type FormEvent } from 'react'
import { actualizarActividadPlan, crearActividadPlan, type ActividadPlan, type CicloPhva, type EstadoActividadSst } from '../../lib/api'
import { fechaParaInput } from '../../lib/formato'
import { pesosATexto } from '../../lib/seguridadSocial'
import { CICLOS_PHVA, ESTADOS_ACTIVIDAD, ETIQUETA_CICLO, ETIQUETA_ESTADO_ACTIVIDAD } from '../../lib/sst'
import { Aviso, CLASE_BOTON, CLASE_BOTON_SECUNDARIO, CLASE_INPUT, Campo } from '../formulario'

interface Props {
  anio: number
  // Con una actividad, el formulario la edita; sin ella, crea una nueva.
  inicial?: ActividadPlan
  onGuardada: (actividad: ActividadPlan) => void
  onCancelar: () => void
}

// Actividad del plan de trabajo anual (RF-SST-15). Las dos fechas deben caer dentro del año del plan. El responsable recibe
// por correo el aviso cuando la actividad está próxima o vencida.
export function FormularioActividad({ anio, inicial, onGuardada, onCancelar }: Props) {
  const [ciclo, setCiclo] = useState<CicloPhva>(inicial?.ciclo ?? 'PLANEAR')
  const [estandar, setEstandar] = useState(inicial?.estandar ?? '')
  const [actividad, setActividad] = useState(inicial?.actividad ?? '')
  const [meta, setMeta] = useState(inicial?.meta ?? '')
  const [responsable, setResponsable] = useState(inicial?.responsable ?? '')
  const [correo, setCorreo] = useState(inicial?.correoResponsable ?? '')
  const [fechaInicio, setFechaInicio] = useState(inicial ? fechaParaInput(inicial.fechaInicio) : '')
  const [fechaFin, setFechaFin] = useState(inicial ? fechaParaInput(inicial.fechaFin) : '')
  const [recursos, setRecursos] = useState(inicial?.recursos ?? '')
  const [presupuesto, setPresupuesto] = useState(inicial?.presupuesto ? String(Number(inicial.presupuesto)) : '')
  const [estado, setEstado] = useState<EstadoActividadSst>(inicial?.estado ?? 'PROGRAMADA')
  const [avance, setAvance] = useState(String(inicial?.porcentajeAvance ?? 0))
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ejecutada = estado === 'EJECUTADA'

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      const datos = {
        ciclo,
        estandar: estandar.trim(),
        actividad: actividad.trim(),
        meta: meta.trim(),
        responsable: responsable.trim(),
        correoResponsable: correo.trim(),
        fechaInicio,
        fechaFin,
        estado,
        porcentajeAvance: ejecutada ? 100 : Number(avance),
      }
      // Al crear, lo vacío se omite; al editar, un texto vacío borra el dato.
      const guardada = inicial
        ? await actualizarActividadPlan(inicial.id, { ...datos, recursos: recursos.trim(), presupuesto: pesosATexto(presupuesto) })
        : await crearActividadPlan(anio, { ...datos, recursos: recursos.trim() || undefined, presupuesto: pesosATexto(presupuesto) || undefined })
      onGuardada(guardada)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la actividad')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
      <h3 className="text-base font-semibold text-slate-900">{inicial ? 'Editar actividad' : `Nueva actividad del plan ${anio}`}</h3>
      <Aviso error={error} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo id="act-ciclo" etiqueta="Ciclo PHVA">
          <select id="act-ciclo" value={ciclo} onChange={(e) => setCiclo(e.target.value as CicloPhva)} className={CLASE_INPUT}>
            {CICLOS_PHVA.map((c) => (
              <option key={c} value={c}>
                {ETIQUETA_CICLO[c]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="act-estandar" etiqueta="Estándar o componente (Resolución 0312)">
          <input id="act-estandar" required minLength={2} maxLength={120} value={estandar} onChange={(e) => setEstandar(e.target.value)} className={CLASE_INPUT} />
        </Campo>
      </div>
      <Campo id="act-actividad" etiqueta="Actividad">
        <input id="act-actividad" required minLength={3} maxLength={300} value={actividad} onChange={(e) => setActividad(e.target.value)} className={CLASE_INPUT} />
      </Campo>
      <Campo id="act-meta" etiqueta="Meta o indicador" ayuda="Un resultado esperado que se pueda medir.">
        <input id="act-meta" required minLength={2} maxLength={200} value={meta} onChange={(e) => setMeta(e.target.value)} className={CLASE_INPUT} />
      </Campo>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo id="act-responsable" etiqueta="Responsable">
          <input id="act-responsable" required minLength={2} maxLength={80} value={responsable} onChange={(e) => setResponsable(e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <Campo id="act-correo" etiqueta="Correo del responsable" ayuda="Aquí llegan los recordatorios de la actividad.">
          <input id="act-correo" type="email" required maxLength={120} value={correo} onChange={(e) => setCorreo(e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <Campo id="act-inicio" etiqueta="Fecha de inicio">
          <input id="act-inicio" type="date" required min={`${anio}-01-01`} max={`${anio}-12-31`} value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <Campo id="act-fin" etiqueta="Fecha de fin" ayuda={`Dentro de ${anio}.`}>
          <input id="act-fin" type="date" required min={fechaInicio || `${anio}-01-01`} max={`${anio}-12-31`} value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <Campo id="act-recursos" etiqueta="Recursos (opcional)" ayuda="Humanos, técnicos, financieros.">
          <input id="act-recursos" maxLength={200} value={recursos} onChange={(e) => setRecursos(e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <Campo id="act-presupuesto" etiqueta="Presupuesto en pesos (opcional)">
          <input id="act-presupuesto" inputMode="decimal" value={presupuesto} onChange={(e) => setPresupuesto(e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <Campo id="act-estado" etiqueta="Estado">
          <select id="act-estado" value={estado} onChange={(e) => setEstado(e.target.value as EstadoActividadSst)} className={CLASE_INPUT}>
            {ESTADOS_ACTIVIDAD.map((e) => (
              <option key={e} value={e}>
                {ETIQUETA_ESTADO_ACTIVIDAD[e]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="act-avance" etiqueta="Avance (%)" ayuda={ejecutada ? 'Una actividad ejecutada queda en 100 %.' : undefined}>
          <input id="act-avance" type="number" min={0} max={100} required disabled={ejecutada} value={ejecutada ? '100' : avance} onChange={(e) => setAvance(e.target.value)} className={`${CLASE_INPUT} disabled:bg-slate-100`} />
        </Campo>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="submit" disabled={enviando} className={CLASE_BOTON}>
          {enviando ? 'Guardando…' : inicial ? 'Guardar cambios' : 'Crear actividad'}
        </button>
        <button type="button" onClick={onCancelar} className={CLASE_BOTON_SECUNDARIO}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
