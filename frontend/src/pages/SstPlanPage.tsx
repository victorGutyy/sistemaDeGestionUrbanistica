import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Aviso, CLASE_BOTON, CLASE_BOTON_SECUNDARIO, CLASE_INPUT, Insignia, Seccion } from '../components/formulario'
import { AdjuntosSst } from '../components/sst/AdjuntosSst'
import { FormularioActividad } from '../components/sst/FormularioActividad'
import { useAuth } from '../contexts/AuthContext'
import { copiarPlanTrabajo, listarDocumentosSst, obtenerPlanTrabajo, type ActividadPlan, type DocumentoSst, type EstadoActividadSst, type RespuestaPlan } from '../lib/api'
import { formatearCOP, formatearFecha } from '../lib/formato'
import { PERMISOS } from '../lib/permisos'
import { ESTADOS_ACTIVIDAD, ETIQUETA_ALERTA, ETIQUETA_CICLO, ETIQUETA_ESTADO_ACTIVIDAD, formatearPorcentajeSst, MESES_CORTOS, textoDias, TONO_ALERTA, TONO_ESTADO_ACTIVIDAD } from '../lib/sst'

function Tarjeta({ titulo, valor, detalle, alerta }: { titulo: string; valor: string; detalle?: string; alerta?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${alerta ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <p className="text-xs text-slate-500">{titulo}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{valor}</p>
      {detalle && <p className="text-xs text-slate-500">{detalle}</p>}
    </div>
  )
}

// Un mes del cronograma: marcado si la actividad está programada en él. Se pinta según cómo va la actividad.
function CeldaMes({ marcada, actividad, mes }: { marcada: boolean; actividad: ActividadPlan; mes: number }) {
  if (!marcada) return <td className="border-l border-slate-100 px-0 py-2" aria-label={`${MESES_CORTOS[mes]}: sin programar`} />
  const color =
    actividad.alerta === 'VENCIDA' ? 'bg-red-400' : actividad.estado === 'EJECUTADA' ? 'bg-green-500' : actividad.estado === 'EN_EJECUCION' ? 'bg-blue-500' : actividad.estado === 'CANCELADA' ? 'bg-slate-300' : 'bg-slate-400'
  return (
    <td className="border-l border-slate-100 px-0.5 py-2" aria-label={`${MESES_CORTOS[mes]}: programada`}>
      <div className={`mx-auto h-3 w-full min-w-[0.9rem] rounded-sm ${color}`} />
    </td>
  )
}

function DetalleActividad({ actividad, puedeGestionar }: { actividad: ActividadPlan; puedeGestionar: boolean }) {
  const [documentos, setDocumentos] = useState<DocumentoSst[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(() => {
    listarDocumentosSst('plan', actividad.id)
      .then(setDocumentos)
      .catch((err: Error) => setError(err.message))
  }, [actividad.id])

  useEffect(cargar, [cargar])

  return (
    <div className="space-y-3 bg-slate-50 px-4 py-3">
      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-slate-500">Estándar (Res. 0312)</dt>
          <dd>{actividad.estandar}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Meta</dt>
          <dd>{actividad.meta}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Responsable</dt>
          <dd>
            {actividad.responsable}
            <span className="block text-xs text-slate-500">{actividad.correoResponsable}</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Recursos</dt>
          <dd>{actividad.recursos ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Presupuesto</dt>
          <dd>{formatearCOP(actividad.presupuesto)}</dd>
        </div>
      </dl>
      <div>
        <p className="mb-1 text-sm font-medium text-slate-800">Evidencias</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <AdjuntosSst ruta="plan" registroId={actividad.id} documentos={documentos ?? []} puedeAdjuntar={puedeGestionar} onCambio={cargar} etiquetaAdjuntar="Adjuntar evidencia" />
      </div>
    </div>
  )
}

// Pestaña del plan de trabajo anual (RF-SST-15, 16 y 17): actividades con su cronograma mensual, su alerta y su avance.
export function SstPlanPage() {
  const { tiene } = useAuth()
  const puedeGestionar = tiene(PERMISOS.SST_GESTIONAR)

  const [anio, setAnio] = useState(() => new Date().getFullYear())
  const [filtroEstado, setFiltroEstado] = useState<EstadoActividadSst | ''>('')
  const [plan, setPlan] = useState<RespuestaPlan | null>(null)
  const [formulario, setFormulario] = useState<ActividadPlan | 'nueva' | null>(null)
  const [abierta, setAbierta] = useState<string | null>(null)
  const [copiando, setCopiando] = useState(false)
  const [anioOrigen, setAnioOrigen] = useState('')
  const [enviandoCopia, setEnviandoCopia] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const cargar = useCallback(() => {
    obtenerPlanTrabajo({ anio, estado: filtroEstado || undefined })
      .then((respuesta) => {
        setPlan(respuesta)
        setError(null)
      })
      .catch((err: Error) => setError(err.message))
  }, [anio, filtroEstado])

  useEffect(cargar, [cargar])

  async function copiar(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setOk(null)
    setEnviandoCopia(true)
    try {
      const r = await copiarPlanTrabajo(Number(anioOrigen), anio)
      setOk(`Se copiaron ${r.copiadas} actividad${r.copiadas === 1 ? '' : 'es'} de ${r.anioOrigen} como borrador${r.canceladasOmitidas > 0 ? ` (${r.canceladasOmitidas} cancelada${r.canceladasOmitidas === 1 ? '' : 's'} no se copiaron)` : ''}.`)
      setCopiando(false)
      cargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo copiar el plan')
    } finally {
      setEnviandoCopia(false)
    }
  }

  const sinActividades = plan !== null && plan.resumen.total === 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="anio-plan" className="block text-xs text-slate-500">
            Año del plan
          </label>
          <div className="mt-1 flex items-center gap-1">
            <button type="button" aria-label="Año anterior" className={CLASE_BOTON_SECUNDARIO} onClick={() => setAnio(anio - 1)}>
              ‹
            </button>
            <input id="anio-plan" type="number" min={2000} max={2100} value={anio} onChange={(e) => setAnio(Number(e.target.value) || anio)} className="w-24 rounded-md border border-slate-300 px-2 py-2 text-center text-sm" />
            <button type="button" aria-label="Año siguiente" className={CLASE_BOTON_SECUNDARIO} onClick={() => setAnio(anio + 1)}>
              ›
            </button>
          </div>
        </div>
        <select aria-label="Filtrar por estado" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as EstadoActividadSst | '')} className="rounded-md border border-slate-300 px-2 py-2 text-sm">
          <option value="">Todos los estados</option>
          {ESTADOS_ACTIVIDAD.map((e) => (
            <option key={e} value={e}>
              {ETIQUETA_ESTADO_ACTIVIDAD[e]}
            </option>
          ))}
        </select>
        {puedeGestionar && (
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <button type="button" className={CLASE_BOTON} onClick={() => { setOk(null); setFormulario('nueva') }}>
              Nueva actividad
            </button>
            <button type="button" className={CLASE_BOTON_SECUNDARIO} onClick={() => { setOk(null); setCopiando(!copiando); setAnioOrigen(String(anio - 1)) }}>
              Copiar de otro año
            </button>
          </div>
        )}
      </div>

      <Aviso error={error} ok={ok} />

      {copiando && (
        <form onSubmit={copiar} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-end">
          <div>
            <label htmlFor="anio-origen" className="block text-sm font-medium text-slate-700">
              Copiar el plan de
            </label>
            <input id="anio-origen" type="number" required min={2000} max={2100} value={anioOrigen} onChange={(e) => setAnioOrigen(e.target.value)} className={`${CLASE_INPUT} sm:w-32`} />
          </div>
          <p className="flex-1 text-sm text-slate-600">
            a {anio} como borrador: las fechas se mueven al nuevo año, todo queda "programada" y sin avance, y las canceladas no se copian. Solo se puede copiar sobre un año sin actividades.
          </p>
          <button type="submit" disabled={enviandoCopia} className={CLASE_BOTON}>
            {enviandoCopia ? 'Copiando…' : 'Copiar'}
          </button>
        </form>
      )}

      {formulario && (
        <FormularioActividad
          anio={anio}
          inicial={formulario === 'nueva' ? undefined : formulario}
          onGuardada={() => {
            setFormulario(null)
            setOk('Actividad guardada.')
            cargar()
          }}
          onCancelar={() => setFormulario(null)}
        />
      )}

      {plan && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tarjeta titulo="Cumplimiento" valor={formatearPorcentajeSst(plan.resumen.cumplimiento)} detalle={`${plan.resumen.porEstado.EJECUTADA} de ${plan.resumen.total - plan.resumen.porEstado.CANCELADA} ejecutadas`} />
          <Tarjeta titulo="Avance promedio" valor={formatearPorcentajeSst(plan.resumen.avancePromedio)} />
          <Tarjeta titulo="Vencidas" valor={String(plan.actividades.filter((a) => a.alerta === 'VENCIDA').length)} alerta={plan.actividades.some((a) => a.alerta === 'VENCIDA')} />
          <Tarjeta titulo={`Próximas (${plan.diasAlerta} días)`} valor={String(plan.actividades.filter((a) => a.alerta === 'PROXIMA').length)} alerta={plan.actividades.some((a) => a.alerta === 'PROXIMA')} />
        </div>
      )}

      <Seccion titulo={`Plan de trabajo ${anio}`} descripcion="Cada actividad con su cronograma mensual: azul en ejecución, verde ejecutada, rojo vencida, gris programada.">
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[62rem] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Actividad</th>
                <th className="px-3 py-2 font-medium">Fechas</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Avance</th>
                {MESES_CORTOS.map((mes) => (
                  <th key={mes} className="border-l border-slate-100 px-0.5 py-2 text-center text-xs font-medium">
                    {mes}
                  </th>
                ))}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {sinActividades && (
                <tr>
                  <td colSpan={17} className="px-3 py-10 text-center text-slate-400">
                    Todavía no hay actividades en el plan de {anio}.
                    {puedeGestionar && ' Crea la primera o copia el plan de otro año.'}
                  </td>
                </tr>
              )}
              {plan && !sinActividades && plan.actividades.length === 0 && (
                <tr>
                  <td colSpan={17} className="px-3 py-8 text-center text-slate-400">
                    Ninguna actividad tiene ese estado.
                  </td>
                </tr>
              )}
              {plan?.actividades.map((a) => (
                <FragmentoActividad key={a.id} actividad={a} abierta={abierta === a.id} onAlternar={() => setAbierta(abierta === a.id ? null : a.id)} puedeGestionar={puedeGestionar} onEditar={() => { setOk(null); setFormulario(a) }} />
              ))}
            </tbody>
          </table>
        </div>
      </Seccion>
    </div>
  )
}

