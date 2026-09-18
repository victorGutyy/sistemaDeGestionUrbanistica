import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { obtenerProyecto, type ProyectoConLotes } from '../lib/api'

export function ProyectoDetallePage() {
  const { id } = useParams<{ id: string }>()
  const [proyecto, setProyecto] = useState<ProyectoConLotes | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    obtenerProyecto(id)
      .then(setProyecto)
      .catch((err: Error) => setError(err.message))
  }, [id])

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>
  }

  if (!proyecto) {
    return <p className="text-sm text-slate-500">Cargando proyecto...</p>
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{proyecto.nombre}</h1>
          <p className="text-sm text-slate-500">
            {proyecto.ubicacion ?? 'Sin ubicación registrada'} · Área total: {proyecto.areaTotal} m² ·{' '}
            {proyecto.estado}
          </p>
        </div>
        <Link
          to={`/proyectos/${proyecto.id}/lotes/nuevo`}
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Nuevo lote
        </Link>
      </div>

      <h2 className="mt-8 text-sm font-semibold text-slate-900">Lotes</h2>
      <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Número</th>
              <th className="px-4 py-2 font-medium">Área</th>
              <th className="px-4 py-2 font-medium">Valor de venta</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {proyecto.lotes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  Este proyecto todavía no tiene lotes.
                </td>
              </tr>
            )}
            {proyecto.lotes.map((lote) => (
              <tr key={lote.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2">{lote.numero}</td>
                <td className="px-4 py-2">{lote.area} m²</td>
                <td className="px-4 py-2">${lote.valorVenta}</td>
                <td className="px-4 py-2">{lote.estado}</td>
                <td className="px-4 py-2 text-right">
                  {lote.estado === 'DISPONIBLE' && (
                    <Link
                      to={`/ventas/nueva?loteId=${lote.id}`}
                      className="text-sm font-medium text-blue-600 hover:underline"
                    >
                      Vender
                    </Link>
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
