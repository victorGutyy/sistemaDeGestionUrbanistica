import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CLASE_BOTON, CLASE_INPUT } from '../components/formulario'
import { listarLiquidaciones, listarProyectos, type LiquidacionResumen, type Proyecto } from '../lib/api'
import { fechaParaInput, formatearCOP, formatearFecha } from '../lib/formato'

// Las liquidaciones de nómina ya hechas, una por obra y quincena (CC-09, RF-PER-26). Al abrir una se ven sus pagos y se pueden
// corregir si algo salió mal.
export function LiquidacionesPage() {
  const [obras, setObras] = useState<Proyecto[]>([])
  const [proyectoId, setProyectoId] = useState('')
  const [liquidaciones, setLiquidaciones] = useState<LiquidacionResumen[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listarProyectos()
      .then(setObras)
      .catch(() => setObras([]))
  }, [])

  useEffect(() => {
    listarLiquidaciones(proyectoId || undefined)
      .then((datos) => {
        setLiquidaciones(datos)
        setError(null)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setCargando(false))
  }, [proyectoId])

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/nomina" className="text-sm text-blue-600 hover:underline">
            ← Nómina
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-slate-900">Liquidaciones de nómina</h1>
          <p className="text-sm text-slate-500">Una por obra y quincena. Ábrela para ver sus pagos y corregir lo que haya salido mal.</p>
        </div>
        <Link to="/nomina/liquidar" className={CLASE_BOTON}>
          Liquidar quincena
        </Link>
      </div>

      <div className="max-w-sm">
        <label htmlFor="filtro-obra" className="block text-sm font-medium text-slate-700">
          Obra
        </label>
        <select id="filtro-obra" value={proyectoId} onChange={(e) => {
            setCargando(true)
            setProyectoId(e.target.value)
          }} className={CLASE_INPUT}>
          <option value="">Todas las obras</option>
          {obras.map((obra) => (
            <option key={obra.id} value={obra.id}>
              {obra.nombre}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Obra</th>
              <th className="px-4 py-3 font-medium">Quincena</th>
              <th className="px-4 py-3 font-medium">Trabajadores</th>
              <th className="px-4 py-3 font-medium">Devengado</th>
              <th className="px-4 py-3 font-medium">Pagado</th>
              <th className="px-4 py-3 font-medium">Último pago</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {!cargando && liquidaciones.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  Todavía no hay liquidaciones{proyectoId ? ' de esta obra' : ''}.
                </td>
              </tr>
            )}
            {liquidaciones.map((l) => {
              const inicio = fechaParaInput(l.periodoInicio)
              const fin = fechaParaInput(l.periodoFin)
              return (
                <tr key={`${l.proyecto.id}-${inicio}-${fin}`} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3">{l.proyecto.nombre}</td>
                  <td className="px-4 py-3">
                    {formatearFecha(l.periodoInicio)} a {formatearFecha(l.periodoFin)}
                  </td>
                  <td className="px-4 py-3">{l.trabajadores}</td>
                  <td className="px-4 py-3">{formatearCOP(l.devengado)}</td>
                  <td className="px-4 py-3 font-medium">{formatearCOP(l.pagado)}</td>
                  <td className="px-4 py-3">{l.ultimaFechaPago ? formatearFecha(l.ultimaFechaPago) : '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/nomina/liquidaciones/${l.proyecto.id}/${inicio}/${fin}`} className="text-blue-600 hover:underline">
                      Ver o corregir
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {liquidaciones.length >= 300 && <p className="text-xs text-slate-400">Se muestran las 300 más recientes. Filtra por obra para ver las anteriores.</p>}
    </div>
  )
}
