import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listarProyectos, type Proyecto } from '../lib/api'

export function ProyectosPage() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listarProyectos()
      .then(setProyectos)
      .catch((err: Error) => setError(err.message))
      .finally(() => setCargando(false))
  }, [])

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Proyectos</h1>
          <p className="text-sm text-slate-500">Predios y su subdivisión en lotes.</p>
        </div>
        <Link
          to="/ventas/nueva"
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Registrar venta
        </Link>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Ubicación</th>
              <th className="px-4 py-3 font-medium">Área total</th>
              <th className="px-4 py-3 font-medium">Lotes</th>
              <th className="px-4 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {!cargando && proyectos.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  Todavía no hay proyectos registrados.
                </td>
              </tr>
            )}
            {proyectos.map((proyecto) => (
              <tr key={proyecto.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">{proyecto.nombre}</td>
                <td className="px-4 py-3">{proyecto.ubicacion ?? '—'}</td>
                <td className="px-4 py-3">{proyecto.areaTotal} m²</td>
                <td className="px-4 py-3">{proyecto._count.lotes}</td>
                <td className="px-4 py-3">{proyecto.estado}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
