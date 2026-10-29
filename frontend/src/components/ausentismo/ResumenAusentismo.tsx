import { Fragment, useEffect, useState } from 'react'
import { obtenerResumenAusentismo, type FilaResumenAusentismo, type ResumenAusentismo as ResumenDelAnio } from '../../lib/api'
import { etiquetaMes, formatearPorcentajeTexto } from '../../lib/ausentismo'
import { formatearCOP } from '../../lib/formato'
import { Aviso, CLASE_BOTON_SECUNDARIO, Seccion } from '../formulario'

const sumaValores = (v: FilaResumenAusentismo['valores']) => (v ? Number(v.eps) + Number(v.arl) + Number(v.afp) : 0)

// Resumen mensual del año (RF-SST-10): registros, días totales y por tipo, quién paga, descuentos, trabajadores activos y
// porcentaje de ausentismo (días ÷ trabajadores activos × días del mes). Un ausentismo que cruza de mes cuenta en cada mes
// con los días de ese mes. Los valores solo llegan a quien puede verlos.
export function ResumenAusentismo() {
  const [anio, setAnio] = useState(() => new Date().getFullYear())
  const [resumen, setResumen] = useState<ResumenDelAnio | null>(null)
  const [abierto, setAbierto] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    obtenerResumenAusentismo(anio)
      .then((r) => {
        setResumen(r)
        setError(null)
      })
      .catch((err: Error) => setError(err.message))
  }, [anio])

  const conValores = resumen?.total.valores !== undefined

  return (
    <div className="space-y-6">
      <div className="flex items-end gap-1">
        <div>
          <label htmlFor="res-anio" className="block text-xs text-slate-500">
            Año
          </label>
          <div className="mt-1 flex items-center gap-1">
            <button type="button" aria-label="Año anterior" className={CLASE_BOTON_SECUNDARIO} onClick={() => setAnio(anio - 1)}>
              ‹
            </button>
            <input id="res-anio" type="number" min={2000} max={2100} value={anio} onChange={(e) => setAnio(Number(e.target.value) || anio)} className="w-24 rounded-md border border-slate-300 px-2 py-2 text-center text-sm" />
            <button type="button" aria-label="Año siguiente" className={CLASE_BOTON_SECUNDARIO} onClick={() => setAnio(anio + 1)}>
              ›
            </button>
          </div>
        </div>
      </div>

      <Aviso error={error} />

      {resumen && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Registros del año</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{resumen.total.registros}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Días de ausentismo</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{resumen.total.dias}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Porcentaje de ausentismo</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{formatearPorcentajeTexto(resumen.total.porcentajeAusentismo)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Trabajadores activos (promedio)</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{resumen.total.trabajadoresActivos.toLocaleString('es-CO')}</p>
          </div>
        </div>
      )}

      <Seccion titulo={`Resumen mensual ${anio}`} descripcion="El porcentaje de ausentismo es los días de ausentismo del mes sobre los días que pudieron trabajar todos los trabajadores activos. Toca un mes para ver los días por tipo.">
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Mes</th>
                <th className="px-3 py-2 text-right font-medium">Registros</th>
                <th className="px-3 py-2 text-right font-medium">Días</th>
                <th className="px-3 py-2 text-right font-medium">Activos</th>
                <th className="px-3 py-2 text-right font-medium">% ausentismo</th>
                <th className="px-3 py-2 text-right font-medium">Empleador / EPS / ARL / AFP (días)</th>
                {conValores && <th className="px-3 py-2 text-right font-medium">Empleador</th>}
                {conValores && <th className="px-3 py-2 text-right font-medium">Entidades</th>}
                {conValores && <th className="px-3 py-2 text-right font-medium">Descuentos</th>}
              </tr>
            </thead>
            <tbody>
              {resumen?.meses.map((m) => (
                <Fragment key={m.mes}>
                  <tr className={`border-b border-slate-100 ${m.registros > 0 ? 'cursor-pointer hover:bg-slate-50' : 'text-slate-400'}`} onClick={() => m.registros > 0 && setAbierto(abierto === m.mes ? null : m.mes)}>
                    <td className="px-3 py-2 capitalize">{etiquetaMes(resumen.anio, m.mes).split(' de ')[0]}</td>
                    <td className="px-3 py-2 text-right">{m.registros}</td>
                    <td className="px-3 py-2 text-right">{m.dias}</td>
                    <td className="px-3 py-2 text-right">{m.trabajadoresActivos}</td>
                    <td className="px-3 py-2 text-right">{formatearPorcentajeTexto(m.porcentajeAusentismo)}</td>
                    <td className="px-3 py-2 text-right">
                      {m.diasPorPagador.empleador} / {m.diasPorPagador.eps} / {m.diasPorPagador.arl} / {m.diasPorPagador.afp}
                    </td>
                    {conValores && <td className="px-3 py-2 text-right">{formatearCOP(m.valores?.empleador)}</td>}
                    {conValores && <td className="px-3 py-2 text-right">{formatearCOP(sumaValores(m.valores))}</td>}
                    {conValores && <td className="px-3 py-2 text-right">{formatearCOP(m.valores?.descuento)}</td>}
                  </tr>
                  {abierto === m.mes && (
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <td colSpan={conValores ? 9 : 6} className="px-3 py-3">
                        <p className="mb-1 text-xs font-medium text-slate-500">Días por tipo de ausentismo</p>
                        <ul className="grid gap-1 sm:grid-cols-2">
                          {m.porTipo.map((t) => (
                            <li key={t.tipoId} className="flex justify-between gap-3 text-sm text-slate-700">
                              <span>{t.nombre}</span>
                              <span className="whitespace-nowrap text-slate-500">
                                {t.dias} {t.dias === 1 ? 'día' : 'días'} · {t.registros} {t.registros === 1 ? 'registro' : 'registros'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {resumen && (
                <tr className="bg-slate-50 font-semibold text-slate-900">
                  <td className="px-3 py-2">Total {resumen.anio}</td>
                  <td className="px-3 py-2 text-right">{resumen.total.registros}</td>
                  <td className="px-3 py-2 text-right">{resumen.total.dias}</td>
                  <td className="px-3 py-2 text-right">{resumen.total.trabajadoresActivos.toLocaleString('es-CO')}</td>
                  <td className="px-3 py-2 text-right">{formatearPorcentajeTexto(resumen.total.porcentajeAusentismo)}</td>
                  <td className="px-3 py-2 text-right">
                    {resumen.total.diasPorPagador.empleador} / {resumen.total.diasPorPagador.eps} / {resumen.total.diasPorPagador.arl} / {resumen.total.diasPorPagador.afp}
                  </td>
                  {conValores && <td className="px-3 py-2 text-right">{formatearCOP(resumen.total.valores?.empleador)}</td>}
                  {conValores && <td className="px-3 py-2 text-right">{formatearCOP(sumaValores(resumen.total.valores))}</td>}
                  {conValores && <td className="px-3 py-2 text-right">{formatearCOP(resumen.total.valores?.descuento)}</td>}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Seccion>
    </div>
  )
}
