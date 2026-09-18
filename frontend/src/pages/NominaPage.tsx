import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listarTrabajadores, type Trabajador } from '../lib/api'

export function NominaPage() {
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([])
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    listarTrabajadores()
      .then(setTrabajadores)
      .catch((err: Error) => setError(err.message))
      .finally(() => setCargando(false))
  }, [])

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Nómina y talento humano</h1>
          <p className="text-sm text-slate-500">Trabajadores de la empresa y sus pagos de nómina.</p>
        </div>
        <Link
          to="/trabajadores/nuevo"
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Nuevo trabajador
        </Link>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Cargo</th>
              <th className="px-4 py-3 font-medium">Salario base</th>
              <th className="px-4 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {!cargando && trabajadores.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                  Todavía no hay trabajadores registrados.
                </td>
              </tr>
            )}
            {trabajadores.map((trabajador) => (
              <tr key={trabajador.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">
                  <Link to={`/trabajadores/${trabajador.id}`} className="text-blue-600 hover:underline">
                    {trabajador.nombre}
                  </Link>
                  <span className="ml-1 text-xs text-slate-400">— {trabajador.documento}</span>
                </td>
                <td className="px-4 py-3">{trabajador.cargo}</td>
                <td className="px-4 py-3">${trabajador.salarioBase}</td>
                <td className="px-4 py-3">{trabajador.estado}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
