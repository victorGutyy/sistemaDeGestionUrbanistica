import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { PERMISOS } from '../lib/permisos'
import {
  abrirDocumentoVenta,
  aprobarVenta,
  desistirVenta,
  subirDocumentosVenta,
  listarAbonosPorVenta,
  obtenerVenta,
  rechazarVenta,
  abrirComprobante,
  type Abono,
  type EstadoCuota,
  type Venta,
} from '../lib/api'
import { formatearCOP, formatearFecha, hoyEnBogota } from '../lib/formato'
import { CLASE_ESTADO_VENTA, ETIQUETA_ESTADO_VENTA, etiquetaCuota } from '../lib/ventas'

const ESTILO_ESTADO_CUOTA: Record<EstadoCuota, string> = {
  PENDIENTE: 'bg-slate-100 text-slate-600',
  PARCIAL: 'bg-amber-100 text-amber-700',
  PAGADA: 'bg-green-100 text-green-700',
}

const ETIQUETA_MEDIO_PAGO: Record<Abono['medioPago'], string> = {
  EFECTIVO: 'Efectivo',
  CONSIGNACION: 'Consignación',
  TRANSFERENCIA: 'Transferencia',
  NEQUI: 'Nequi',
  DAVIPLATA: 'Daviplata',
  CHEQUE: 'Cheque',
  TARJETA: 'Tarjeta',
}

