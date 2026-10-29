import { useEffect, useState } from 'react'
import { descargarNovedadesAusentismo, obtenerNovedadesAusentismo, type ReporteGenerado } from '../../lib/api'
import { NOMBRES_MES } from '../../lib/ausentismo'
import { formatearCOP, formatearFecha } from '../../lib/formato'
import { Aviso, CLASE_BOTON, Seccion } from '../formulario'

const ENCABEZADOS_CORTOS: Record<string, string> = {
  documentoTrabajador: 'Documento',
  numeroDocumento: 'N.º incapacidad',
  diasEmpleador: 'Emp.',
  diasEps: 'EPS',
  diasArl: 'ARL',
  diasAfp: 'AFP',
  diasLaborados: 'Laborados',
  diasDescuento: 'Descontar',
}

function celda(tipo: string, valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  if (tipo === 'pesos') return formatearCOP(valor)
  if (tipo === 'fecha') return formatearFecha(`${valor}T12:00:00`)
  return String(valor)
}

// Novedades de ausentismo del mes para la nómina (RF-SST-11): por cada ausentismo vigente con días en el mes, el documento,
// los días y los valores de cada pagador, listas para llevarlas a la nómina (que se liquida fuera del sistema). Es lo que va
// en el Excel. Trae valores, así que solo las ve quien tiene permiso para verlos; nunca lleva diagnósticos.
export function NovedadesAusentismo() {
  const hoy = new Date()
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mes, setMes] = useState(hoy.getMonth() + 1)
  const [reporte, setReporte] = useState<ReporteGenerado | null>(null)
  const [descargando, setDescargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    obtenerNovedadesAusentismo(anio, mes)
      .then((r) => {
        setReporte(r)
        setError(null)
      })
      .catch((err: Error) => setError(err.message))
  }, [anio, mes])

  async function descargar() {
    setError(null)
    setDescargando(true)
    try {
      await descargarNovedadesAusentismo(anio, mes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo descargar el Excel')
    } finally {
      setDescargando(false)
    }
  }

  const seccion = reporte?.secciones[0]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="nov-mes" className="block text-xs text-slate-500">
            Mes
          </label>
          <select id="nov-mes" value={mes} onChange={(e) => setMes(Number(e.target.value))} className="mt-1 rounded-md border border-slate-300 px-2 py-2 text-sm">
            {NOMBRES_MES.map((nombre, i) => (
              <option key={nombre} value={i + 1}>
                {nombre.charAt(0).toUpperCase() + nombre.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="nov-anio" className="block text-xs text-slate-500">
            Año
          </label>
          <input id="nov-anio" type="number" min={2000} max={2100} value={anio} onChange={(e) => setAnio(Number(e.target.value) || anio)} className="mt-1 w-24 rounded-md border border-slate-300 px-2 py-2 text-center text-sm" />
        </div>
        <button type="button" className={`${CLASE_BOTON} sm:ml-auto`} disabled={descargando || !seccion || seccion.filas.length === 0} onClick={() => void descargar()}>
          {descargando ? 'Descargando…' : 'Descargar Excel'}
        </button>
      </div>

      <Aviso error={error} />

      <Seccion titulo={reporte?.titulo ?? 'Novedades para la nómina'} descripcion={seccion?.nota ?? reporte?.descripcion}>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[60rem] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                {seccion?.columnas.map((c) => (
                  <th key={c.clave} className={`px-3 py-2 font-medium ${c.tipo === 'pesos' || c.tipo === 'entero' ? 'text-right' : ''}`}>
                    {ENCABEZADOS_CORTOS[c.clave] ?? c.encabezado}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {seccion && seccion.filas.length === 0 && (
                <tr>
                  <td colSpan={seccion.columnas.length} className="px-3 py-10 text-center text-slate-400">
                    No hay ausentismos con días en este mes.
                  </td>
                </tr>
              )}
              {seccion?.filas.map((fila, i) => (
                <tr key={i} className="border-b border-slate-100 align-top">
                  {seccion.columnas.map((c) => (
                    <td key={c.clave} className={`whitespace-nowrap px-3 py-2 ${c.tipo === 'pesos' || c.tipo === 'entero' ? 'text-right' : ''}`}>
                      {celda(c.tipo, fila[c.clave])}
                    </td>
                  ))}
                </tr>
              ))}
              {seccion?.totales && (
                <tr className="bg-slate-50 font-semibold text-slate-900">
                  {seccion.columnas.map((c) => (
                    <td key={c.clave} className={`whitespace-nowrap px-3 py-2 ${c.tipo === 'pesos' || c.tipo === 'entero' ? 'text-right' : ''}`}>
                      {seccion.totales && seccion.totales[c.clave] !== undefined ? celda(c.tipo, seccion.totales[c.clave]) : ''}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">Los valores a cargo de la EPS, la ARL y la AFP son lo que esas entidades reconocen, no lo que paga la empresa. El Excel trae las mismas columnas. Si no ves todas en pantalla, desliza la tabla hacia los lados.</p>
      </Seccion>
    </div>
  )
}
