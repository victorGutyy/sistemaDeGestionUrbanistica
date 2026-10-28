import { useEffect, useState, type FormEvent } from 'react'
import {
  cerrarAfiliacion,
  obtenerCatalogosSeguridadSocial,
  registrarAfiliacion,
  type AfiliacionTrabajador,
  type CatalogosSeguridadSocial,
  type TipoEntidadSS,
} from '../../lib/api'
import { fechaParaInput, formatearFecha, hoyEnBogota } from '../../lib/formato'
import { ETIQUETA_TIPO_ENTIDAD, formatearPorcentaje, TIPOS_ENTIDAD } from '../../lib/seguridadSocial'
import { Aviso, CLASE_BOTON, CLASE_BOTON_SECUNDARIO, CLASE_INPUT, Campo, Insignia, Seccion } from '../formulario'

interface Props {
  trabajadorId: string
  // Fecha de ingreso del trabajador (la afiliación no puede empezar antes).
  fechaIngreso: string
  afiliaciones: AfiliacionTrabajador[]
  // Quien gestiona el personal registra y cierra afiliaciones; los demás solo las consultan.
  puedeGestionar: boolean
  // Se llama después de guardar, para que la pantalla vuelva a cargar la ficha.
  onCambio: () => void
}

type Accion = { tipo: TipoEntidadSS; modo: 'registrar' | 'cerrar'; afiliacion?: AfiliacionTrabajador }

