import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  abrirPdfCierre,
  aprobarCierre,
  cerrarCierre,
  descartarCierre,
  devolverCierre,
  obtenerCierre,
  type CierreCajaDetalle,
} from '../lib/api'
import { CLASE_ESTADO_CIERRE, ETIQUETA_ESTADO_CIERRE, ETIQUETA_MEDIO_PAGO, ETIQUETA_TIPO_CIERRE, diaDeCierre } from '../lib/cierres'
import { formatearCOP, formatearFecha } from '../lib/formato'
import { PERMISOS } from '../lib/permisos'

const CLASE_INPUT =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500'

function Tarjeta({ etiqueta, valor, destacada = false }: { etiqueta: string; valor: string; destacada?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${destacada ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white'}`}>
      <p className={`text-xs ${destacada ? 'text-blue-700' : 'text-slate-500'}`}>{etiqueta}</p>
      <p className={`mt-1 text-lg font-semibold ${destacada ? 'text-blue-900' : 'text-slate-900'}`}>{valor}</p>
    </div>
  )
}

function Renglon({ etiqueta, valor, fuerte = false, clase = '' }: { etiqueta: string; valor: string; fuerte?: boolean; clase?: string }) {
  return (
    <div className={`flex items-center justify-between gap-3 py-1.5 text-sm ${fuerte ? 'font-semibold' : ''} ${clase}`}>
      <span>{etiqueta}</span>
      <span className="whitespace-nowrap">{valor}</span>
    </div>
  )
}

export function CierreDetallePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { tiene } = useAuth()

  const [cierre, setCierre] = useState<CierreCajaDetalle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [contado, setContado] = useState('')
  const [explicacion, setExplicacion] = useState('')

  const cargar = useCallback(() => {
    if (!id) return
    obtenerCierre(id)
      .then((recibido) => {
        setCierre(recibido)
        setError(null)
      })
      .catch((err: Error) => setError(err.message))
  }, [id])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function ejecutar(accion: () => Promise<CierreCajaDetalle | { descartado: boolean }>, despues?: () => void) {
    setOcupado(true)
    setError(null)
    try {
      const resultado = await accion()
      if ('estado' in resultado) setCierre(resultado)
      despues?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la acción')
    } finally {
      setOcupado(false)
    }
  }

  function handleCerrar(event: FormEvent) {
    event.preventDefault()
    if (!cierre) return
    void ejecutar(() => cerrarCierre(cierre.id, { efectivoContado: contado, explicacionDiferencia: explicacion.trim() || undefined }))
  }

  function handleAprobar() {
    if (!cierre) return
    if (!window.confirm('¿Aprobar este cierre? Una vez aprobado no se puede modificar.')) return
    void ejecutar(() => aprobarCierre(cierre.id))
  }

  function handleDevolver() {
    if (!cierre) return
    const observacion = window.prompt('¿Qué debe corregir el administrador? (queda registrado)')?.trim()
    if (!observacion) return
    if (observacion.length < 5) {
      setError('Explica qué hay que corregir (mínimo 5 caracteres).')
      return
    }
    void ejecutar(() => devolverCierre(cierre.id, observacion))
  }

  function handleDescartar() {
    if (!cierre) return
    if (!window.confirm('¿Descartar este borrador? No se ha cerrado, así que no se pierde ningún dato de caja.')) return
    void ejecutar(() => descartarCierre(cierre.id), () => navigate('/caja'))
  }

  async function handlePdf() {
    if (!cierre) return
    setError(null)
    try {
      await abrirPdfCierre(cierre.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir el PDF')
    }
  }

  if (error && !cierre) return <p className="text-sm text-red-600">{error}</p>
  if (!cierre) return <p className="text-sm text-slate-500">Cargando cierre...</p>

  const { resumen } = cierre
  const editable = cierre.estado === 'BORRADOR' || cierre.estado === 'DEVUELTO'
  const contadoNumero = contado === '' ? null : Number(contado)
  const diferenciaCalculada = contadoNumero === null ? null : contadoNumero - Number(resumen.efectivo.esperado)
  const hayDiferencia = diferenciaCalculada !== null && diferenciaCalculada !== 0
  const diferenciaGuardada = cierre.diferencia !== null && Number(cierre.diferencia) !== 0

  return (
    <div className="max-w-3xl">
      <Link to="/caja" className="text-sm text-blue-600 hover:underline">
        ← Cierres de caja
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-slate-900">{cierre.numeroTexto ? `Cierre ${cierre.numeroTexto}` : 'Cierre en borrador'}</h1>
            <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${CLASE_ESTADO_CIERRE[cierre.estado]}`}>
              {ETIQUETA_ESTADO_CIERRE[cierre.estado]}
            </span>
          </div>
          <p className="text-sm text-slate-500">
            {ETIQUETA_TIPO_CIERRE[cierre.tipo]} · Del {diaDeCierre(cierre.desde)} al {diaDeCierre(cierre.hasta)}
          </p>
          <p className="text-xs text-slate-400">Creado por {cierre.creadoPor.nombre}</p>
        </div>
        <button
          type="button"
          onClick={() => void handlePdf()}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Ver PDF
        </button>
      </div>

      {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {cierre.estado === 'DEVUELTO' && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-medium">Devuelto por {cierre.resueltoPor?.nombre ?? 'el gerente'}</p>
          <p>{cierre.observacionGerente}</p>
          <p className="mt-1 text-xs">Corrige lo que haga falta y vuelve a cerrar la caja.</p>
        </div>
      )}
      {cierre.estado === 'CERRADO' && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Cerrado por {cierre.cerradoPor?.nombre} el {formatearFecha(cierre.cerradoEn)}. Espera la aprobación del gerente.
        </div>
      )}
      {cierre.estado === 'APROBADO' && (
        <div className="mt-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          Aprobado por {cierre.resueltoPor?.nombre} el {formatearFecha(cierre.resueltoEn)}.
          {cierre.observacionGerente ? ` ${cierre.observacionGerente}` : ''}
        </div>
      )}
      {cierre.enVivo && (
        <p className="mt-4 text-xs text-slate-500">
          Los valores se calculan con lo registrado hasta este momento y se congelan cuando se cierra la caja.
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tarjeta etiqueta="Entradas netas" valor={formatearCOP(resumen.totales.entradas)} />
        <Tarjeta etiqueta="Salidas netas" valor={formatearCOP(resumen.totales.salidas)} />
        <Tarjeta etiqueta="Movimiento neto" valor={formatearCOP(resumen.totales.neto)} destacada />
      </div>
      {(Number(resumen.totales.reversasEntradas) !== 0 || Number(resumen.totales.reversasSalidas) !== 0) && (
        <p className="mt-2 text-xs text-slate-500">
          Incluye anulaciones hechas en este período: reversas de entradas {formatearCOP(resumen.totales.reversasEntradas)} y de salidas{' '}
          {formatearCOP(resumen.totales.reversasSalidas)}.
        </p>
      )}

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Efectivo de la caja</h2>
        <div className="mt-2 divide-y divide-slate-100">
          <Renglon etiqueta="Efectivo inicial" valor={formatearCOP(resumen.efectivo.inicial)} />
          <Renglon etiqueta="+ Entradas en efectivo" valor={formatearCOP(resumen.efectivo.entradas)} />
          <Renglon etiqueta="− Salidas en efectivo" valor={formatearCOP(resumen.efectivo.salidas)} />
          <Renglon etiqueta="Efectivo esperado" valor={formatearCOP(resumen.efectivo.esperado)} fuerte />
          {!editable && cierre.efectivoContado !== null && (
            <>
              <Renglon etiqueta="Efectivo contado" valor={formatearCOP(cierre.efectivoContado)} fuerte />
              <Renglon
                etiqueta="Diferencia (contado − esperado)"
                valor={formatearCOP(cierre.diferencia)}
                fuerte
                clase={diferenciaGuardada ? 'text-red-700' : 'text-green-700'}
              />
            </>
          )}
        </div>
        {!editable && cierre.explicacionDiferencia && <p className="mt-2 text-sm italic text-slate-600">Explicación: {cierre.explicacionDiferencia}</p>}

        {editable && tiene(PERMISOS.CAJA_CERRAR) && (
          <form onSubmit={handleCerrar} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            <div>
              <label htmlFor="contado" className="block text-sm font-medium text-slate-700">
                Efectivo contado en la caja (pesos)
              </label>
              <input
                id="contado"
                required
                inputMode="numeric"
                value={contado}
                onChange={(e) => setContado(e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, ''))}
                className={CLASE_INPUT}
              />
              {contadoNumero !== null && (
                <p className={`mt-1 text-sm ${hayDiferencia ? 'font-medium text-red-700' : 'text-green-700'}`}>
                  {formatearCOP(contadoNumero)} contados · {hayDiferencia ? `Diferencia de ${formatearCOP(diferenciaCalculada)}` : 'Cuadra con lo esperado'}
                </p>
              )}
            </div>
            {hayDiferencia && (
              <div>
                <label htmlFor="explicacion" className="block text-sm font-medium text-slate-700">
                  Explica la diferencia
                </label>
                <textarea
                  id="explicacion"
                  required
                  minLength={5}
                  maxLength={500}
                  rows={2}
                  value={explicacion}
                  onChange={(e) => setExplicacion(e.target.value)}
                  placeholder="Ej. Se pagó un taxi sin recibo"
                  className={CLASE_INPUT}
                />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={ocupado || contadoNumero === null}
                className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 sm:w-auto sm:py-2"
              >
                {ocupado ? 'Cerrando...' : 'Cerrar caja'}
              </button>
              {cierre.estado === 'BORRADOR' && (
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={handleDescartar}
                  className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:w-auto sm:py-2"
                >
                  Descartar borrador
                </button>
              )}
            </div>
          </form>
        )}
      </section>

      {cierre.estado === 'CERRADO' && tiene(PERMISOS.CAJA_APROBAR) && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={ocupado}
            onClick={handleAprobar}
            className="w-full rounded-md bg-green-600 px-4 py-3 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 sm:w-auto sm:py-2"
          >
            Aprobar cierre
          </button>
          <button
            type="button"
            disabled={ocupado}
            onClick={handleDevolver}
            className="w-full rounded-md border border-red-300 bg-white px-4 py-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 sm:w-auto sm:py-2"
          >
            Devolver con observación
          </button>
        </div>
      )}

      <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Por medio de pago</h2>
          <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {resumen.porMedio.length === 0 && <li className="px-4 py-4 text-sm text-slate-400">Sin movimientos.</li>}
            {resumen.porMedio.map((fila) => (
              <li key={fila.medioPago} className="px-4 py-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-900">{ETIQUETA_MEDIO_PAGO[fila.medioPago]}</span>
                  <span className="font-semibold text-slate-900">{formatearCOP(fila.neto)}</span>
                </div>
                <p className="text-xs text-slate-500">
                  Entradas {formatearCOP(fila.entradas)} · Salidas {formatearCOP(fila.salidas)}
                </p>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Por cuenta</h2>
          <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {resumen.porCuenta.length === 0 && <li className="px-4 py-4 text-sm text-slate-400">Sin movimientos.</li>}
            {resumen.porCuenta.map((fila) => (
              <li key={fila.cuentaId ?? 'efectivo'} className="px-4 py-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-medium text-slate-900">{fila.nombre}</span>
                  <span className="font-semibold text-slate-900">{formatearCOP(fila.neto)}</span>
                </div>
                <p className="text-xs text-slate-500">
                  Entradas {formatearCOP(fila.entradas)} · Salidas {formatearCOP(fila.salidas)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <h2 className="mt-8 text-sm font-semibold text-slate-900">Movimientos del período ({resumen.eventos.length})</h2>
      <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {resumen.eventos.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-400">No hay movimientos en este período.</li>}
        {resumen.eventos.map((evento) => {
          const esEntrada = evento.sentido === 'ENTRADA'
          const reversa = evento.clase === 'ANULACION'
          // Una reversa se muestra con el signo contrario al de su entrada o salida.
          const suma = esEntrada === !reversa
          return (
            <li key={`${evento.origen}-${evento.id}-${evento.clase}`} className={`px-4 py-3 text-sm ${reversa ? 'bg-red-50/60' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{evento.descripcion}</p>
                  <p className="text-xs text-slate-500">
                    {diaDeCierre(evento.fecha)} · {ETIQUETA_MEDIO_PAGO[evento.medioPago]}
                    {evento.cuenta ? ` · ${evento.cuenta}` : ''}
                    {evento.detalle ? ` · ${evento.detalle}` : ''}
                  </p>
                  {reversa && <span className="mt-0.5 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Anulación</span>}
                </div>
                <p className={`whitespace-nowrap font-semibold ${suma ? 'text-green-700' : 'text-red-700'}`}>
                  {suma ? '+' : '−'}
                  {formatearCOP(evento.valor)}
                </p>
              </div>
            </li>
          )
        })}
      </ul>

      {cierre.historial.length > 0 && (
        <>
          <h2 className="mt-8 text-sm font-semibold text-slate-900">Historial</h2>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {cierre.historial.map((paso, indice) => (
              <li key={indice}>
                {formatearFecha(paso.fecha)} · {paso.usuario}: {paso.estadoAnterior ? `${ETIQUETA_ESTADO_CIERRE[paso.estadoAnterior]} → ` : ''}
                {ETIQUETA_ESTADO_CIERRE[paso.estadoNuevo]}
                {paso.observacion ? ` — ${paso.observacion}` : ''}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
