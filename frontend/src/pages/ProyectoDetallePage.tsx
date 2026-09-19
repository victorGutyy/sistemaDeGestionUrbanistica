import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { actualizarEstadoProyecto, obtenerProyecto, type ProyectoConLotes } from '../lib/api'
import { calcularAreaDisponible, formatearArea } from '../lib/area'

export function ProyectoDetallePage() {
  const { id } = useParams<{ id: string }>()
  const [proyecto, setProyecto] = useState<ProyectoConLotes | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actualizandoEstado, setActualizandoEstado] = useState(false)

  useEffect(() => {
    if (!id) return
    obtenerProyecto(id)
      .then(setProyecto)
      .catch((err: Error) => setError(err.message))
  }, [id])

  async function handleCambiarEstado() {
    if (!proyecto) return
    const finalizando = proyecto.estado === 'ACTIVO'
    const confirmado = window.confirm(
      finalizando
        ? `¿Marcar "${proyecto.nombre}" como finalizado? Ya no se le podrán agregar lotes nuevos. Puedes reactivarlo después si te equivocas.`
        : `¿Reactivar "${proyecto.nombre}"?`,
    )
    if (!confirmado) return

    setActualizandoEstado(true)
    setError(null)
    try {
      const actualizado = await actualizarEstadoProyecto(proyecto.id, finalizando ? 'FINALIZADO' : 'ACTIVO')
      setProyecto({ ...proyecto, estado: actualizado.estado })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el estado del proyecto')
    } finally {
      setActualizandoEstado(false)
    }
  }

  if (error && !proyecto) {
    return <p className="text-sm text-red-600">{error}</p>
  }

  if (!proyecto) {
    return <p className="text-sm text-slate-500">Cargando proyecto...</p>
  }

  const finalizado = proyecto.estado === 'FINALIZADO'
  const areaDisponible = calcularAreaDisponible(proyecto.areaTotal, proyecto.lotes)
  const areaSubdividida = Number(proyecto.areaTotal) - areaDisponible

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-slate-900">{proyecto.nombre}</h1>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                finalizado ? 'bg-slate-200 text-slate-600' : 'bg-green-100 text-green-700'
              }`}
            >
              {finalizado ? 'Finalizado' : 'Activo'}
            </span>
          </div>
          <p className="text-sm text-slate-500">
            {proyecto.ubicacion ?? 'Sin ubicación registrada'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCambiarEstado}
            disabled={actualizandoEstado}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {finalizado ? 'Reactivar proyecto' : 'Marcar como finalizado'}
          </button>
          {!finalizado && (
            <Link
              to={`/proyectos/${proyecto.id}/lotes/nuevo`}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Nuevo lote
            </Link>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="mt-6 grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Área total</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{formatearArea(Number(proyecto.areaTotal))} m²</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Ya subdividida ({proyecto.lotes.length} lote(s))</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{formatearArea(areaSubdividida)} m²</p>
        </div>
        <div
          className={`rounded-lg border p-4 ${
            areaDisponible < 0 ? 'border-red-200 bg-red-50' : 'border-blue-200 bg-blue-50'
          }`}
        >
          <p className={`text-xs ${areaDisponible < 0 ? 'text-red-700' : 'text-blue-700'}`}>
            {areaDisponible < 0 ? 'Área excedida' : 'Área disponible'}
          </p>
          <p className={`mt-1 text-lg font-semibold ${areaDisponible < 0 ? 'text-red-900' : 'text-blue-900'}`}>
            {formatearArea(areaDisponible)} m²
          </p>
        </div>
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