export function VentaDetallePage() {
  const { tiene } = useAuth()
  const { id } = useParams<{ id: string }>()
  const [venta, setVenta] = useState<Venta | null>(null)
  const [abonos, setAbonos] = useState<Abono[]>([])
  const [error, setError] = useState<string | null>(null)
  const [errorComprobante, setErrorComprobante] = useState<string | null>(null)
  const [resolviendo, setResolviendo] = useState(false)

  // Documentos firmados
  const inputArchivos = useRef<HTMLInputElement>(null)
  const [descripcionDoc, setDescripcionDoc] = useState('')
  const [subiendo, setSubiendo] = useState(false)

  // Desistimiento
  const [mostrarDesistir, setMostrarDesistir] = useState(false)
  const [desistimiento, setDesistimiento] = useState({ fecha: hoyEnBogota(), motivo: '', valorDevolver: '', valorRetener: '' })
  const [desistiendo, setDesistiendo] = useState(false)

  async function handleSubirDocumentos(event: FormEvent) {
    event.preventDefault()
    if (!venta) return
    const archivos = Array.from(inputArchivos.current?.files ?? [])
    if (archivos.length === 0) {
      setError('Elige al menos un archivo (PDF, PNG o JPG).')
      return
    }
    setSubiendo(true)
    setError(null)
    try {
      await subirDocumentosVenta(venta.id, archivos, descripcionDoc.trim() || undefined)
      setDescripcionDoc('')
      if (inputArchivos.current) inputArchivos.current.value = ''
      setRecarga((n) => n + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron subir los documentos')
    } finally {
      setSubiendo(false)
    }
  }

  async function handleAbrirDocumento(documentoId: string) {
    if (!venta) return
    setError(null)
    try {
      await abrirDocumentoVenta(venta.id, documentoId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir el documento')
    }
  }

  async function handleDesistir(event: FormEvent) {
    event.preventDefault()
    if (!venta) return
    if (!window.confirm('¿Registrar el desistimiento? El lote quedará desistido y la venta saldrá de la cartera. Los abonos y recibos se conservan.')) return
    setDesistiendo(true)
    setError(null)
    try {
      await desistirVenta(venta.id, {
        fecha: desistimiento.fecha,
        motivo: desistimiento.motivo.trim(),
        valorDevolver: desistimiento.valorDevolver || undefined,
        valorRetener: desistimiento.valorRetener || undefined,
      })
      setMostrarDesistir(false)
      setRecarga((n) => n + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el desistimiento')
    } finally {
      setDesistiendo(false)
    }
  }
  const [recarga, setRecarga] = useState(0)

  async function resolver(accion: 'aprobar' | 'rechazar') {
    if (!venta) return
    let motivo = ''
    if (accion === 'rechazar') {
      motivo = window.prompt('Motivo del rechazo (queda registrado):')?.trim() ?? ''
      if (motivo.length < 3) return
    } else if (!window.confirm('¿Aprobar esta venta? Se generará su plan de cuotas y el lote pasará a vendido.')) {
      return
    }

    setResolviendo(true)
    setError(null)
    try {
      if (accion === 'aprobar') await aprobarVenta(venta.id)
      else await rechazarVenta(venta.id, motivo)
      setRecarga((n) => n + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo resolver la venta')
    } finally {
      setResolviendo(false)
    }
  }

  async function handleVerComprobante(abonoId: string) {
    setErrorComprobante(null)
    try {
      await abrirComprobante(abonoId)
    } catch (err) {
      setErrorComprobante(err instanceof Error ? err.message : 'No se pudo abrir el comprobante')
    }
  }

  useEffect(() => {
    if (!id) return
    Promise.all([obtenerVenta(id), listarAbonosPorVenta(id)])
      .then(([ventaRecibida, abonosRecibidos]) => {
        setVenta(ventaRecibida)
        setAbonos(abonosRecibidos)
      })
      .catch((err: Error) => setError(err.message))
  }, [id, recarga])

  if (error && !venta) {
    return <p className="text-sm text-red-600">{error}</p>
  }

  if (!venta) {
    return <p className="text-sm text-slate-500">Cargando venta...</p>
  }

  const estadoCuenta = venta.estadoCuenta
  const activa = venta.estado === 'ACTIVA'

  return (
    <div className="max-w-2xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-slate-900">
              {venta.lote.manzana ? `Mz. ${venta.lote.manzana.nombre} · ` : ''}Lote {venta.lote.numero} — {venta.cliente.nombre}
            </h1>
            <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${CLASE_ESTADO_VENTA[venta.estado]}`}>
              {ETIQUETA_ESTADO_VENTA[venta.estado]}
            </span>
          </div>
          <p className="text-sm text-slate-500">
            Valor total: {formatearCOP(venta.valorTotal)} · Cuota inicial: {formatearCOP(venta.cuotaInicial)} ·{' '}
            {venta.formaPago === 'CONTADO' ? 'Contado' : `Financiado en ${venta.numeroCuotas} cuotas`} · Vendida el {formatearFecha(venta.fechaVenta)}
          </p>
          {venta.vendedor && (
            <p className="text-sm text-slate-500">
              Vendedor: {venta.vendedor.nombre} ({venta.vendedor.tipo === 'ASESOR_INMOBILIARIO' ? 'asesor inmobiliario' : 'referido'})
            </p>
          )}
        </div>
        {activa && tiene(PERMISOS.ABONOS_REGISTRAR) && (
          <Link
            to={`/ventas/${venta.id}/abonos/nuevo`}
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Registrar abono
          </Link>
        )}
      </div>

      {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {venta.estado === 'DESISTIDA' && venta.desistimiento && (
        <div className="mt-4 space-y-1 rounded-md border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-800">
          <p className="font-medium">Venta desistida el {formatearFecha(venta.desistimiento.fecha)}</p>
          <p>Motivo: {venta.desistimiento.motivo}</p>
          <p>
            A devolver: {venta.desistimiento.valorDevolver ? formatearCOP(venta.desistimiento.valorDevolver) : '—'} · A retener:{' '}
            {venta.desistimiento.valorRetener ? formatearCOP(venta.desistimiento.valorRetener) : '—'}
          </p>
          {venta.desistimiento.registradoPor && <p className="text-xs text-slate-500">Registrado por {venta.desistimiento.registradoPor.nombre}. Los abonos y recibos se conservan.</p>}
        </div>
      )}

      {venta.esExcepcion && (
        <div className="mt-4 space-y-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Venta con excepción</p>
          <p>Motivo: {venta.motivoExcepcion}</p>
          {venta.registradaPor && <p>Registrada por {venta.registradaPor.nombre}.</p>}
          {venta.estado === 'ACTIVA' && venta.resueltaPor && venta.resueltaEn && (
            <p>
              Autorizada por {venta.resueltaPor.nombre} el {formatearFecha(venta.resueltaEn)}.
            </p>
          )}
          {venta.estado === 'RECHAZADA' && (
            <p>
              Rechazada{venta.resueltaPor ? ` por ${venta.resueltaPor.nombre}` : ''}
              {venta.resueltaEn ? ` el ${formatearFecha(venta.resueltaEn)}` : ''}: {venta.motivoRechazo}
            </p>
          )}
          {venta.estado === 'PENDIENTE_APROBACION' && (
            <>
              <p>Espera la aprobación del gerente. El lote está apartado y todavía no hay plan de cuotas.</p>
              {tiene(PERMISOS.VENTAS_AUTORIZAR) && (
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    disabled={resolviendo}
                    onClick={() => void resolver('aprobar')}
                    className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Aprobar
                  </button>
                  <button
                    type="button"
                    disabled={resolviendo}
                    onClick={() => void resolver('rechazar')}
                    className="rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Rechazar
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {estadoCuenta && venta.estado !== 'PENDIENTE_APROBACION' && (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Total pagado</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{formatearCOP(estadoCuenta.totalPagado)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Saldo pendiente</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{formatearCOP(estadoCuenta.saldoPendiente)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Próxima cuota</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {estadoCuenta.proximaCuota
                ? `${etiquetaCuota(estadoCuenta.proximaCuota.numero)} · ${formatearFecha(estadoCuenta.proximaCuota.fechaVencimiento)}`
                : '—'}
            </p>
          </div>
        </div>
      )}

      {venta.cuotas.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[30rem] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Cuota</th>
                <th className="px-4 py-2 font-medium">Vence</th>
                <th className="px-4 py-2 font-medium">Valor</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {venta.cuotas.map((cuota) => (
                <tr key={cuota.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2">{etiquetaCuota(cuota.numero)}</td>
                  <td className="px-4 py-2">{formatearFecha(cuota.fechaVencimiento)}</td>
                  <td className="px-4 py-2">{formatearCOP(cuota.valor)}</td>
                  <td className="px-4 py-2">
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${ESTILO_ESTADO_CUOTA[cuota.estado]}`}>
                      {cuota.estado}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {activa && cuota.estado !== 'PAGADA' && tiene(PERMISOS.ABONOS_REGISTRAR) && (
                      <Link
                        to={`/ventas/${venta.id}/abonos/nuevo?cuotaId=${cuota.id}`}
                        className="text-sm font-medium text-blue-600 hover:underline"
                      >
                        Abonar
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-slate-900">Documentos firmados</h2>
        <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {(venta.documentos ?? []).length === 0 && <li className="px-4 py-4 text-sm text-slate-400">Todavía no hay documentos adjuntos.</li>}
          {(venta.documentos ?? []).map((documento) => (
            <li key={documento.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <div className="min-w-0">
                <button type="button" onClick={() => void handleAbrirDocumento(documento.id)} className="truncate text-left font-medium text-blue-600 hover:underline">
                  {documento.nombreOriginal}
                </button>
                <p className="text-xs text-slate-500">
                  {documento.descripcion ? `${documento.descripcion} · ` : ''}
                  {formatearFecha(documento.createdAt)}
                  {documento.subidoPor ? ` · ${documento.subidoPor.nombre}` : ''} · {Math.max(1, Math.round(documento.tamano / 1024))} KB
                </p>
              </div>
            </li>
          ))}
        </ul>
        {tiene(PERMISOS.VENTAS_CREAR) && (
          <form onSubmit={handleSubirDocumentos} className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-white p-3">
            <label htmlFor="archivosVenta" className="block text-sm font-medium text-slate-700">
              Adjuntar documentos (PDF, PNG o JPG; hasta 10 a la vez)
            </label>
            <input id="archivosVenta" ref={inputArchivos} type="file" multiple accept="application/pdf,image/png,image/jpeg" className="w-full text-sm text-slate-700" />
            <input
              aria-label="Descripción de los documentos"
              maxLength={300}
              value={descripcionDoc}
              onChange={(event) => setDescripcionDoc(event.target.value)}
              placeholder="Descripción (opcional), p. ej. Contrato firmado"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <button type="submit" disabled={subiendo} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {subiendo ? 'Subiendo...' : 'Subir documentos'}
            </button>
          </form>
        )}
      </section>

      {activa && tiene(PERMISOS.VENTAS_DESISTIR) && (
        <section className="mt-8">
          <button
            type="button"
            onClick={() => setMostrarDesistir((v) => !v)}
            className="rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Registrar desistimiento
          </button>
          {mostrarDesistir && (
            <form onSubmit={handleDesistir} className="mt-3 space-y-3 rounded-lg border border-red-200 bg-white p-4">
              <p className="text-sm text-slate-600">
                El cliente desiste de la compra. No se borra ningún abono ni recibo; los valores a devolver y a retener los escribes tú (el sistema no mueve dinero).
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="desFecha" className="block text-sm text-slate-700">Fecha</label>
                  <input id="desFecha" type="date" required value={desistimiento.fecha} onChange={(e) => setDesistimiento({ ...desistimiento, fecha: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900" />
                </div>
                <div>
                  <label htmlFor="desDevolver" className="block text-sm text-slate-700">A devolver (pesos)</label>
                  <input id="desDevolver" inputMode="numeric" value={desistimiento.valorDevolver} onChange={(e) => setDesistimiento({ ...desistimiento, valorDevolver: e.target.value.replace(/\D/g, '') })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900" />
                </div>
                <div>
                  <label htmlFor="desRetener" className="block text-sm text-slate-700">A retener (pesos)</label>
                  <input id="desRetener" inputMode="numeric" value={desistimiento.valorRetener} onChange={(e) => setDesistimiento({ ...desistimiento, valorRetener: e.target.value.replace(/\D/g, '') })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900" />
                </div>
              </div>
              <div>
                <label htmlFor="desMotivo" className="block text-sm text-slate-700">Motivo</label>
                <textarea id="desMotivo" required minLength={5} maxLength={500} rows={2} value={desistimiento.motivo} onChange={(e) => setDesistimiento({ ...desistimiento, motivo: e.target.value })} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900" />
              </div>
              <button type="submit" disabled={desistiendo} className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                {desistiendo ? 'Registrando...' : 'Confirmar desistimiento'}
              </button>
            </form>
          )}
        </section>
      )}

      <h2 className="mt-8 text-sm font-semibold text-slate-900">Abonos registrados</h2>
      {errorComprobante && (
        <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorComprobante}
        </div>
      )}
      <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[30rem] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Fecha</th>
              <th className="px-4 py-2 font-medium">Valor</th>
              <th className="px-4 py-2 font-medium">Medio de pago</th>
              <th className="px-4 py-2 font-medium">Comprobante</th>
            </tr>
          </thead>
          <tbody>
            {abonos.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  Todavía no hay abonos registrados.
                </td>
              </tr>
            )}
            {abonos.map((abono) => (
              <tr key={abono.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2">{formatearFecha(abono.fecha)}</td>
                <td className="px-4 py-2">{formatearCOP(abono.valor)}</td>
                <td className="px-4 py-2">{ETIQUETA_MEDIO_PAGO[abono.medioPago]}</td>
                <td className="px-4 py-2">
                  {abono.comprobanteUrl ? (
                    <button
                      type="button"
                      onClick={() => handleVerComprobante(abono.id)}
                      className="text-blue-600 hover:underline"
                    >
                      Ver
                    </button>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
