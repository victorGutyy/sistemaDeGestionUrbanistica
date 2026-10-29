import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { VistaReporte } from '../components/VistaReporte'
import { Aviso, CLASE_INPUT } from '../components/formulario'
import {
  exportarReporteSst,
  generarReporteSst,
  obtenerCatalogoReportesSst,
  type CatalogoReportesSst,
  type ClaveFiltroReporteSst,
  type DefinicionReporteSst,
  type FiltroReporteSstDefinido,
  type FiltrosReporteSst,
  type ReporteGenerado,
} from '../lib/api'
import { NOMBRES_MES } from '../lib/ausentismo'
import { hoyEnBogota } from '../lib/formato'

const MESES = NOMBRES_MES.map((nombre, indice) => ({ valor: String(indice + 1), etiqueta: nombre.charAt(0).toUpperCase() + nombre.slice(1) }))

// Valores con los que arranca cada reporte: el año en curso donde se pide un año, y los registros vigentes en el detalle de ausentismo.
function filtrosIniciales(reporte: DefinicionReporteSst): FiltrosReporteSst {
  const filtros: FiltrosReporteSst = {}
  if (reporte.filtros.some((f) => f.clave === 'anio')) filtros.anio = hoyEnBogota().slice(0, 4)
  if (reporte.filtros.some((f) => f.tipo === 'estadoRegistro')) filtros.estado = 'VIGENTES'
  return filtros
}

// Reportes de seguridad y salud en el trabajo (RF-SST-22): se elige un reporte, se ponen los filtros y se ve en pantalla o se
// baja en PDF o Excel. Lo que sale lo decide el servidor según el rol: nunca lleva diagnósticos y los valores en pesos solo
// salen para quien puede verlos.
export function SstReportesPage() {
  const [catalogo, setCatalogo] = useState<CatalogoReportesSst | null>(null)
  const [seleccionado, setSeleccionado] = useState<string | null>(null)
  const [filtros, setFiltros] = useState<FiltrosReporteSst>({})
  const [reporte, setReporte] = useState<ReporteGenerado | null>(null)
  const [cargando, setCargando] = useState(false)
  const [exportando, setExportando] = useState<'pdf' | 'excel' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    obtenerCatalogoReportesSst()
      .then((datos) => {
        setCatalogo(datos)
        if (datos.reportes[0]) {
          setSeleccionado(datos.reportes[0].clave)
          setFiltros(filtrosIniciales(datos.reportes[0]))
        }
      })
      .catch((err: Error) => setError(err.message))
  }, [])

  const definicion = useMemo(() => catalogo?.reportes.find((r) => r.clave === seleccionado) ?? null, [catalogo, seleccionado])

  function elegir(elegido: DefinicionReporteSst) {
    setSeleccionado(elegido.clave)
    setFiltros(filtrosIniciales(elegido))
    setReporte(null)
    setError(null)
  }

  function cambiar(clave: ClaveFiltroReporteSst, valor: string) {
    setFiltros((actual) => ({ ...actual, [clave]: valor || undefined }))
  }

  async function handleVer(event: FormEvent) {
    event.preventDefault()
    if (!definicion) return
    setCargando(true)
    setError(null)
    try {
      setReporte(await generarReporteSst(definicion.clave, filtros))
    } catch (err) {
      setReporte(null)
      setError(err instanceof Error ? err.message : 'No se pudo generar el reporte')
    } finally {
      setCargando(false)
    }
  }

  async function handleExportar(formato: 'pdf' | 'excel') {
    if (!definicion) return
    setExportando(formato)
    setError(null)
    try {
      await exportarReporteSst(definicion.clave, filtros, formato)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo descargar el reporte')
    } finally {
      setExportando(null)
    }
  }

  function campo(filtro: FiltroReporteSstDefinido) {
    const id = `filtro-sst-${filtro.clave}`
    const valor = filtros[filtro.clave] ?? ''
    const selector = (lista: { valor: string; etiqueta: string }[], conTodos = true) => (
      <select id={id} value={valor} onChange={(e) => cambiar(filtro.clave, e.target.value)} className={CLASE_INPUT}>
        {conTodos && <option value="">Todos</option>}
        {lista.map((opcion) => (
          <option key={opcion.valor} value={opcion.valor}>
            {opcion.etiqueta}
          </option>
        ))}
      </select>
    )
    const opciones = catalogo?.opciones

    let control
    switch (filtro.tipo) {
      case 'anio':
        control = <input id={id} type="number" inputMode="numeric" min={2000} max={2100} value={valor} onChange={(e) => cambiar(filtro.clave, e.target.value)} className={CLASE_INPUT} />
        break
      case 'mes':
        control = selector(MESES)
        break
      case 'fecha':
        control = <input id={id} type="date" value={valor} onChange={(e) => cambiar(filtro.clave, e.target.value)} className={CLASE_INPUT} />
        break
      case 'trabajador':
        control = selector((opciones?.trabajadores ?? []).map((t) => ({ valor: t.id, etiqueta: `${t.nombre} (${t.documento})` })))
        break
      case 'tipoAusentismo':
        control = selector((opciones?.tiposAusentismo ?? []).map((t) => ({ valor: t.id, etiqueta: t.nombre })))
        break
      case 'estadoRegistro':
        control = selector(opciones?.estadosRegistro ?? [], false)
        break
      case 'estadoActividad':
        control = selector(opciones?.estadosActividad ?? [])
        break
    }
    return (
      <div key={filtro.clave}>
        <label htmlFor={id} className="block text-sm font-medium text-slate-700">
          {filtro.etiqueta}
        </label>
        {control}
      </div>
    )
  }

  return (
    <div className="max-w-5xl space-y-4">
      <p className="text-sm text-slate-500">
        Elige un reporte, ponle los filtros y míralo aquí o descárgalo en PDF o Excel. Ningún reporte incluye diagnósticos ni observaciones de los trabajadores.
      </p>

      {error && !catalogo && <Aviso error={error} />}

      {catalogo && (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {catalogo.reportes.map((candidato) => (
              <button
                key={candidato.clave}
                type="button"
                onClick={() => elegir(candidato)}
                aria-pressed={candidato.clave === seleccionado}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  candidato.clave === seleccionado ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <p className="text-sm font-semibold text-slate-900">{candidato.titulo}</p>
                <p className="mt-0.5 text-xs text-slate-500">{candidato.descripcion}</p>
              </button>
            ))}
          </div>

          {definicion && (
            <form onSubmit={handleVer} className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-sm font-medium text-slate-900">{definicion.titulo}</p>
              {definicion.filtros.length > 0 && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{definicion.filtros.map(campo)}</div>}
              {error && <Aviso error={error} />}
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={cargando} className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 sm:w-auto">
                  {cargando ? 'Generando...' : 'Ver reporte'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleExportar('pdf')}
                  disabled={exportando !== null}
                  className="w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:w-auto"
                >
                  {exportando === 'pdf' ? 'Generando PDF...' : 'Descargar PDF'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleExportar('excel')}
                  disabled={exportando !== null}
                  className="w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:w-auto"
                >
                  {exportando === 'excel' ? 'Generando Excel...' : 'Descargar Excel'}
                </button>
              </div>
              <p className="text-xs text-slate-500">Descargar un reporte queda registrado en la auditoría.</p>
            </form>
          )}

          {reporte && <VistaReporte reporte={reporte} />}
        </>
      )}
    </div>
  )
}
