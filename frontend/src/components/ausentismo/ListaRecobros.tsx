import { Fragment, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { listarRecobros, type EntidadRecobro, type EstadoRecobro, type FilaRecobro } from '../../lib/api'
import { ENTIDADES_RECOBRO, ESTADOS_RECOBRO, ETIQUETA_ENTIDAD_RECOBRO, ETIQUETA_ESTADO_RECOBRO, TONO_ESTADO_RECOBRO } from '../../lib/ausentismo'
import { formatearCOP, formatearFecha } from '../../lib/formato'
import { PERMISOS } from '../../lib/permisos'
import { Aviso, CLASE_BOTON_SECUNDARIO, Insignia, Seccion } from '../formulario'
import { FormularioRecobro } from './FormularioRecobro'

// Seguimiento del cobro de las incapacidades a la EPS, la ARL o el fondo de pensiones (RF-SST-09). Cambiarlo es mover plata:
// lo hace quien puede gestionar y ver valores. Los demás ven el estado, sin valores. El sistema no transmite nada a las entidades.
export function ListaRecobros() {
  const { tiene } = useAuth()
  const puedeCambiar = tiene(PERMISOS.SST_GESTIONAR) && tiene(PERMISOS.SST_VALORES_VER)

  const [anio, setAnio] = useState(() => new Date().getFullYear())
  const [estado, setEstado] = useState<EstadoRecobro | ''>('')
  const [entidad, setEntidad] = useState<EntidadRecobro | ''>('')
  const [filas, setFilas] = useState<FilaRecobro[] | null>(null)
  const [editando, setEditando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const cargar = useCallback(() => {
    listarRecobros({ anio, estado: estado || undefined, entidad: entidad || undefined })
      .then((lista) => {
        setFilas(lista)
        setError(null)
      })
      .catch((err: Error) => setError(err.message))
  }, [anio, estado, entidad])

  useEffect(cargar, [cargar])

  const conValores = filas?.some((f) => f.valorEsperado !== undefined) ?? false
  const pendientes = filas?.filter((f) => f.estado === 'PENDIENTE').length ?? 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="rec-anio" className="block text-xs text-slate-500">
            Año del ausentismo
          </label>
          <input id="rec-anio" type="number" min={2000} max={2100} value={anio} onChange={(e) => setAnio(Number(e.target.value) || anio)} className="mt-1 w-24 rounded-md border border-slate-300 px-2 py-2 text-center text-sm" />
        </div>
        <select aria-label="Filtrar por estado" value={estado} onChange={(e) => setEstado(e.target.value as EstadoRecobro | '')} className="rounded-md border border-slate-300 px-2 py-2 text-sm">
          <option value="">Todos los estados</option>
          {ESTADOS_RECOBRO.map((e) => (
            <option key={e} value={e}>
              {ETIQUETA_ESTADO_RECOBRO[e]}
            </option>
          ))}
        </select>
        <select aria-label="Filtrar por entidad" value={entidad} onChange={(e) => setEntidad(e.target.value as EntidadRecobro | '')} className="rounded-md border border-slate-300 px-2 py-2 text-sm">
          <option value="">Todas las entidades</option>
          {ENTIDADES_RECOBRO.map((e) => (
            <option key={e} value={e}>
              {ETIQUETA_ENTIDAD_RECOBRO[e]}
            </option>
          ))}
        </select>
      </div>

      <Aviso error={error} ok={ok} />

      {filas && filas.length > 0 && <p className="text-sm text-slate-600">{pendientes} recobro{pendientes === 1 ? '' : 's'} pendiente{pendientes === 1 ? '' : 's'} en esta lista.</p>}

      <Seccion titulo="Recobro a las entidades" descripcion="Lo que la EPS, la ARL o el fondo de pensiones deben reconocer por cada incapacidad: pendiente, radicado, pagado o rechazado. Se crea solo al registrar el ausentismo.">
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Trabajador</th>
                <th className="px-3 py-2 font-medium">Ausentismo</th>
                <th className="px-3 py-2 font-medium">Entidad</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                {conValores && <th className="px-3 py-2 text-right font-medium">Esperado</th>}
                {conValores && <th className="px-3 py-2 text-right font-medium">Reconocido</th>}
                {puedeCambiar && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {filas && filas.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-slate-400">
                    No hay recobros con esos filtros.
                  </td>
                </tr>
              )}
              {filas?.map((f) => {
                const clave = `${f.ausentismo.id}-${f.entidad}`
                return (
                  <Fragment key={f.id}>
                    <tr className="border-b border-slate-100 align-top">
                      <td className="px-3 py-2">
                        <Link to={`/sst/ausentismo/${f.ausentismo.id}`} className="font-medium text-blue-600 hover:underline">
                          {f.ausentismo.trabajador.nombre}
                        </Link>
                        <p className="text-xs text-slate-500">{f.ausentismo.trabajador.documento}</p>
                      </td>
                      <td className="px-3 py-2">
                        {f.ausentismo.tipo.nombre}
                        <span className="block text-xs text-slate-500">
                          {formatearFecha(f.ausentismo.fechaInicio)} al {formatearFecha(f.ausentismo.fechaFin)}
                          {f.ausentismo.numeroDocumento && ` · ${f.ausentismo.numeroDocumento}`}
                        </span>
                      </td>
                      <td className="px-3 py-2">{ETIQUETA_ENTIDAD_RECOBRO[f.entidad]}</td>
                      <td className="px-3 py-2">
                        <Insignia tono={TONO_ESTADO_RECOBRO[f.estado]}>{ETIQUETA_ESTADO_RECOBRO[f.estado]}</Insignia>
                        {f.fechaRadicacion && <span className="mt-1 block text-xs text-slate-500">Radicado el {formatearFecha(f.fechaRadicacion)}</span>}
                        {f.fechaPago && <span className="block text-xs text-slate-500">Pagado el {formatearFecha(f.fechaPago)}</span>}
                      </td>
                      {conValores && <td className="whitespace-nowrap px-3 py-2 text-right">{formatearCOP(f.valorEsperado)}</td>}
                      {conValores && <td className="whitespace-nowrap px-3 py-2 text-right">{f.valorReconocido ? formatearCOP(f.valorReconocido) : '—'}</td>}
                      {puedeCambiar && (
                        <td className="px-3 py-2 text-right">
                          {editando !== clave && (
                            <button type="button" className={CLASE_BOTON_SECUNDARIO} onClick={() => { setOk(null); setEditando(clave) }}>
                              Actualizar
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                    {editando === clave && (
                      <tr className="border-b border-slate-100">
                        <td colSpan={7} className="px-3 py-3">
                          <FormularioRecobro
                            ausentismoId={f.ausentismo.id}
                            entidad={f.entidad}
                            actual={f}
                            onGuardado={() => {
                              setEditando(null)
                              setOk('Recobro actualizado.')
                              cargar()
                            }}
                            onCancelar={() => setEditando(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </Seccion>
    </div>
  )
}
