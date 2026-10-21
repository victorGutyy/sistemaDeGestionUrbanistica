import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { TablaReporte } from '../components/TablaReporte'
import {
  exportarReporte,
  generarReporte,
  obtenerCatalogoReportes,
  type CatalogoReportes,
  type ClaveFiltroReporte,
  type DefinicionReporte,
  type FiltroDefinido,
  type FiltrosReporte,
  type ReporteGenerado,
} from '../lib/api'
import { hoyEnBogota } from '../lib/formato'

const CLASE_INPUT =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500'

const AYUDA_DE_FILTRO: Partial<Record<ClaveFiltroReporte, string>> = {
  estadoLote: 'Si eliges un estado, además del resumen se lista lote por lote.',
}

// Valores con los que arranca cada reporte: el flujo de caja pide fechas (desde el primer día del mes), los demás van sin filtros.
function filtrosIniciales(reporte: DefinicionReporte): FiltrosReporte {
  const filtros: FiltrosReporte = {}
  const hoy = hoyEnBogota()
  if (reporte.filtros.some((f) => f.clave === 'desde' && f.obligatorio)) filtros.desde = `${hoy.slice(0, 8)}01`
  if (reporte.filtros.some((f) => f.clave === 'hasta' && f.obligatorio)) filtros.hasta = hoy
  if (reporte.filtros.some((f) => f.clave === 'granularidad')) filtros.granularidad = 'MES'
  if (reporte.filtros.some((f) => f.clave === 'fechaPor')) filtros.fechaPor = 'venta'
  return filtros
}

// Reportes (RF-REP-04 a 11): se elige un reporte, se ponen los filtros y se ve en pantalla o se baja en PDF o Excel.
export function ReportesPage() {
  const [catalogo, setCatalogo] = useState<CatalogoReportes | null>(null)
  const [seleccionado, setSeleccionado] = useState<string | null>(null)
  const [filtros, setFiltros] = useState<FiltrosReporte>({})
  const [reporte, setReporte] = useState<ReporteGenerado | null>(null)
  const [cargando, setCargando] = useState(false)
  const [exportando, setExportando] = useState<'pdf' | 'excel' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    obtenerCatalogoReportes()
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

  function elegir(reporteElegido: DefinicionReporte) {
    setSeleccionado(reporteElegido.clave)
    setFiltros(filtrosIniciales(reporteElegido))
    setReporte(null)
    setError(null)
  }

  function cambiar(clave: ClaveFiltroReporte, valor: string) {
    setFiltros((actual) => ({ ...actual, [clave]: valor || undefined }))
  }

  // Los filtros obligatorios que faltan, en palabras.
  function faltantes(): string[] {
    return (definicion?.filtros ?? []).filter((f) => f.obligatorio && !filtros[f.clave]).map((f) => f.etiqueta)
  }

  async function handleVer(event: FormEvent) {
    event.preventDefault()
    if (!definicion) return
    const faltan = faltantes()
    if (faltan.length > 0) {
      setError(`Completa: ${faltan.join(', ')}.`)
      return
    }
    setCargando(true)
    setError(null)
    try {
      setReporte(await generarReporte(definicion.clave, filtros))
    } catch (err) {
      setReporte(null)
      setError(err instanceof Error ? err.message : 'No se pudo generar el reporte')
    } finally {
      setCargando(false)
    }
  }

  async function handleExportar(formato: 'pdf' | 'excel') {
    if (!definicion) return
    const faltan = faltantes()
    if (faltan.length > 0) {
      setError(`Completa: ${faltan.join(', ')}.`)
      return
    }
    setExportando(formato)
    setError(null)
    try {
      await exportarReporte(definicion.clave, filtros, formato)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo descargar el reporte')
    } finally {
      setExportando(null)
    }
  }

  function campo(filtro: FiltroDefinido) {
    const id = `filtro-${filtro.clave}`
    const valor = filtros[filtro.clave] ?? ''
    const etiqueta = (
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {filtro.etiqueta}
        {filtro.obligatorio && <span className="text-red-600"> *</span>}
      </label>
    )
    const opciones = catalogo?.opciones
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

    let control
    switch (filtro.tipo) {
      case 'fecha':
        control = <input id={id} type="date" value={valor} onChange={(e) => cambiar(filtro.clave, e.target.value)} className={CLASE_INPUT} />
        break
      case 'proyecto':
        // En el informe del socio el proyecto es obligatorio: no hay opción "Todos".
        control = selector((opciones?.proyectos ?? []).map((p) => ({ valor: p.id, etiqueta: p.nombre })), !filtro.obligatorio)
        break
      case 'cuenta':
        control = selector((opciones?.cuentas ?? []).map((c) => ({ valor: c.id, etiqueta: `${c.alias} — ${c.banco}` })))
        break
      case 'usuario':
        control = selector((opciones?.usuarios ?? []).map((u) => ({ valor: u.id, etiqueta: u.nombre })))
        break
      case 'categoriaGasto':
        control = selector((opciones?.categoriasGasto ?? []).map((c) => ({ valor: c.id, etiqueta: c.nombre })))
        break
      case 'medioPago':
        control = selector(opciones?.mediosPago ?? [])
        break
      case 'estadoLote':
        control = selector(opciones?.estadosLote ?? [])
        break
      case 'granularidad':
        control = selector(opciones?.granularidades ?? [], false)
        break
      case 'vendedor':
        control = selector((opciones?.vendedores ?? []).map((v) => ({ valor: v.id, etiqueta: v.nombre })))
        break
      case 'estadoComision':
        control = selector(opciones?.estadosComision ?? [])
        break
      case 'fechaPor':
        control = selector(opciones?.fechasPor ?? [], false)
        break
    }
    return (
      <div key={filtro.clave}>
        {etiqueta}
        {control}
        {AYUDA_DE_FILTRO[filtro.clave] && <p className="mt-1 text-xs text-slate-500">{AYUDA_DE_FILTRO[filtro.clave]}</p>}
      </div>
    )
  }

  return (
    <div className="max-w-5xl">
      <h1 className="text-lg font-semibold text-slate-900">Reportes</h1>
      <p className="text-sm text-slate-500">Elige un reporte, ponle los filtros y míralo aquí o descárgalo en PDF o Excel.</p>

      {error && !catalogo && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {catalogo && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
            <form onSubmit={handleVer} className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-sm font-medium text-slate-900">{definicion.titulo}</p>
              {definicion.filtros.length > 0 && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{definicion.filtros.map(campo)}</div>}
              {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
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
            </form>
          )}

          {reporte && (
            <div className="mt-6">
              <h2 className="text-base font-semibold text-slate-900">{reporte.titulo}</h2>
              <p className="text-xs text-slate-500">{reporte.descripcion}</p>
              {reporte.filtros.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {reporte.filtros.map((filtro) => (
                    <li key={filtro.etiqueta} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700">
                      <span className="font-medium">{filtro.etiqueta}:</span> {filtro.valor}
                    </li>
                  ))}
                </ul>
              )}
              {reporte.secciones.map((seccion) => (
                <TablaReporte key={seccion.titulo} seccion={seccion} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
