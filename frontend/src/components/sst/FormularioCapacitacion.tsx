import { useState, type FormEvent } from 'react'
import {
  actualizarCapacitacion,
  crearCapacitacion,
  type Capacitacion,
  type CapacitacionDetalle,
  type EjecutorCapacitacion,
  type EstadoActividadSst,
  type ModalidadCapacitacion,
} from '../../lib/api'
import { fechaParaInput } from '../../lib/formato'
import { aNumero } from '../../lib/seguridadSocial'
import { EJECUTORES, ESTADOS_ACTIVIDAD, ETIQUETA_EJECUTOR, ETIQUETA_ESTADO_ACTIVIDAD, ETIQUETA_MODALIDAD, MODALIDADES } from '../../lib/sst'
import { Aviso, CLASE_BOTON, CLASE_BOTON_SECUNDARIO, CLASE_INPUT, Campo } from '../formulario'

interface Props {
  // Con una capacitación, el formulario la edita; sin ella, crea una nueva.
  inicial?: Capacitacion | CapacitacionDetalle
  onGuardada: (capacitacion: Capacitacion) => void
  onCancelar: () => void
}

const textoNumero = (valor: string | number | null | undefined) => (valor === null || valor === undefined ? '' : String(Number(valor)).replace('.', ','))

// Capacitación del plan de capacitación (RF-SST-18). Una capacitación ejecutada exige su fecha de ejecución. El facilitador
// recibe por correo el aviso cuando la capacitación está próxima o sin ejecutar.
export function FormularioCapacitacion({ inicial, onGuardada, onCancelar }: Props) {
  const [tema, setTema] = useState(inicial?.tema ?? '')
  const [objetivo, setObjetivo] = useState(inicial?.objetivo ?? '')
  const [dirigidoA, setDirigidoA] = useState(inicial?.dirigidoA ?? '')
  const [modalidad, setModalidad] = useState<ModalidadCapacitacion>(inicial?.modalidad ?? 'PRESENCIAL')
  const [horas, setHoras] = useState(textoNumero(inicial?.horas))
  const [fechaProgramada, setFechaProgramada] = useState(inicial ? fechaParaInput(inicial.fechaProgramada) : '')
  const [fechaEjecucion, setFechaEjecucion] = useState(inicial ? fechaParaInput(inicial.fechaEjecucion) : '')
  const [responsable, setResponsable] = useState(inicial?.responsable ?? '')
  const [correo, setCorreo] = useState(inicial?.correoResponsable ?? '')
  const [ejecutor, setEjecutor] = useState<EjecutorCapacitacion>(inicial?.ejecutor ?? 'INTERNO')
  const [programados, setProgramados] = useState(String(inicial?.asistentesProgramados ?? ''))
  const [estado, setEstado] = useState<EstadoActividadSst>(inicial?.estado ?? 'PROGRAMADA')
  const [eficacia, setEficacia] = useState(textoNumero(inicial?.evaluacionEficacia))
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ejecutada = estado === 'EJECUTADA'

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      const datos = {
        tema: tema.trim(),
        objetivo: objetivo.trim(),
        dirigidoA: dirigidoA.trim(),
        modalidad,
        horas: aNumero(horas),
        fechaProgramada,
        fechaEjecucion: fechaEjecucion || undefined,
        responsable: responsable.trim(),
        correoResponsable: correo.trim(),
        ejecutor,
        asistentesProgramados: Number(programados),
        estado,
        evaluacionEficacia: eficacia.trim() === '' ? undefined : aNumero(eficacia),
      }
      onGuardada(inicial ? await actualizarCapacitacion(inicial.id, datos) : await crearCapacitacion(datos))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la capacitación')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
      <h3 className="text-base font-semibold text-slate-900">{inicial ? 'Editar capacitación' : 'Nueva capacitación'}</h3>
      <Aviso error={error} />
      <Campo id="cap-tema" etiqueta="Tema">
        <input id="cap-tema" required minLength={3} maxLength={200} value={tema} onChange={(e) => setTema(e.target.value)} className={CLASE_INPUT} />
      </Campo>
      <Campo id="cap-objetivo" etiqueta="Objetivo" ayuda="Qué se espera lograr.">
        <input id="cap-objetivo" required minLength={3} maxLength={300} value={objetivo} onChange={(e) => setObjetivo(e.target.value)} className={CLASE_INPUT} />
      </Campo>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo id="cap-dirigido" etiqueta="Dirigido a" ayuda="Áreas o cargos.">
          <input id="cap-dirigido" required minLength={2} maxLength={120} value={dirigidoA} onChange={(e) => setDirigidoA(e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <Campo id="cap-modalidad" etiqueta="Modalidad">
          <select id="cap-modalidad" value={modalidad} onChange={(e) => setModalidad(e.target.value as ModalidadCapacitacion)} className={CLASE_INPUT}>
            {MODALIDADES.map((m) => (
              <option key={m} value={m}>
                {ETIQUETA_MODALIDAD[m]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="cap-horas" etiqueta="Horas">
          <input id="cap-horas" required inputMode="decimal" value={horas} onChange={(e) => setHoras(e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <Campo id="cap-programados" etiqueta="Asistentes programados" ayuda="Personas convocadas.">
          <input id="cap-programados" type="number" required min={0} max={1000} value={programados} onChange={(e) => setProgramados(e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <Campo id="cap-fecha" etiqueta="Fecha programada">
          <input id="cap-fecha" type="date" required value={fechaProgramada} onChange={(e) => setFechaProgramada(e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <Campo id="cap-ejecucion" etiqueta={ejecutada ? 'Fecha de ejecución' : 'Fecha de ejecución (si ya se dictó)'} ayuda={ejecutada ? 'Obligatoria: la capacitación está ejecutada.' : undefined}>
          <input id="cap-ejecucion" type="date" required={ejecutada} value={fechaEjecucion} onChange={(e) => setFechaEjecucion(e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <Campo id="cap-responsable" etiqueta="Facilitador o responsable">
          <input id="cap-responsable" required minLength={2} maxLength={80} value={responsable} onChange={(e) => setResponsable(e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <Campo id="cap-correo" etiqueta="Correo del facilitador" ayuda="Aquí llegan los recordatorios.">
          <input id="cap-correo" type="email" required maxLength={120} value={correo} onChange={(e) => setCorreo(e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <Campo id="cap-ejecutor" etiqueta="Ejecutor">
          <select id="cap-ejecutor" value={ejecutor} onChange={(e) => setEjecutor(e.target.value as EjecutorCapacitacion)} className={CLASE_INPUT}>
            {EJECUTORES.map((x) => (
              <option key={x} value={x}>
                {ETIQUETA_EJECUTOR[x]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="cap-estado" etiqueta="Estado">
          <select id="cap-estado" value={estado} onChange={(e) => setEstado(e.target.value as EstadoActividadSst)} className={CLASE_INPUT}>
            {ESTADOS_ACTIVIDAD.map((e) => (
              <option key={e} value={e}>
                {ETIQUETA_ESTADO_ACTIVIDAD[e]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="cap-eficacia" etiqueta="Evaluación de eficacia (1 a 5, opcional)">
          <input id="cap-eficacia" inputMode="decimal" value={eficacia} onChange={(e) => setEficacia(e.target.value)} className={CLASE_INPUT} />
        </Campo>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="submit" disabled={enviando} className={CLASE_BOTON}>
          {enviando ? 'Guardando…' : inicial ? 'Guardar cambios' : 'Crear capacitación'}
        </button>
        <button type="button" onClick={onCancelar} className={CLASE_BOTON_SECUNDARIO}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
