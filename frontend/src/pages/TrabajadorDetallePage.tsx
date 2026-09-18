import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { obtenerTrabajador, type TrabajadorConPagos } from '../lib/api'

const ETIQUETA_NOVEDAD: Record<string, string> = {
  HORAS_EXTRA: 'Horas extra',
  DESCUENTO: 'Descuento',
  INCAPACIDAD: 'Incapacidad',
}

export function TrabajadorDetallePage() {
  const { id } = useParams<{ id: string }>()
  const [trabajador, setTrabajador] = useState<TrabajadorConPagos | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    obtenerTrabajador(id)
      .then(setTrabajador)
      .catch((err: Error) => setError(err.message))
  }, [id])

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>
  }

  if (!trabajador) {
    return <p className="text-sm text-slate-500">Cargando trabajador...</p>
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{trabajador.nombre}</h1>
          <p className="text-sm text-slate-500">
            {trabajador.cargo} — {trabajador.documento} · Salario base: ${trabajador.salarioBase}
          </p>
        </div>
        <Link
          to={`/trabajadores/${trabajador.id}/pagos/nuevo`}
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Registrar pago
        </Link>
      </div>

      <h2 className="mt-8 text-sm font-semibold text-slate-900">Pagos de nómina</h2>
      <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Período</th>
              <th className="px-4 py-2 font-medium">Fecha de pago</th>
              <th className="px-4 py-2 font-medium">Novedades</th>
              <th className="px-4 py-2 font-medium">Valor pagado</th>
            </tr>
          </thead>
          <tbody>
            {trabajador.pagos.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                  Todavía no hay pagos registrados.
                </td>
              </tr>
            )}
            {trabajador.pagos.map((pago) => (
              <tr key={pago.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2">
                  {pago.periodoInicio.slice(0, 10)} a {pago.periodoFin.slice(0, 10)}
                </td>
                <td className="px-4 py-2">{pago.fechaPago.slice(0, 10)}</td>
                <td className="px-4 py-2">
                  {pago.novedades.length === 0 ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <ul className="space-y-0.5">
                      {pago.novedades.map((novedad) => (
                        <li key={novedad.id} className="text-xs text-slate-600">
                          {ETIQUETA_NOVEDAD[novedad.tipo]}: ${novedad.valor}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="px-4 py-2 font-medium">${pago.valorPagado}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
