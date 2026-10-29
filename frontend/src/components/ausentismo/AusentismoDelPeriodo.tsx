import { useEffect, useState } from 'react'
import { obtenerNovedadesDelPeriodo, type NovedadPropuesta, type PropuestaDeAusentismo } from '../../lib/api'
import { formatearCOP, formatearFecha } from '../../lib/formato'

interface Resultado {
  clave: string
  propuestas: PropuestaDeAusentismo[] | null
  error: string | null
}

const fecha = (iso: string) => formatearFecha(`${iso}T12:00:00`)

function resumenDeDias(p: PropuestaDeAusentismo): string {
  const partes = [
    p.dias.empleador > 0 ? `${p.dias.empleador} del empleador` : null,
    p.dias.eps > 0 ? `${p.dias.eps} de la EPS` : null,
    p.dias.arl > 0 ? `${p.dias.arl} de la ARL` : null,
    p.dias.afp > 0 ? `${p.dias.afp} de la AFP` : null,
    p.dias.laborados > 0 ? `${p.dias.laborados} como laborado` : null,
    p.dias.descuento > 0 ? `${p.dias.descuento} a descontar` : null,
  ].filter(Boolean)
  return partes.join(' · ')
}

// Al registrar un pago de nómina (RF-SST-11): el ausentismo del trabajador que cae en el período pagado, con la novedad de
// incapacidad o de descuento que le corresponde. Es una sugerencia: el usuario decide si la agrega y puede ajustarla. La
// nómina se liquida fuera del sistema. Solo para quien puede ver valores; nunca muestra diagnósticos.
export function AusentismoDelPeriodo({
  trabajadorId,
  desde,
  hasta,
  agregadas,
  onAgregar,
}: {
  trabajadorId: string
  desde: string
  hasta: string
  // Las novedades que ya están en el formulario, para no agregar dos veces la misma.
  agregadas: { tipo: string; descripcion?: string }[]
  onAgregar: (novedad: NovedadPropuesta) => void
}) {
  const clave = desde && hasta && desde <= hasta ? `${trabajadorId}|${desde}|${hasta}` : null
  const [resultado, setResultado] = useState<Resultado | null>(null)

  useEffect(() => {
    if (!clave) return
    let cancelado = false
    obtenerNovedadesDelPeriodo(trabajadorId, desde, hasta)
      .then((propuestas) => !cancelado && setResultado({ clave, propuestas, error: null }))
      .catch((err: Error) => !cancelado && setResultado({ clave, propuestas: null, error: err.message }))
    return () => {
      cancelado = true
    }
  }, [clave, trabajadorId, desde, hasta])

  if (!clave) return null
  const actual = resultado?.clave === clave ? resultado : null

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3" aria-live="polite">
      <p className="text-sm font-medium text-slate-700">Ausentismo en este período</p>
      {!actual && <p className="mt-1 text-xs text-slate-500">Buscando…</p>}
      {actual?.error && <p className="mt-1 text-xs text-red-700">{actual.error}</p>}
      {actual?.propuestas?.length === 0 && <p className="mt-1 text-xs text-slate-500">El trabajador no tiene incapacidades ni licencias registradas en este período.</p>}
      <ul className="mt-2 space-y-3">
        {actual?.propuestas?.map((p) => (
          <li key={p.ausentismoId} className="rounded-md border border-slate-200 bg-white p-3">
            <p className="text-sm font-medium text-slate-900">
              {p.tipo}
              {p.numeroDocumento ? ` · ${p.numeroDocumento}` : ''}
            </p>
            <p className="text-xs text-slate-500">
              {fecha(p.desde)} a {fecha(p.hasta)} · {p.diasEnPeriodo} {p.diasEnPeriodo === 1 ? 'día' : 'días'} en el período: {resumenDeDias(p)}
            </p>
            {p.avisos.map((aviso) => (
              <p key={aviso} className="mt-1 text-xs text-amber-800">
                {aviso}
              </p>
            ))}
            {p.novedades.map((n) => {
              const yaEsta = agregadas.some((a) => a.tipo === n.tipo && a.descripcion === n.descripcion)
              return (
                <div key={n.descripcion} className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-slate-700">
                    <span className="font-medium">{n.tipo === 'INCAPACIDAD' ? 'Incapacidad' : 'Descuento'}</span> {formatearCOP(n.valor)}
                  </p>
                  <button
                    type="button"
                    disabled={yaEsta}
                    onClick={() => onAgregar(n)}
                    className="rounded-md border border-blue-300 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {yaEsta ? 'Ya agregada' : 'Agregar como novedad'}
                  </button>
                </div>
              )
            })}
          </li>
        ))}
      </ul>
    </div>
  )
}
