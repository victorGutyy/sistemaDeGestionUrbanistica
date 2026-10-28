import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Aviso, CLASE_BOTON, CLASE_BOTON_PELIGRO, CLASE_BOTON_SECUNDARIO, CLASE_INPUT, Dato, Insignia, Seccion } from '../components/formulario'
import { AdjuntosSst } from '../components/sst/AdjuntosSst'
import { FormularioCapacitacion } from '../components/sst/FormularioCapacitacion'
import { useAuth } from '../contexts/AuthContext'
import { actualizarAsistencia, anularAsistencia, listarTrabajadoresSst, obtenerCapacitacion, registrarAsistentes, type AsistenciaCapacitacion, type CapacitacionDetalle, type TrabajadorSst } from '../lib/api'
import { formatearFecha } from '../lib/formato'
import { PERMISOS } from '../lib/permisos'
import { aNumero } from '../lib/seguridadSocial'
import { ETIQUETA_ALERTA, ETIQUETA_EJECUTOR, ETIQUETA_ESTADO_ACTIVIDAD, ETIQUETA_MODALIDAD, formatearDecimalSst, formatearPorcentajeSst, textoDias, TONO_ALERTA, TONO_ESTADO_ACTIVIDAD } from '../lib/sst'

// Una fila de la asistencia: firma, calificación y anulación con motivo.
function FilaAsistencia({ capacitacionId, asistencia, puedeGestionar, onCambio }: { capacitacionId: string; asistencia: AsistenciaCapacitacion; puedeGestionar: boolean; onCambio: () => void }) {
  const [nota, setNota] = useState(asistencia.calificacion === null ? '' : String(Number(asistencia.calificacion)).replace('.', ','))
  const [anulando, setAnulando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function guardar(cambios: { firmo?: boolean; calificacion?: number | null }) {
    setError(null)
    setEnviando(true)
    try {
      await actualizarAsistencia(capacitacionId, asistencia.id, cambios)
      onCambio()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setEnviando(false)
    }
  }

  async function anular(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      await anularAsistencia(capacitacionId, asistencia.id, motivo.trim())
      onCambio()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo anular la asistencia')
      setEnviando(false)
    }
  }

  const notaActual = asistencia.calificacion === null ? '' : String(Number(asistencia.calificacion)).replace('.', ',')

  return (
    <>
      <tr className="border-b border-slate-100 align-top">
        <td className="px-3 py-2">
          <Link to={`/sst/trabajadores/${asistencia.trabajador.id}`} className="text-blue-600 hover:underline">
            {asistencia.trabajador.nombre}
          </Link>
          <span className="block text-xs text-slate-500">
            {asistencia.trabajador.documento} · {asistencia.trabajador.cargo}
          </span>
        </td>
        <td className="px-3 py-2">
          {puedeGestionar ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={asistencia.firmo} disabled={enviando} onChange={(e) => void guardar({ firmo: e.target.checked })} className="h-4 w-4" />
              {asistencia.firmo ? 'Firmó' : 'Sin firma'}
            </label>
          ) : asistencia.firmo ? (
            <Insignia tono="verde">Firmó</Insignia>
          ) : (
            <Insignia tono="ambar">Sin firma</Insignia>
          )}
        </td>
        <td className="px-3 py-2">
          {puedeGestionar ? (
            <div className="flex items-center gap-2">
              <input aria-label={`Calificación de ${asistencia.trabajador.nombre}`} inputMode="decimal" placeholder="0 a 5" value={nota} onChange={(e) => setNota(e.target.value)} className="w-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              {nota !== notaActual && (
                <button type="button" disabled={enviando} className={CLASE_BOTON_SECUNDARIO} onClick={() => void guardar({ calificacion: nota.trim() === '' ? null : aNumero(nota) })}>
                  Guardar
                </button>
              )}
            </div>
          ) : (
            formatearDecimalSst(asistencia.calificacion)
          )}
        </td>
        {puedeGestionar && (
          <td className="px-3 py-2 text-right">
            {!anulando && (
              <button type="button" className="text-sm text-red-600 hover:underline" onClick={() => setAnulando(true)}>
                Quitar
              </button>
            )}
          </td>
        )}
      </tr>
      {(anulando || error) && (
        <tr className="border-b border-slate-100">
          <td colSpan={4} className="bg-slate-50 px-3 py-2">
            {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
            {anulando && (
              <form onSubmit={anular} className="flex max-w-xl flex-col gap-2 sm:flex-row">
                <input aria-label="Motivo para quitar la asistencia" required minLength={5} maxLength={300} placeholder="Motivo (mínimo 5 letras)" value={motivo} onChange={(e) => setMotivo(e.target.value)} className={CLASE_INPUT} />
                <div className="flex gap-2 sm:mt-1">
                  <button type="submit" disabled={enviando} className={CLASE_BOTON_PELIGRO}>
                    Anular asistencia
                  </button>
                  <button type="button" onClick={() => setAnulando(false)} className={CLASE_BOTON_SECUNDARIO}>
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// Agregar varios asistentes de una vez: los trabajadores activos que todavía no están en la lista.
function AgregarAsistentes({ capacitacionId, yaRegistrados, trabajadores, onListo }: { capacitacionId: string; yaRegistrados: Set<string>; trabajadores: TrabajadorSst[]; onListo: (mensaje: string) => void }) {
  const [buscar, setBuscar] = useState('')
  const [elegidos, setElegidos] = useState<Set<string>>(new Set())
  const [firmaron, setFirmaron] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const disponibles = useMemo(() => {
    const texto = buscar.trim().toLowerCase()
    return trabajadores.filter((t) => t.estado === 'ACTIVO' && !yaRegistrados.has(t.id) && (texto === '' || t.nombre.toLowerCase().includes(texto) || t.documento.includes(texto)))
  }, [trabajadores, yaRegistrados, buscar])

  function alternar(id: string) {
    const nuevo = new Set(elegidos)
    if (nuevo.has(id)) nuevo.delete(id)
    else nuevo.add(id)
    setElegidos(nuevo)
  }

  async function registrar(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      const r = await registrarAsistentes(capacitacionId, [...elegidos].map((trabajadorId) => ({ trabajadorId, firmo: firmaron })))
      onListo(`Se registraron ${r.registrados} asistente${r.registrados === 1 ? '' : 's'}${r.omitidos > 0 ? ` (${r.omitidos} ya estaban)` : ''}.`)
      setElegidos(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron registrar los asistentes')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={registrar} className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <Aviso error={error} />
      <input aria-label="Buscar trabajador" placeholder="Buscar por nombre o documento" value={buscar} onChange={(e) => setBuscar(e.target.value)} className={CLASE_INPUT} />
      <div className="max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white">
        {disponibles.length === 0 && <p className="px-3 py-4 text-sm text-slate-400">No hay trabajadores activos por agregar.</p>}
        <ul className="divide-y divide-slate-100">
          {disponibles.map((t) => (
            <li key={t.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                <input type="checkbox" checked={elegidos.has(t.id)} onChange={() => alternar(t.id)} className="h-4 w-4" />
                <span className="min-w-0">
                  {t.nombre}
                  <span className="block text-xs text-slate-500">
                    {t.documento} · {t.cargo}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={firmaron} onChange={(e) => setFirmaron(e.target.checked)} className="h-4 w-4" />
        Todos firmaron el listado de asistencia
      </label>
      <button type="submit" disabled={enviando || elegidos.size === 0} className={`${CLASE_BOTON} w-full sm:w-auto`}>
        {enviando ? 'Registrando…' : `Registrar ${elegidos.size} asistente${elegidos.size === 1 ? '' : 's'}`}
      </button>
    </form>
  )
}

// Detalle de una capacitación (RF-SST-18 y 19): sus datos, la asistencia con la cobertura y el listado firmado.
export function SstCapacitacionPage() {
  const { tiene } = useAuth()
  const { id } = useParams<{ id: string }>()
  const puedeGestionar = tiene(PERMISOS.SST_GESTIONAR)

  const [capacitacion, setCapacitacion] = useState<CapacitacionDetalle | null>(null)
  const [trabajadores, setTrabajadores] = useState<TrabajadorSst[]>([])
  const [editando, setEditando] = useState(false)
  const [agregando, setAgregando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const cargar = useCallback(() => {
    if (!id) return
    obtenerCapacitacion(id)
      .then(setCapacitacion)
      .catch((err: Error) => setError(err.message))
  }, [id])

  useEffect(cargar, [cargar])

  useEffect(() => {
    if (!puedeGestionar) return
    listarTrabajadoresSst()
      .then(setTrabajadores)
      .catch(() => setTrabajadores([]))
  }, [puedeGestionar])

  if (error && !capacitacion) return <p className="text-sm text-red-600">{error}</p>
  if (!capacitacion || !id) return <p className="text-sm text-slate-500">Cargando capacitación...</p>

  const yaRegistrados = new Set(capacitacion.asistencias.map((a) => a.trabajador.id))
  const cancelada = capacitacion.estado === 'CANCELADA'

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to="/sst/capacitaciones" className="text-sm text-blue-600 hover:underline">
            ← Capacitaciones
          </Link>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">{capacitacion.tema}</h2>
          <p className="text-sm text-slate-500">{capacitacion.objetivo}</p>
        </div>
        {puedeGestionar && !editando && (
          <button type="button" className={CLASE_BOTON_SECUNDARIO} onClick={() => { setOk(null); setEditando(true) }}>
            Editar
          </button>
        )}
      </div>

      <Aviso error={error} ok={ok} />

      {editando ? (
        <FormularioCapacitacion
          inicial={capacitacion}
          onGuardada={() => {
            setEditando(false)
            setOk('Capacitación guardada.')
            cargar()
          }}
          onCancelar={() => setEditando(false)}
        />
      ) : (
        <Seccion titulo="Datos de la capacitación">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
            <Dato etiqueta="Estado">
              <Insignia tono={TONO_ESTADO_ACTIVIDAD[capacitacion.estado]}>{ETIQUETA_ESTADO_ACTIVIDAD[capacitacion.estado]}</Insignia>
              {capacitacion.alerta !== 'SIN_ALERTA' && capacitacion.alerta !== 'AL_DIA' && (
                <span className="ml-1">
                  <Insignia tono={TONO_ALERTA[capacitacion.alerta]}>
                    {ETIQUETA_ALERTA[capacitacion.alerta]}
                    {capacitacion.diasRestantes !== null && ` · ${textoDias(capacitacion.diasRestantes)}`}
                  </Insignia>
                </span>
              )}
            </Dato>
            <Dato etiqueta="Fecha programada">{formatearFecha(capacitacion.fechaProgramada)}</Dato>
            <Dato etiqueta="Fecha de ejecución">{formatearFecha(capacitacion.fechaEjecucion)}</Dato>
            <Dato etiqueta="Dirigido a">{capacitacion.dirigidoA}</Dato>
            <Dato etiqueta="Modalidad">{ETIQUETA_MODALIDAD[capacitacion.modalidad]}</Dato>
            <Dato etiqueta="Horas">{formatearDecimalSst(capacitacion.horas)}</Dato>
            <Dato etiqueta="Facilitador">
              {capacitacion.responsable}
              <span className="block text-xs text-slate-500">{capacitacion.correoResponsable}</span>
            </Dato>
            <Dato etiqueta="Ejecutor">{ETIQUETA_EJECUTOR[capacitacion.ejecutor]}</Dato>
            <Dato etiqueta="Evaluación de eficacia (1 a 5)">{formatearDecimalSst(capacitacion.evaluacionEficacia)}</Dato>
          </dl>
        </Seccion>
      )}

      <Seccion
        titulo="Asistencia"
        descripcion="Los asistentes reales son los registrados; la cobertura es asistentes reales sobre programados. Quitar a alguien por error lo anula con motivo, no lo borra."
        acciones={
          puedeGestionar && !cancelada && !agregando ? (
            <button type="button" className={CLASE_BOTON} onClick={() => { setOk(null); setAgregando(true) }}>
              Agregar asistentes
            </button>
          ) : undefined
        }
      >
        <div className="mb-3 grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs text-slate-500">Programados</p>
            <p className="text-lg font-semibold text-slate-900">{capacitacion.asistentesProgramados}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs text-slate-500">Asistentes reales</p>
            <p className="text-lg font-semibold text-slate-900">{capacitacion.asistentesReales}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs text-slate-500">Cobertura</p>
            <p className="text-lg font-semibold text-slate-900">{formatearPorcentajeSst(capacitacion.cobertura)}</p>
          </div>
        </div>
        {cancelada && <p className="mb-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">La capacitación está cancelada: no admite asistentes nuevos.</p>}

        {agregando && (
          <div className="mb-4">
            <AgregarAsistentes
              capacitacionId={id}
              yaRegistrados={yaRegistrados}
              trabajadores={trabajadores}
              onListo={(mensaje) => {
                setAgregando(false)
                setOk(mensaje)
                cargar()
              }}
            />
            <button type="button" className="mt-2 text-sm text-slate-500 hover:underline" onClick={() => setAgregando(false)}>
              Cerrar
            </button>
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Trabajador</th>
                <th className="px-3 py-2 font-medium">Firma</th>
                <th className="px-3 py-2 font-medium">Calificación</th>
                {puedeGestionar && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {capacitacion.asistencias.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-slate-400">
                    Todavía no hay asistentes registrados.
                  </td>
                </tr>
              )}
              {capacitacion.asistencias.map((a) => (
                <FilaAsistencia key={a.id} capacitacionId={id} asistencia={a} puedeGestionar={puedeGestionar} onCambio={cargar} />
              ))}
            </tbody>
          </table>
        </div>
        {capacitacion.asistenciasAnuladas > 0 && <p className="mt-2 text-xs text-slate-500">{capacitacion.asistenciasAnuladas} asistencia{capacitacion.asistenciasAnuladas === 1 ? '' : 's'} anulada{capacitacion.asistenciasAnuladas === 1 ? '' : 's'} (no cuentan).</p>}
      </Seccion>

      <Seccion titulo="Listado de asistencia y evidencias" descripcion="Adjunta el listado firmado, fotos o la evaluación. Se conservan siempre: no se borran.">
        <AdjuntosSst ruta="capacitaciones" registroId={id} documentos={capacitacion.documentos} puedeAdjuntar={puedeGestionar} onCambio={cargar} etiquetaAdjuntar="Adjuntar soporte" />
      </Seccion>
    </div>
  )
}