// Afiliaciones del trabajador a EPS, pensión, cesantías, ARL y caja (RF-PER-04): la vigente de cada tipo y el historial.
export function SeccionAfiliaciones({ trabajadorId, fechaIngreso, afiliaciones, puedeGestionar, onCambio }: Props) {
  const [catalogos, setCatalogos] = useState<CatalogosSeguridadSocial | null>(null)
  const [accion, setAccion] = useState<Accion | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!puedeGestionar) return
    obtenerCatalogosSeguridadSocial()
      .then(setCatalogos)
      .catch((err: Error) => setError(err.message))
  }, [puedeGestionar])

  const vigente = (tipo: TipoEntidadSS) => afiliaciones.find((a) => a.tipo === tipo && a.fechaFin === null)
  const historial = afiliaciones.filter((a) => a.fechaFin !== null)

  function terminar() {
    setAccion(null)
    onCambio()
  }

  return (
    <Seccion titulo="Afiliaciones a la seguridad social" descripcion="Entidad vigente de cada tipo. Al cambiar de entidad, la anterior se cierra sola el día antes y queda en el historial.">
      <Aviso error={error} />
      <ul className="divide-y divide-slate-100">
        {TIPOS_ENTIDAD.map((tipo) => {
          const actual = vigente(tipo)
          const editando = accion?.tipo === tipo
          return (
            <li key={tipo} className="py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs text-slate-500">{ETIQUETA_TIPO_ENTIDAD[tipo]}</p>
                  {actual ? (
                    <p className="text-sm text-slate-900">
                      <span className="font-medium">{actual.entidad.nombre}</span>
                      {actual.claseRiesgo && (
                        <span className="text-slate-600">
                          {' '}
                          · Clase {actual.claseRiesgo.clase} ({formatearPorcentaje(actual.claseRiesgo.tasa)})
                        </span>
                      )}
                      <span className="text-slate-400"> · desde {formatearFecha(actual.fechaInicio)}</span>
                    </p>
                  ) : (
                    <p className="text-sm">
                      <Insignia tono="ambar">Sin afiliación vigente</Insignia>
                    </p>
                  )}
                </div>
                {puedeGestionar && !editando && (
                  <div className="flex gap-2">
                    <button type="button" className={CLASE_BOTON_SECUNDARIO} onClick={() => setAccion({ tipo, modo: 'registrar' })}>
                      {actual ? 'Cambiar' : 'Registrar'}
                    </button>
                    {actual && (
                      <button type="button" className={CLASE_BOTON_SECUNDARIO} onClick={() => setAccion({ tipo, modo: 'cerrar', afiliacion: actual })}>
                        Cerrar
                      </button>
                    )}
                  </div>
                )}
              </div>

              {editando && accion.modo === 'registrar' && catalogos && (
                <FormularioRegistrar trabajadorId={trabajadorId} tipo={tipo} fechaIngreso={fechaIngreso} catalogos={catalogos} onListo={terminar} onCancelar={() => setAccion(null)} />
              )}
              {editando && accion.modo === 'registrar' && !catalogos && <p className="mt-2 text-sm text-slate-500">Cargando entidades…</p>}
              {editando && accion.modo === 'cerrar' && accion.afiliacion && (
                <FormularioCerrar trabajadorId={trabajadorId} afiliacion={accion.afiliacion} onListo={terminar} onCancelar={() => setAccion(null)} />
              )}
            </li>
          )
        })}
      </ul>

      {historial.length > 0 && (
        <details className="mt-3 border-t border-slate-100 pt-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">Historial de afiliaciones cerradas ({historial.length})</summary>
          <ul className="mt-2 space-y-1.5">
            {historial.map((a) => (
              <li key={a.id} className="text-sm text-slate-600">
                <span className="text-xs text-slate-500">{ETIQUETA_TIPO_ENTIDAD[a.tipo]}:</span> {a.entidad.nombre}
                {a.claseRiesgo && ` · Clase ${a.claseRiesgo.clase}`}
                <span className="text-slate-400">
                  {' '}
                  · {formatearFecha(a.fechaInicio)} a {formatearFecha(a.fechaFin)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Seccion>
  )
}

function FormularioRegistrar({
  trabajadorId,
  tipo,
  fechaIngreso,
  catalogos,
  onListo,
  onCancelar,
}: {
  trabajadorId: string
  tipo: TipoEntidadSS
  fechaIngreso: string
  catalogos: CatalogosSeguridadSocial
  onListo: () => void
  onCancelar: () => void
}) {
  const entidades = catalogos.entidades.filter((e) => e.tipo === tipo && e.activa)
  const clases = catalogos.clasesRiesgo.filter((c) => c.activa)
  const [entidadId, setEntidadId] = useState('')
  const [claseRiesgoId, setClaseRiesgoId] = useState('')
  const [fechaInicio, setFechaInicio] = useState(() => hoyEnBogota())
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      await registrarAfiliacion(trabajadorId, { tipo, entidadId, claseRiesgoId: tipo === 'ARL' ? claseRiesgoId : undefined, fechaInicio })
      onListo()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la afiliación')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <Aviso error={error} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo id={`entidad-${tipo}`} etiqueta={ETIQUETA_TIPO_ENTIDAD[tipo]}>
          <select id={`entidad-${tipo}`} required value={entidadId} onChange={(e) => setEntidadId(e.target.value)} className={CLASE_INPUT}>
            <option value="">Elige una entidad…</option>
            {entidades.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id={`inicio-${tipo}`} etiqueta="Afiliado desde">
          <input id={`inicio-${tipo}`} type="date" required min={fechaParaInput(fechaIngreso)} value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className={CLASE_INPUT} />
        </Campo>
        {tipo === 'ARL' && (
          <Campo id="clase-riesgo" etiqueta="Clase de riesgo" ayuda="La tasa de cotización sale de la clase.">
            <select id="clase-riesgo" required value={claseRiesgoId} onChange={(e) => setClaseRiesgoId(e.target.value)} className={CLASE_INPUT}>
              <option value="">Elige la clase…</option>
              {clases.map((c) => (
                <option key={c.id} value={c.id}>
                  Clase {c.clase} — {formatearPorcentaje(c.tasa)}
                </option>
              ))}
            </select>
          </Campo>
        )}
      </div>
      {entidades.length === 0 && <p className="mt-2 text-xs text-amber-700">No hay entidades activas de este tipo: el gerente las agrega en Configuración → Seguridad social.</p>}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button type="submit" disabled={enviando} className={CLASE_BOTON}>
          {enviando ? 'Guardando…' : 'Guardar afiliación'}
        </button>
        <button type="button" onClick={onCancelar} className={CLASE_BOTON_SECUNDARIO}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function FormularioCerrar({ trabajadorId, afiliacion, onListo, onCancelar }: { trabajadorId: string; afiliacion: AfiliacionTrabajador; onListo: () => void; onCancelar: () => void }) {
  const [fechaFin, setFechaFin] = useState(() => hoyEnBogota())
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      await cerrarAfiliacion(trabajadorId, afiliacion.id, fechaFin)
      onListo()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cerrar la afiliación')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <Aviso error={error} />
      <p className="text-sm text-slate-600">
        Termina la afiliación a {afiliacion.entidad.nombre} sin reemplazarla (por ejemplo, cuando el trabajador se retira). Queda en el historial.
      </p>
      <div className="mt-2 max-w-xs">
        <Campo id={`fin-${afiliacion.tipo}`} etiqueta="Última fecha afiliado">
          <input id={`fin-${afiliacion.tipo}`} type="date" required min={fechaParaInput(afiliacion.fechaInicio)} value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className={CLASE_INPUT} />
        </Campo>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button type="submit" disabled={enviando} className={CLASE_BOTON}>
          {enviando ? 'Guardando…' : 'Cerrar afiliación'}
        </button>
        <button type="button" onClick={onCancelar} className={CLASE_BOTON_SECUNDARIO}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
