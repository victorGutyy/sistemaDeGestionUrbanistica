import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  listarAbonosPorVenta,
  obtenerVenta,
  urlComprobante,
  type Abono,
  type EstadoCuota,
  type Venta,
} from '../lib/api'

const ESTILO_ESTADO_CUOTA: Record<EstadoCuota, string> = {
  PENDIENTE: 'bg-slate-100 text-slate-600',
  PARCIAL: 'bg-amber-100 text-amber-700',
  PAGADA: 'bg-green-100 text-green-700',
}

const ETIQUETA_MEDIO_PAGO: Record<Abono['medioPago'], string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  CHEQUE: 'Cheque',
  TARJETA: 'Tarjeta',
}

export function VentaDetallePage() {
  const { id } = useParams<{ id: string }>()
  const [venta, setVenta] = useState<Venta | null>(null)
  const [abonos, setAbonos] = useState<Abono[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    Promise.all([obtenerVenta(id), listarAbonosPorVenta(id)])
      .then(([ventaRecibida, abonosRecibidos]) => {
        setVenta(ventaRecibida)
        setAbonos(abonosRecibidos)
      })
      .catch((err: Error) => setError(err.message))
  }, [id])

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>
  }

  if (!venta) {
    return <p className="text-sm text-slate-500">Cargando venta...</p>
  }

  const estadoCuenta = venta.estadoCuenta

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            Lote {venta.lote.numero} — {venta.cliente.nombre}
          </h1>
          <p className="text-sm text-slate-500">
            Valor total: ${venta.valorTotal} · Cuota inicial: ${venta.cuotaInicial} ·{' '}
            {venta.formaPago === 'CONTADO' ? 'Contado' : 'Financiado'}
          </p>
        </div>
        <Link
          to={`/ventas/${venta.id}/abonos/nuevo`}
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Registrar abono
        </Link>
      </div>

      {estadoCuenta && (
        <div className="mt-6 grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Total pagado</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">${estadoCuenta.totalPagado}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Saldo pendiente</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">${estadoCuenta.saldoPendiente}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Próxima cuota</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {estadoCuenta.proximaCuota
                ? `#${estadoCuenta.proximaCuota.numero} · ${estadoCuenta.proximaCuota.fechaVencimiento.slice(0, 10)}`
                : '—'}
            </p>
          </div>
        </div>
      )}

      {venta.cuotas.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
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
                  <td className="px-4 py-2">{cuota.numero}</td>
                  <td className="px-4 py-2">{cuota.fechaVencimiento.slice(0, 10)}</td>
                  <td className="px-4 py-2">${cuota.valor}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTILO_ESTADO_CUOTA[cuota.estado]}`}>
                      {cuota.estado}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {cuota.estado !== 'PAGADA' && (
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

      <h2 className="mt-8 text-sm font-semibold text-slate-900">Abonos registrados</h2>
      <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
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
                <td className="px-4 py-2">{abono.fecha.slice(0, 10)}</td>
                <td className="px-4 py-2">${abono.valor}</td>
                <td className="px-4 py-2">{ETIQUETA_MEDIO_PAGO[abono.medioPago]}</td>
                <td className="px-4 py-2">
                  {abono.comprobanteUrl ? (
                    <a
                      href={urlComprobante(abono.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      Ver
                    </a>
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
