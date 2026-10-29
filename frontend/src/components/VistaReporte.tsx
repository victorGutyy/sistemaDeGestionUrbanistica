import type { ReporteGenerado } from '../lib/api'
import { TablaReporte } from './TablaReporte'

// Un reporte ya generado en pantalla: su título, lo que se pidió (los filtros, en palabras) y cada sección como tabla.
// Lo usan la pantalla de Reportes y la de Reportes de seguridad y salud en el trabajo.
export function VistaReporte({ reporte }: { reporte: ReporteGenerado }) {
  return (
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
  )
}
