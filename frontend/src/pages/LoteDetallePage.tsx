import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EstadoLoteBadge } from '../components/EstadoLoteBadge'
import { useAuth } from '../contexts/AuthContext'
import {
  actualizarLote,
  ErrorApi,
  escriturarLote,
  liberarLote,
  obtenerLote,
  reponerLote,
  separarLote,
  type EventoLote,
  type FichaLote,
} from '../lib/api'
import { formatearArea } from '../lib/area'
import { ETIQUETA_ESTADO_LOTE } from '../lib/estadoLote'
import { formatearCOP, formatearFecha, hoyEnBogota } from '../lib/formato'
import { PERMISOS } from '../lib/permisos'

const CLASE_INPUT =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
const CLASE_BOTON =
  'rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'
const CLASE_BOTON_SECUNDARIO =
  'rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50'

function describirEvento(evento: EventoLote): string {
  if (evento.tipo === 'CREACION') return 'Lote creado'
  if (evento.tipo === 'CAMBIO_PRECIO') {
    return `Precio: ${formatearCOP(evento.valorAnterior)} → ${formatearCOP(evento.valorNuevo)}`
  }
  const anterior = evento.estadoAnterior ? ETIQUETA_ESTADO_LOTE[evento.estadoAnterior] : '—'
  const nuevo = evento.estadoNuevo ? ETIQUETA_ESTADO_LOTE[evento.estadoNuevo] : '—'
  return `Estado: ${anterior} → ${nuevo}`
}

function formatearFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function LoteDetallePage() {
  const { id } = useParams<{ id: string }>()
  const { tiene } = useAuth()
  const [lote, setLote] = useState<FichaLote | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  // Formularios que se abren bajo demanda.
  const [panel, setPanel] = useState<'escriturar' | 'editar' | 'reponer' | null>(null)
  const [numeroEscritura, setNumeroEscritura] = useState('')
  const [notaria, setNotaria] = useState('')
  const [fechaEscritura, setFechaEscritura] = useState(() => hoyEnBogota())
  const [motivoReponer, setMotivoReponer] = useState('')
  const [edicion, setEdicion] = useState({ area: '', linderos: '', valorPorM2: '', valorVenta: '', motivo: '' })

  const mostrar = useCallback((ficha: FichaLote) => {
    setLote(ficha)
    setEdicion({
      area: ficha.area,
      linderos: ficha.linderos ?? '',
      valorPorM2: ficha.valorPorM2 ?? '',
      valorVenta: ficha.valorVenta,
      motivo: '',
    })
  }, [])

  useEffect(() => {
    if (!id) return
    obtenerLote(id)
      .then(mostrar)
      .catch((err: Error) => setError(err.message))
  }, [id, mostrar])

  async function ejecutar(accion: () => Promise<unknown>, mensajeError: string) {
    setOcupado(true)
    setError(null)
    try {
      await accion()
      setPanel(null)
      if (id) mostrar(await obtenerLote(id))
    } catch (err) {
      setError(err instanceof Error ? err.message : mensajeError)
    } finally {
      setOcupado(false)
    }
  }

  function handleEditar(event: FormEvent) {
    event.preventDefault()
    if (!lote) return
    const bloqueado = lote.estado === 'VENDIDO' || lote.estado === 'ESCRITURADO'
    const cambios = {
      linderos: edicion.linderos,
      valorPorM2: edicion.valorPorM2 || undefined,
      // Un lote vendido ya no admite cambiar precio ni área: solo se manda lo que sí puede cambiar.
      ...(bloqueado ? {} : { area: edicion.area, valorVenta: edicion.valorVenta, motivo: edicion.motivo.trim() || undefined }),
    }
    void ejecutar(async () => {
      try {
        await actualizarLote(lote.id, cambios)
      } catch (err) {
        if (err instanceof ErrorApi && err.codigo === 'AREA_EXCEDIDA' && window.confirm(err.message)) {
          await actualizarLote(lote.id, { ...cambios, confirmarExcesoArea: true })
        } else {
          throw err
        }
      }
    }, 'No se pudo guardar')
  }

  if (error && !lote) return <p className="text-sm text-red-600">{error}</p>
  if (!lote) return <p className="text-sm text-slate-500">Cargando lote...</p>

  const puedeGestionar = tiene(PERMISOS.PROYECTOS_GESTIONAR)
  const puedeReponer = tiene(PERMISOS.PROYECTOS_CAMBIAR_ESTADO)
  const bloqueadoPrecio = lote.estado === 'VENDIDO' || lote.estado === 'ESCRITURADO'
  const puedeVender = (lote.estado === 'DISPONIBLE' || lote.estado === 'SEPARADO') && tiene(PERMISOS.VENTAS_CREAR)

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link to={`/proyectos/${lote.proyecto.id}`} className="text-sm text-blue-600 hover:underline">
          ← {lote.proyecto.nombre}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold text-slate-900">
            {lote.manzana ? `Manzana ${lote.manzana.nombre} · ` : ''}Lote {lote.numero}
          </h1>
          <EstadoLoteBadge estado={lote.estado} />
        </div>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
        <h2 className="text-base font-semibold text-slate-900">Datos del lote</h2>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">Área</dt>
            <dd className="text-slate-900">{formatearArea(lote.area)} m²</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Precio de venta</dt>
            <dd className="text-slate-900">{formatearCOP(lote.valorVenta)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Valor por m²</dt>
            <dd className="text-slate-900">{lote.valorPorM2 ? formatearCOP(lote.valorPorM2) : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Manzana</dt>
            <dd className="text-slate-900">{lote.manzana?.nombre ?? 'Sin manzana'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-slate-500">Medidas y linderos</dt>
            <dd className="whitespace-pre-line text-slate-900">{lote.linderos || '—'}</dd>
          </div>
          {lote.estado === 'ESCRITURADO' && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-slate-500">Escritura</dt>
              <dd className="text-slate-900">
                N.º {lote.escrituraNumero}
                {lote.escrituraNotaria ? ` · ${lote.escrituraNotaria}` : ''}
                {lote.escrituraFecha ? ` · ${formatearFecha(lote.escrituraFecha)}` : ''}
              </dd>
            </div>
          )}
        </dl>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
        <h2 className="text-base font-semibold text-slate-900">Acciones</h2>
        <p className="text-xs text-slate-500">El estado del lote solo cambia con estas acciones; cada una queda en el historial.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {puedeVender && (
            <Link to={`/ventas/nueva?loteId=${lote.id}`} className={CLASE_BOTON}>
              Vender
            </Link>
          )}
          {puedeGestionar && lote.acciones.includes('SEPARAR') && (
            <button type="button" disabled={ocupado} className={CLASE_BOTON_SECUNDARIO} onClick={() => void ejecutar(() => separarLote(lote.id), 'No se pudo separar')}>
              Separar
            </button>
          )}
          {puedeGestionar && lote.acciones.includes('LIBERAR') && (
            <button type="button" disabled={ocupado} className={CLASE_BOTON_SECUNDARIO} onClick={() => void ejecutar(() => liberarLote(lote.id), 'No se pudo liberar')}>
              Liberar separación
            </button>
          )}
          {puedeGestionar && lote.acciones.includes('ESCRITURAR') && (
            <button type="button" className={CLASE_BOTON_SECUNDARIO} onClick={() => setPanel(panel === 'escriturar' ? null : 'escriturar')}>
              Escriturar
            </button>
          )}
          {puedeReponer && lote.acciones.includes('REPONER') && (
            <button type="button" className={CLASE_BOTON_SECUNDARIO} onClick={() => setPanel(panel === 'reponer' ? null : 'reponer')}>
              Volver a poner a la venta
            </button>
          )}
          {puedeGestionar && (
            <button type="button" className={CLASE_BOTON_SECUNDARIO} onClick={() => setPanel(panel === 'editar' ? null : 'editar')}>
              Editar ficha
            </button>
          )}
          {!puedeVender && !puedeGestionar && !puedeReponer && <span className="text-sm text-slate-400">Sin acciones disponibles para tu rol.</span>}
        </div>

        {panel === 'escriturar' && (
          <form
            className="mt-4 space-y-3 border-t border-slate-100 pt-4"
            onSubmit={(event) => {
              event.preventDefault()
              void ejecutar(() => escriturarLote(lote.id, { numero: numeroEscritura, notaria: notaria.trim() || undefined, fecha: fechaEscritura }), 'No se pudo escriturar')
            }}
          >
            <p className="text-sm font-medium text-slate-700">Datos de la escritura</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="numEscritura" className="block text-sm text-slate-700">Número</label>
                <input id="numEscritura" required value={numeroEscritura} onChange={(e) => setNumeroEscritura(e.target.value)} className={CLASE_INPUT} />
              </div>
              <div>
                <label htmlFor="notaria" className="block text-sm text-slate-700">Notaría (opcional)</label>
                <input id="notaria" value={notaria} onChange={(e) => setNotaria(e.target.value)} className={CLASE_INPUT} />
              </div>
              <div>
                <label htmlFor="fechaEscritura" className="block text-sm text-slate-700">Fecha</label>
                <input id="fechaEscritura" type="date" required value={fechaEscritura} onChange={(e) => setFechaEscritura(e.target.value)} className={CLASE_INPUT} />
              </div>
            </div>
            <button type="submit" disabled={ocupado} className={CLASE_BOTON}>
              Marcar como escriturado
            </button>
          </form>
        )}

        {panel === 'reponer' && (
          <form
            className="mt-4 space-y-3 border-t border-slate-100 pt-4"
            onSubmit={(event) => {
              event.preventDefault()
              void ejecutar(() => reponerLote(lote.id, motivoReponer), 'No se pudo reponer el lote')
            }}
          >
            <label htmlFor="motivoReponer" className="block text-sm font-medium text-slate-700">Motivo (queda en el historial)</label>
            <input id="motivoReponer" required minLength={3} value={motivoReponer} onChange={(e) => setMotivoReponer(e.target.value)} className={CLASE_INPUT} />
            <button type="submit" disabled={ocupado} className={CLASE_BOTON}>
              Volver a poner a la venta
            </button>
          </form>
        )}

        {panel === 'editar' && (
          <form onSubmit={handleEditar} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            {bloqueadoPrecio && (
              <p className="text-xs text-amber-700">Este lote ya está {ETIQUETA_ESTADO_LOTE[lote.estado].toLowerCase()}: su precio y área no se pueden cambiar.</p>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="eArea" className="block text-sm text-slate-700">Área (m²)</label>
                <input id="eArea" inputMode="decimal" disabled={bloqueadoPrecio} value={edicion.area} onChange={(e) => setEdicion({ ...edicion, area: e.target.value })} className={`${CLASE_INPUT} disabled:bg-slate-100`} />
              </div>
              <div>
                <label htmlFor="eM2" className="block text-sm text-slate-700">Valor por m²</label>
                <input id="eM2" inputMode="decimal" value={edicion.valorPorM2} onChange={(e) => setEdicion({ ...edicion, valorPorM2: e.target.value })} className={CLASE_INPUT} />
              </div>
              <div>
                <label htmlFor="ePrecio" className="block text-sm text-slate-700">Precio de venta</label>
                <input id="ePrecio" inputMode="decimal" disabled={bloqueadoPrecio} value={edicion.valorVenta} onChange={(e) => setEdicion({ ...edicion, valorVenta: e.target.value })} className={`${CLASE_INPUT} disabled:bg-slate-100`} />
              </div>
            </div>
            {!bloqueadoPrecio && (
              <div>
                <label htmlFor="eMotivo" className="block text-sm text-slate-700">Motivo del cambio de precio (opcional)</label>
                <input id="eMotivo" maxLength={500} value={edicion.motivo} onChange={(e) => setEdicion({ ...edicion, motivo: e.target.value })} className={CLASE_INPUT} />
              </div>
            )}
            <div>
              <label htmlFor="eLinderos" className="block text-sm text-slate-700">Medidas y linderos</label>
              <textarea id="eLinderos" rows={3} maxLength={2000} value={edicion.linderos} onChange={(e) => setEdicion({ ...edicion, linderos: e.target.value })} className={CLASE_INPUT} />
            </div>
            <button type="submit" disabled={ocupado} className={CLASE_BOTON}>
              Guardar cambios
            </button>
          </form>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
        <h2 className="text-base font-semibold text-slate-900">Historial</h2>
        <ul className="mt-3 divide-y divide-slate-100">
          {lote.historial.length === 0 && <li className="py-3 text-sm text-slate-400">Sin movimientos registrados todavía.</li>}
          {lote.historial.map((evento) => (
            <li key={evento.id} className="py-3 text-sm">
              <p className="text-slate-900">{describirEvento(evento)}</p>
              <p className="text-xs text-slate-500">
                {formatearFechaHora(evento.createdAt)} · {evento.usuario.nombre}
                {evento.motivo ? ` · ${evento.motivo}` : ''}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
