import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { obtenerVenta, type Venta } from '../lib/api'

export function VentaDetallePage() {
  const { id } = useParams<{ id: string }>()
  const [venta, setVenta] = useState<Venta | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    obtenerVenta(id)
      .then(setVenta)
      .catch((err: Error) => setError(err.message))
  }, [id])

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>
  }

  if (!venta) {
    return <p className="text-sm text-slate-500">Cargando venta...</p>
  }

  return (
    <div className="max-w-2xl">
      <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
        Venta registrada correctamente.
      </div>

      <h1 className="mt-6 text-lg font-semibold text-slate-900">
        Lote {venta.lote.numero} — {venta.cliente.nombre}
      </h1>
      <p className="text-sm text-slate-500">
        Valor total: ${venta.valorTotal} · Cuota inicial: ${venta.cuotaInicial} ·{' '}
        {venta.formaPago === 'CONTADO' ? 'Contado' : 'Financiado'}
      </p>

      {venta.cuotas.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Cuota</th>
                <th className="px-4 py-2 font-medium">Vence</th>
                <th className="px-4 py-2 font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {venta.cuotas.map((cuota) => (
                <tr key={cuota.numero} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2">{cuota.numero}</td>
                  <td className="px-4 py-2">{cuota.fechaVencimiento.slice(0, 10)}</td>
                  <td className="px-4 py-2">${cuota.valor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
