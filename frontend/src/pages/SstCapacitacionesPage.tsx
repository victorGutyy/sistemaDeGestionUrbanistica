import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso, CLASE_BOTON, CLASE_BOTON_SECUNDARIO, Insignia, Seccion } from '../components/formulario'
import { FormularioCapacitacion } from '../components/sst/FormularioCapacitacion'
import { useAuth } from '../contexts/AuthContext'
import { listarCapacitaciones, type EstadoActividadSst, type RespuestaCapacitaciones } from '../lib/api'
import { formatearFecha } from '../lib/formato'
import { PERMISOS } from '../lib/permisos'
import { ESTADOS_ACTIVIDAD, ETIQUETA_ALERTA, ETIQUETA_ESTADO_ACTIVIDAD, ETIQUETA_MODALIDAD, formatearPorcentajeSst, textoDias, TONO_ALERTA, TONO_ESTADO_ACTIVIDAD } from '../lib/sst'

function Tarjeta({ titulo, valor, alerta }: { titulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${alerta ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <p className="text-xs text-slate-500">{titulo}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{valor}</p>
    </div>
  )
}

// Pestaña de capacitaciones (RF-SST-18 a 20): el plan de capacitación del año con su cobertura y su alerta.
export function SstCapacitacionesPage() {
  const { tiene } = useAuth()
  const puedeGestionar = tiene(PERMISOS.SST_GESTIONAR)

  const [anio, setAnio] = useState(() => new Date().getFullYear())
  const [filtroEstado, setFiltroEstado] = useState<EstadoActividadSst | ''>('')
  const [datos, setDatos] = useState<RespuestaCapacitaciones | null>(null)
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const cargar = useCallback(() => {
    listarCapacitaciones({ anio, estado: filtroEstado || undefined })
      .then((respuesta) => {
        setDatos(respuesta)
        setError(null)
      })
      .catch((err: Error) => setError(err.message))
  }, [anio, filtroEstado])

  useEffect(cargar, [cargar])

  const vencidas = datos?.capacitaciones.filter((c) => c.alerta === 'VENCIDA').length ?? 0
  const proximas = datos?.capacitaciones.filter((c) => c.alerta === 'PROXIMA').length ?? 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="anio-cap" className="block text-xs text-slate-500">
            Año
          </label>
          <div className="mt-1 flex items-center gap-1">
            <button type="button" aria-label="Año anterior" className={CLASE_BOTON_SECUNDARIO} onClick={() => setAnio(anio - 1)}>
              ‹
            </button>
            <input id="anio-cap" type="number" min={2000} max={2100} value={anio} onChange={(e) => setAnio(Number(e.target.value) || anio)} className="w-24 rounded-md border border-slate-300 px-2 py-2 text-center text-sm" />
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
        {puedeGestionar && !creando && (
          <button type="button" className={`${CLASE_BOTON} sm:ml-auto`} onClick={() => { setOk(null); setCreando(true) }}>
            Nueva capacitación
          </button>
        )}
      </div>

      <Aviso error={error} ok={ok} />

      {creando && (
        <FormularioCapacitacion
          onGuardada={(c) => {
            setCreando(false)
            setOk(`Capacitación creada: ${c.tema}.`)
            cargar()
          }}
          onCancelar={() => setCreando(false)}
        />
      )}

      {datos && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tarjeta titulo="Capacitaciones del año" valor={`${datos.resumen.ejecutadas} de ${datos.resumen.total} ejecutadas`} />
          <Tarjeta titulo="Cobertura de las ejecutadas" valor={formatearPorcentajeSst(datos.resumen.coberturaEjecutadas)} />
          <Tarjeta titulo="Sin ejecutar" valor={String(vencidas)} alerta={vencidas > 0} />
          <Tarjeta titulo={`Próximas (${datos.diasAlerta} días)`} valor={String(proximas)} alerta={proximas > 0} />
        </div>
      )}

      <Seccion titulo={`Plan de capacitación ${anio}`} descripcion="La cobertura es asistentes reales sobre programados. Abre una capacitación para registrar la asistencia y adjuntar el listado firmado.">
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Tema</th>
                <th className="px-3 py-2 font-medium">Fecha programada</th>
                <th className="px-3 py-2 font-medium">Facilitador</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Asistencia</th>
              </tr>
            </thead>
            <tbody>
              {datos && datos.capacitaciones.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-slate-400">
                    No hay capacitaciones {filtroEstado ? 'con ese estado' : `programadas en ${anio}`}.
                  </td>
                </tr>
              )}
              {datos?.capacitaciones.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 align-top last:border-0">
                  <td className="px-3 py-2">
                    <Link to={`/sst/capacitaciones/${c.id}`} className="font-medium text-blue-600 hover:underline">
                      {c.tema}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {ETIQUETA_MODALIDAD[c.modalidad]} · {Number(c.horas).toLocaleString('es-CO')} h · {c.dirigidoA}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {formatearFecha(c.fechaProgramada)}
                    {c.fechaEjecucion && <span className="block text-xs text-slate-500">Se dictó el {formatearFecha(c.fechaEjecucion)}</span>}
                  </td>
                  <td className="px-3 py-2">{c.responsable}</td>
                  <td className="px-3 py-2">
                    <Insignia tono={TONO_ESTADO_ACTIVIDAD[c.estado]}>{ETIQUETA_ESTADO_ACTIVIDAD[c.estado]}</Insignia>
                    {c.alerta !== 'SIN_ALERTA' && c.alerta !== 'AL_DIA' && (
                      <span className="mt-1 block">
                        <Insignia tono={TONO_ALERTA[c.alerta]}>
                          {ETIQUETA_ALERTA[c.alerta]}
                          {c.diasRestantes !== null && ` · ${textoDias(c.diasRestantes)}`}
                        </Insignia>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <p>
                      {c.asistentesReales} de {c.asistentesProgramados}
                      <span className="ml-1 text-xs text-slate-500">({formatearPorcentajeSst(c.cobertura)})</span>
                    </p>
                    {c.cobertura !== null && (
                      <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-slate-200" aria-hidden>
                        <div className={`h-full ${c.cobertura >= 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(c.cobertura, 100)}%` }} />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Seccion>
    </div>
  )
}
