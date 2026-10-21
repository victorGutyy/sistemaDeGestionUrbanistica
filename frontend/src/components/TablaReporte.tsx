import type { SeccionReporte } from '../lib/api'
import { esColumnaNumerica as esNumerica, FILAS_EN_PANTALLA, textoDeCelda } from '../lib/reportes'

// Una sección de un reporte como tabla. En el celular la tabla se desliza dentro de su propio recuadro: la página nunca
// se desborda hacia los lados.
export function TablaReporte({ seccion }: { seccion: SeccionReporte }) {
  const visibles = seccion.filas.slice(0, FILAS_EN_PANTALLA)
  const recortadasAqui = seccion.filas.length > FILAS_EN_PANTALLA
  const totalReal = seccion.filasTotales ?? seccion.filas.length

  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold text-slate-900">{seccion.titulo}</h2>
      {seccion.nota && <p className="mt-0.5 text-xs text-slate-500">{seccion.nota}</p>}
      {(recortadasAqui || seccion.filasTotales) && (
        <p className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
          Se muestran las primeras {visibles.length} de {totalReal} filas. Descarga el PDF o el Excel para ver todo
          {seccion.filasTotales ? ' (el archivo también trae solo las primeras ' + seccion.filas.length + '; afina los filtros para ver el resto)' : ''}.
        </p>
      )}

      <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              {seccion.columnas.map((columna) => (
                <th key={columna.clave} scope="col" className={`whitespace-nowrap px-3 py-2 font-medium ${esNumerica(columna) ? 'text-right' : 'text-left'}`}>
                  {columna.encabezado}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibles.length === 0 && (
              <tr>
                <td colSpan={seccion.columnas.length} className="px-3 py-3 text-center text-xs text-slate-500">
                  No hay datos con estos filtros.
                </td>
              </tr>
            )}
            {visibles.map((fila, indice) => (
              <tr key={indice} className="odd:bg-white even:bg-slate-50/60">
                {seccion.columnas.map((columna) => (
                  <td key={columna.clave} className={`whitespace-nowrap px-3 py-1.5 text-slate-800 ${esNumerica(columna) ? 'text-right tabular-nums' : ''}`}>
                    {textoDeCelda(columna, fila[columna.clave])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {seccion.totales && (
            <tfoot className="border-t-2 border-slate-300 bg-slate-100 font-semibold text-slate-900">
              <tr>
                {seccion.columnas.map((columna) => (
                  <td key={columna.clave} className={`px-3 py-2 ${esNumerica(columna) ? 'whitespace-nowrap text-right tabular-nums' : ''}`}>
                    {textoDeCelda(columna, seccion.totales![columna.clave])}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  )
}