function FragmentoActividad({ actividad: a, abierta, onAlternar, puedeGestionar, onEditar }: { actividad: ActividadPlan; abierta: boolean; onAlternar: () => void; puedeGestionar: boolean; onEditar: () => void }) {
  return (
    <>
      <tr className="border-b border-slate-100 align-top">
        <td className="px-3 py-2">
          <p className="text-xs text-slate-500">{ETIQUETA_CICLO[a.ciclo]}</p>
          <p className="font-medium text-slate-900">{a.actividad}</p>
          <p className="text-xs text-slate-500">{a.responsable}</p>
        </td>
        <td className="whitespace-nowrap px-3 py-2">
          {formatearFecha(a.fechaInicio)}
          <span className="block text-xs text-slate-500">a {formatearFecha(a.fechaFin)}</span>
        </td>
        <td className="px-3 py-2">
          <Insignia tono={TONO_ESTADO_ACTIVIDAD[a.estado]}>{ETIQUETA_ESTADO_ACTIVIDAD[a.estado]}</Insignia>
          {a.alerta !== 'SIN_ALERTA' && a.alerta !== 'AL_DIA' && (
            <span className="mt-1 block">
              <Insignia tono={TONO_ALERTA[a.alerta]}>
                {ETIQUETA_ALERTA[a.alerta]}
                {a.diasRestantes !== null && ` · ${textoDias(a.diasRestantes)}`}
              </Insignia>
            </span>
          )}
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="h-2 w-16 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={a.porcentajeAvance} aria-valuemin={0} aria-valuemax={100}>
              <div className={`h-full ${a.porcentajeAvance === 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${a.porcentajeAvance}%` }} />
            </div>
            <span className="text-xs text-slate-600">{a.porcentajeAvance} %</span>
          </div>
        </td>
        {a.meses.map((marcada, mes) => (
          <CeldaMes key={mes} marcada={marcada} actividad={a} mes={mes} />
        ))}
        <td className="whitespace-nowrap px-3 py-2 text-right">
          {puedeGestionar && (
            <button type="button" className="mr-3 text-sm text-blue-600 hover:underline" onClick={onEditar}>
              Editar
            </button>
          )}
          <button type="button" className="text-sm text-blue-600 hover:underline" onClick={onAlternar} aria-expanded={abierta}>
            {abierta ? 'Ocultar' : 'Detalle'}
            {(a._count?.documentos ?? 0) > 0 && !abierta && ` (${a._count?.documentos})`}
          </button>
        </td>
      </tr>
      {abierta && (
        <tr className="border-b border-slate-100">
          <td colSpan={17} className="p-0">
            <DetalleActividad actividad={a} puedeGestionar={puedeGestionar} />
          </td>
        </tr>
      )}
    </>
  )
}
