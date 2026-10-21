import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  listarNotificaciones,
  type CanalNotificacion,
  type EstadoNotificacion,
  type FiltroNotificaciones,
  type ListaNotificaciones,
  type TipoNotificacion,
} from '../lib/api'
import {
  CLASE_ESTADO_NOTIFICACION,
  ETIQUETA_CANAL,
  ETIQUETA_ESTADO_NOTIFICACION,
  ETIQUETA_TIPO_NOTIFICACION,
  ORDEN_ESTADOS_NOTIFICACION,
  formatearFechaHora,
} from '../lib/notificaciones'

const CLASE_INPUT =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
const POR_PAGINA = 50

type ClaveFiltro = 'tipo' | 'canal' | 'estado' | 'desde' | 'hasta' | 'clienteId' | 'ventaId'

// Historial de avisos a clientes (RF-NOT-06): qué se envió, por qué canal, a quién, quién lo disparó y cómo salió.
// Los filtros viven en la dirección de la página, para poder llegar aquí desde la ficha de un cliente o de una venta.
export function NotificacionesPage() {
  const [parametros, setParametros] = useSearchParams()
  const [lista, setLista] = useState<ListaNotificaciones | null>(null)
  // Los filtros con los que se cargó la lista que se ve: mientras sean distintos de los actuales, está cargando.
  const [cargada, setCargada] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const valor = (clave: ClaveFiltro) => parametros.get(clave) ?? ''
  const pagina = Math.max(1, Number(parametros.get('pagina')) || 1)
  const textoParametros = parametros.toString()
  const cargando = cargada !== textoParametros

  useEffect(() => {
    const actuales = new URLSearchParams(textoParametros)
    const filtro: FiltroNotificaciones = {
      tipo: (actuales.get('tipo') as TipoNotificacion) || undefined,
      canal: (actuales.get('canal') as CanalNotificacion) || undefined,
      estado: (actuales.get('estado') as EstadoNotificacion) || undefined,
      desde: actuales.get('desde') || undefined,
      hasta: actuales.get('hasta') || undefined,
      clienteId: actuales.get('clienteId') || undefined,
      ventaId: actuales.get('ventaId') || undefined,
      pagina: Math.max(1, Number(actuales.get('pagina')) || 1),
      limite: POR_PAGINA,
    }
    listarNotificaciones(filtro)
      .then((recibida) => {
        setLista(recibida)
        setError(null)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setCargada(textoParametros))
  }, [textoParametros])

  function cambiar(clave: ClaveFiltro | 'pagina', nuevo: string) {
    const siguiente = new URLSearchParams(parametros)
    if (nuevo) siguiente.set(clave, nuevo)
    else siguiente.delete(clave)
    if (clave !== 'pagina') siguiente.delete('pagina')
    setParametros(siguiente, { replace: true })
  }

  const hayFiltros = ['tipo', 'canal', 'estado', 'desde', 'hasta', 'clienteId', 'ventaId'].some((clave) => parametros.get(clave))
  const totalPaginas = lista ? Math.max(1, Math.ceil(lista.total / lista.limite)) : 1

  return (
    <div className="max-w-5xl">
      <h1 className="text-lg font-semibold text-slate-900">Notificaciones</h1>
      <p className="text-sm text-slate-500">Cada aviso a un cliente (recibo, recordatorio de cuota o aviso de mora) con su resultado.</p>

      {(valor('clienteId') || valor('ventaId')) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          <span>Mostrando los avisos de {valor('ventaId') ? 'una venta' : 'un cliente'}.</span>
          <button
            type="button"
            onClick={() => {
              const siguiente = new URLSearchParams(parametros)
              siguiente.delete('clienteId')
              siguiente.delete('ventaId')
              siguiente.delete('pagina')
              setParametros(siguiente, { replace: true })
            }}
            className="font-medium underline"
          >
            Ver todos
          </button>
        </div>
      )}

      <form onSubmit={(evento) => evento.preventDefault()} className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-white p-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="tipo" className="block text-sm font-medium text-slate-700">
              Aviso
            </label>
            <select id="tipo" value={valor('tipo')} onChange={(e) => cambiar('tipo', e.target.value)} className={CLASE_INPUT}>
              <option value="">Todos</option>
              {(Object.keys(ETIQUETA_TIPO_NOTIFICACION) as TipoNotificacion[]).map((tipo) => (
                <option key={tipo} value={tipo}>
                  {ETIQUETA_TIPO_NOTIFICACION[tipo]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="canal" className="block text-sm font-medium text-slate-700">
              Canal
            </label>
            <select id="canal" value={valor('canal')} onChange={(e) => cambiar('canal', e.target.value)} className={CLASE_INPUT}>
              <option value="">Todos</option>
              {(Object.keys(ETIQUETA_CANAL) as CanalNotificacion[]).map((canal) => (
                <option key={canal} value={canal}>
                  {ETIQUETA_CANAL[canal]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="estado" className="block text-sm font-medium text-slate-700">
              Resultado
            </label>
            <select id="estado" value={valor('estado')} onChange={(e) => cambiar('estado', e.target.value)} className={CLASE_INPUT}>
              <option value="">Todos</option>
              {ORDEN_ESTADOS_NOTIFICACION.map((estado) => (
                <option key={estado} value={estado}>
                  {ETIQUETA_ESTADO_NOTIFICACION[estado]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="desde" className="block text-sm font-medium text-slate-700">
              Desde
            </label>
            <input id="desde" type="date" value={valor('desde')} onChange={(e) => cambiar('desde', e.target.value)} className={CLASE_INPUT} />
          </div>
          <div>
            <label htmlFor="hasta" className="block text-sm font-medium text-slate-700">
              Hasta
            </label>
            <input id="hasta" type="date" value={valor('hasta')} onChange={(e) => cambiar('hasta', e.target.value)} className={CLASE_INPUT} />
          </div>
          {hayFiltros && (
            <div className="flex items-end">
              <button type="button" onClick={() => setParametros({}, { replace: true })} className="text-sm font-medium text-blue-600 hover:underline">
                Quitar filtros
              </button>
            </div>
          )}
        </div>
      </form>

      {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {lista && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ORDEN_ESTADOS_NOTIFICACION.map((estado) => (
            <button
              key={estado}
              type="button"
              onClick={() => cambiar('estado', valor('estado') === estado ? '' : estado)}
              aria-pressed={valor('estado') === estado}
              className={`rounded-lg border p-3 text-left ${valor('estado') === estado ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
            >
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CLASE_ESTADO_NOTIFICACION[estado]}`}>{ETIQUETA_ESTADO_NOTIFICACION[estado]}</span>
              <p className="mt-1 text-lg font-semibold text-slate-900">{lista.porEstado[estado] ?? 0}</p>
            </button>
          ))}
        </div>
      )}

      {lista && (
        <ul className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {!cargando && lista.notificaciones.length === 0 && <li className="px-4 py-10 text-center text-sm text-slate-400">No hay avisos con esos datos.</li>}
          {lista.notificaciones.map((aviso) => (
            <li key={aviso.id} className="px-4 py-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 break-words font-medium text-slate-900">
                  {ETIQUETA_TIPO_NOTIFICACION[aviso.tipo]}
                  {aviso.recibo ? ` ${aviso.recibo}` : ''}
                  {aviso.cuota !== null ? ` · ${aviso.cuota === 0 ? 'Cuota inicial' : `Cuota ${aviso.cuota}`}` : ''}
                </p>
                <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${CLASE_ESTADO_NOTIFICACION[aviso.estado]}`}>
                  {ETIQUETA_ESTADO_NOTIFICACION[aviso.estado]}
                </span>
              </div>
              <p className="break-words text-slate-700">
                <Link to={`/clientes/${aviso.cliente.id}`} className="font-medium text-blue-600 hover:underline">
                  {aviso.cliente.nombre}
                </Link>{' '}
                ·{' '}
                <Link to={`/ventas/${aviso.ventaId}`} className="text-blue-600 hover:underline">
                  {aviso.proyecto}, lote {aviso.lote}
                </Link>
              </p>
              <p className="break-words text-xs text-slate-500">
                {ETIQUETA_CANAL[aviso.canal]}
                {aviso.destinatario ? ` · ${aviso.destinatario}` : ''} · {formatearFechaHora(aviso.fecha)} · {aviso.usuario ? `Lo hizo ${aviso.usuario}` : 'Proceso automático'}
              </p>
              {aviso.detalle && <p className="break-words text-xs text-slate-500">{aviso.detalle}</p>}
            </li>
          ))}
        </ul>
      )}

      {lista && lista.total > lista.limite && (
        <div className="mt-4 flex items-center justify-between gap-2 text-sm">
          <button
            type="button"
            disabled={pagina <= 1}
            onClick={() => cambiar('pagina', String(pagina - 1))}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Anterior
          </button>
          <span className="text-slate-500">
            Página {pagina} de {totalPaginas} · {lista.total} avisos
          </span>
          <button
            type="button"
            disabled={pagina >= totalPaginas}
            onClick={() => cambiar('pagina', String(pagina + 1))}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  )
}
