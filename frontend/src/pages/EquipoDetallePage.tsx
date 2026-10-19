import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  actualizarEquipo,
  darDeBajaEquipo,
  listarTiposEquipoActivos,
  obtenerEquipo,
  reactivarEquipo,
  type EstadoEquipo,
  type FichaEquipo,
  type TipoEquipo,
} from '../lib/api'
import { CLASE_ESTADO_EQUIPO, ESTADOS_EQUIPO, ETIQUETA_ESTADO_EQUIPO } from '../lib/equipos'
import { formatearCOP, formatearFecha } from '../lib/formato'
import { PERMISOS } from '../lib/permisos'

const CLASE_INPUT =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
const BOTON_PRIMARIO = 'w-full rounded-md bg-blue-600 px-4 py-3 text-center text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 sm:w-auto sm:py-2'
const BOTON_SECUNDARIO =
  'w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-center text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:w-auto sm:py-2'

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | number | null | undefined }) {
  if (valor === null || valor === undefined || valor === '') return null
  return (
    <div>
      <dt className="text-xs text-slate-500">{etiqueta}</dt>
      <dd className="break-words text-sm text-slate-900">{valor}</dd>
    </div>
  )
}

function Total({ etiqueta, valor, destacado }: { etiqueta: string; valor: string; destacado?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${destacado ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white'}`}>
      <p className={`text-xs ${destacado ? 'text-blue-700' : 'text-slate-500'}`}>{etiqueta}</p>
      <p className={`mt-1 text-base font-semibold ${destacado ? 'text-blue-900' : 'text-slate-900'}`}>{valor}</p>
    </div>
  )
}

function FormularioEdicion({ equipo, onGuardado, onCancelar }: { equipo: FichaEquipo; onGuardado: () => void; onCancelar: () => void }) {
  const [tipos, setTipos] = useState<TipoEquipo[]>([])
  const [nombre, setNombre] = useState(equipo.nombre)
  const [tipoEquipoId, setTipoEquipoId] = useState(equipo.tipoEquipoId)
  const [estado, setEstado] = useState<EstadoEquipo>(equipo.estado)
  const [marca, setMarca] = useState(equipo.marca ?? '')
  const [modelo, setModelo] = useState(equipo.modelo ?? '')
  const [anio, setAnio] = useState(equipo.anio ? String(equipo.anio) : '')
  const [placaSerie, setPlacaSerie] = useState(equipo.placaSerie ?? '')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    listarTiposEquipoActivos()
      .then(setTipos)
      .catch((err: Error) => setError(err.message))
  }, [])

  // El tipo actual puede haberse desactivado después: se sigue mostrando para no perderlo al editar.
  const opcionesTipo = tipos.some((tipo) => tipo.id === equipo.tipoEquipoId) ? tipos : [{ id: equipo.tipoEquipoId, nombre: `${equipo.tipoEquipo.nombre} (desactivado)`, activo: false }, ...tipos]

  async function guardar(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setGuardando(true)
    try {
      await actualizarEquipo(equipo.id, {
        nombre: nombre.trim(),
        tipoEquipoId,
        estado,
        marca: marca.trim(),
        modelo: modelo.trim(),
        anio: anio ? Number(anio) : null,
        placaSerie: placaSerie.trim(),
      })
      onGuardado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={guardar} className="space-y-3">
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div>
        <label htmlFor="e-nombre" className="block text-sm font-medium text-slate-700">
          Nombre
        </label>
        <input id="e-nombre" required minLength={2} maxLength={120} value={nombre} onChange={(e) => setNombre(e.target.value)} className={CLASE_INPUT} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="e-tipo" className="block text-sm font-medium text-slate-700">
            Tipo
          </label>
          <select id="e-tipo" value={tipoEquipoId} onChange={(e) => setTipoEquipoId(e.target.value)} className={CLASE_INPUT}>
            {opcionesTipo.map((tipo) => (
              <option key={tipo.id} value={tipo.id}>
                {tipo.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="e-estado" className="block text-sm font-medium text-slate-700">
            Estado
          </label>
          <select id="e-estado" value={estado} onChange={(e) => setEstado(e.target.value as EstadoEquipo)} className={CLASE_INPUT}>
            {ESTADOS_EQUIPO.map((valor) => (
              <option key={valor} value={valor}>
                {ETIQUETA_ESTADO_EQUIPO[valor]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="e-marca" className="block text-sm font-medium text-slate-700">
            Marca
          </label>
          <input id="e-marca" maxLength={60} value={marca} onChange={(e) => setMarca(e.target.value)} className={CLASE_INPUT} />
        </div>
        <div>
          <label htmlFor="e-modelo" className="block text-sm font-medium text-slate-700">
            Modelo
          </label>
          <input id="e-modelo" maxLength={60} value={modelo} onChange={(e) => setModelo(e.target.value)} className={CLASE_INPUT} />
        </div>
        <div>
          <label htmlFor="e-anio" className="block text-sm font-medium text-slate-700">
            Año
          </label>
          <input id="e-anio" inputMode="numeric" maxLength={4} value={anio} onChange={(e) => setAnio(e.target.value.replace(/\D/g, ''))} className={CLASE_INPUT} />
        </div>
      </div>
      <div>
        <label htmlFor="e-placa" className="block text-sm font-medium text-slate-700">
          Placa o serie
        </label>
        <input id="e-placa" maxLength={60} value={placaSerie} onChange={(e) => setPlacaSerie(e.target.value)} className={CLASE_INPUT} />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="submit" disabled={guardando} className={BOTON_PRIMARIO}>
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button type="button" onClick={onCancelar} disabled={guardando} className={BOTON_SECUNDARIO}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

// Ficha de un equipo de maquinaria: sus datos, su estado, la baja y sus movimientos con los totales (RF-MAQ-01 y 07).
// El reporte por rango de fechas y la comparación entre equipos son de la Etapa 2 (RF-MAQ-05).
export function EquipoDetallePage() {
  const { id } = useParams<{ id: string }>()
  const { tiene } = useAuth()
  const [equipo, setEquipo] = useState<FichaEquipo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  const [dandoDeBaja, setDandoDeBaja] = useState(false)
  const [motivoBaja, setMotivoBaja] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(() => {
    if (!id) return Promise.resolve()
    return obtenerEquipo(id)
      .then((recibido) => {
        setEquipo(recibido)
        setError(null)
      })
      .catch((err: Error) => setError(err.message))
  }, [id])

  useEffect(() => {
    void cargar()
  }, [cargar])

  async function ejecutar(accion: () => Promise<FichaEquipo>) {
    setOcupado(true)
    setError(null)
    try {
      setEquipo(await accion())
      setDandoDeBaja(false)
      setMotivoBaja('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la acción')
    } finally {
      setOcupado(false)
    }
  }

  if (error && !equipo) return <p className="text-sm text-red-600">{error}</p>
  if (!equipo) return <p className="text-sm text-slate-500">Cargando equipo…</p>

  const puedeEditar = tiene(PERMISOS.EQUIPOS_GESTIONAR) && !equipo.deBaja
  const puedeDarDeBaja = tiene(PERMISOS.EQUIPOS_BAJA)
  const puedeRegistrar = tiene(PERMISOS.FINANZAS_REGISTRAR) && !equipo.deBaja

  return (
    <div className="max-w-3xl">
      <Link to={`/proyectos/${equipo.proyectoId}`} className="text-sm text-blue-600 hover:underline">
        ← {equipo.proyecto.nombre}
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="break-words text-lg font-semibold text-slate-900">{equipo.nombre}</h1>
            <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${CLASE_ESTADO_EQUIPO[equipo.estado]}`}>{ETIQUETA_ESTADO_EQUIPO[equipo.estado]}</span>
            {equipo.deBaja && <span className="whitespace-nowrap rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">De baja</span>}
          </div>
          <p className="text-sm text-slate-500">{equipo.tipoEquipo.nombre}</p>
        </div>
        {puedeRegistrar && (
          <Link to={`/finanzas/nuevo?proyectoId=${equipo.proyectoId}&equipoId=${equipo.id}`} className={BOTON_PRIMARIO}>
            Registrar ingreso o egreso
          </Link>
        )}
      </div>

      {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {equipo.deBaja && (
        <div className="mt-4 rounded-md border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-800">
          <p className="font-medium">Dado de baja el {formatearFecha(equipo.bajaEn)}{equipo.bajaPor ? ` por ${equipo.bajaPor.nombre}` : ''}</p>
          <p>Motivo: {equipo.bajaMotivo}</p>
          <p className="text-xs text-slate-500">Ya no recibe movimientos nuevos ni se edita. Todo su historial se conserva.</p>
          {puedeDarDeBaja && (
            <button type="button" disabled={ocupado} onClick={() => void ejecutar(() => reactivarEquipo(equipo.id))} className={`mt-3 ${BOTON_SECUNDARIO}`}>
              Reactivar el equipo
            </button>
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Total etiqueta="Ingresos" valor={formatearCOP(equipo.totales.ingresos)} />
        <Total etiqueta="Egresos" valor={formatearCOP(equipo.totales.egresos)} />
        <Total etiqueta="Utilidad" valor={formatearCOP(equipo.totales.utilidad)} destacado />
      </div>
      <p className="mt-1 text-xs text-slate-500">Suma los movimientos vigentes; los anulados se ven en la lista pero no suman.</p>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Datos del equipo</h2>
          {puedeEditar && !editando && (
            <button type="button" onClick={() => setEditando(true)} className="text-sm font-medium text-blue-600 hover:underline">
              Editar
            </button>
          )}
        </div>
        {editando ? (
          <div className="mt-3">
            <FormularioEdicion
              equipo={equipo}
              onCancelar={() => setEditando(false)}
              onGuardado={() => {
                setEditando(false)
                void cargar()
              }}
            />
          </div>
        ) : (
          <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Dato etiqueta="Tipo" valor={equipo.tipoEquipo.nombre} />
            <Dato etiqueta="Marca" valor={equipo.marca} />
            <Dato etiqueta="Modelo" valor={equipo.modelo} />
            <Dato etiqueta="Año" valor={equipo.anio} />
            <Dato etiqueta="Placa o serie" valor={equipo.placaSerie} />
            <Dato etiqueta="Proyecto" valor={equipo.proyecto.nombre} />
          </dl>
        )}
      </section>

      {puedeDarDeBaja && !equipo.deBaja && (
        <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Dar de baja</h2>
          <p className="mt-1 text-sm text-slate-500">El equipo no se borra: queda marcado de baja con su historial y deja de recibir movimientos.</p>
          {!dandoDeBaja ? (
            <button type="button" onClick={() => setDandoDeBaja(true)} className={`mt-3 ${BOTON_SECUNDARIO}`}>
              Dar de baja este equipo
            </button>
          ) : (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
              <label htmlFor="motivo-baja" className="block text-sm font-medium text-amber-900">
                Motivo de la baja (queda registrado)
              </label>
              <textarea id="motivo-baja" rows={2} maxLength={300} value={motivoBaja} onChange={(e) => setMotivoBaja(e.target.value)} placeholder="Ej. Vendido, siniestro, fin de vida útil" className={CLASE_INPUT} />
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <button type="button" disabled={ocupado || motivoBaja.trim().length < 5} onClick={() => void ejecutar(() => darDeBajaEquipo(equipo.id, motivoBaja.trim()))} className={BOTON_PRIMARIO}>
                  {ocupado ? 'Guardando…' : 'Confirmar la baja'}
                </button>
                <button type="button" disabled={ocupado} onClick={() => setDandoDeBaja(false)} className={BOTON_SECUNDARIO}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-slate-900">Movimientos ({equipo.movimientos.length})</h2>
        <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {equipo.movimientos.map((movimiento) => {
            const anulado = movimiento.estado === 'ANULADO'
            const esGasto = movimiento.tipo === 'GASTO'
            return (
              <li key={movimiento.id}>
                <Link to={`/finanzas/movimientos/${movimiento.id}`} className={`block px-4 py-3 text-sm hover:bg-slate-50 ${anulado ? 'bg-red-50/60' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`break-words font-medium ${anulado ? 'text-slate-500 line-through' : 'text-slate-900'}`}>{movimiento.descripcion}</p>
                      <p className="text-xs text-slate-500">
                        {formatearFecha(movimiento.fecha)} · {movimiento.categoria}
                        {movimiento.tercero ? ` · ${movimiento.tercero}` : ''}
                      </p>
                      {movimiento.periodoDesde && movimiento.periodoHasta && (
                        <p className="text-xs text-slate-500">
                          Período alquilado: {movimiento.periodoDesde.split('-').reverse().join('/')} al {movimiento.periodoHasta.split('-').reverse().join('/')}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${anulado ? 'text-slate-400 line-through' : esGasto ? 'text-red-700' : 'text-green-700'}`}>
                        {esGasto ? '−' : '+'}
                        {formatearCOP(movimiento.valor)}
                      </p>
                      {anulado && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">ANULADO</span>}
                    </div>
                  </div>
                </Link>
              </li>
            )
          })}
          {equipo.movimientos.length === 0 && <li className="px-4 py-10 text-center text-sm text-slate-400">Este equipo todavía no tiene movimientos.</li>}
        </ul>
      </section>
    </div>
  )
}
