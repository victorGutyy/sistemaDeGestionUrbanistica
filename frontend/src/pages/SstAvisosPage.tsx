import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso, CLASE_BOTON, Insignia, Seccion } from '../components/formulario'
import { useAuth } from '../contexts/AuthContext'
import { ejecutarAvisosSst, listarAvisosSst, type AvisoSst, type EstadoAvisoSst, type ResultadoAvisosSst, type TipoAvisoSst } from '../lib/api'
import { PERMISOS } from '../lib/permisos'
import { ETIQUETA_ESTADO_AVISO, ETIQUETA_TIPO_AVISO, TONO_ESTADO_AVISO } from '../lib/sst'

function fechaHora(fecha: string): string {
  return new Date(fecha).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function resumirResultado(r: ResultadoAvisosSst): string {
  const total = (campo: 'enviados' | 'fallidos' | 'omitidos') => r.actividades[campo] + r.capacitaciones[campo] + r.epp[campo]
  if (total('enviados') + total('fallidos') + total('omitidos') === 0) return 'No había avisos pendientes: todo lo que está próximo o vencido ya se había avisado.'
  const partes = [`${total('enviados')} enviado${total('enviados') === 1 ? '' : 's'}`]
  if (total('fallidos') > 0) partes.push(`${total('fallidos')} fallido${total('fallidos') === 1 ? '' : 's'}`)
  if (total('omitidos') > 0) partes.push(`${total('omitidos')} omitido${total('omitidos') === 1 ? '' : 's'} (el correo de la empresa no está configurado)`)
  return partes.join(', ') + '.'
}

// Pestaña de avisos por correo (RF-SST-14, 16 y 20): cada intento de los avisos automáticos con su resultado, y el botón para
// correr el proceso ahora.
export function SstAvisosPage() {
  const { tiene } = useAuth()
  const puedeGestionar = tiene(PERMISOS.SST_GESTIONAR)

  const [avisos, setAvisos] = useState<AvisoSst[] | null>(null)
  const [tipo, setTipo] = useState<TipoAvisoSst | ''>('')
  const [estado, setEstado] = useState<EstadoAvisoSst | ''>('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const cargar = useCallback(() => {
    listarAvisosSst({ tipo: tipo || undefined, estado: estado || undefined })
      .then(setAvisos)
      .catch((err: Error) => setError(err.message))
  }, [tipo, estado])

  useEffect(cargar, [cargar])

  async function enviarAhora() {
    setError(null)
    setOk(null)
    setEnviando(true)
    try {
      setOk(resumirResultado(await ejecutarAvisosSst()))
      cargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron enviar los avisos')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-6">
      <Seccion
        titulo="Avisos por correo"
        descripcion="Cada mañana (8:10 a. m., hora de Colombia) el sistema avisa al responsable de cada actividad del plan y de cada capacitación cuando queda próxima y cuando se vence, y manda un resumen de los EPP por reponer. Cada aviso sale una sola vez por estado."
        acciones={
          puedeGestionar && (
            <button type="button" disabled={enviando} onClick={() => void enviarAhora()} className={CLASE_BOTON}>
              {enviando ? 'Enviando…' : 'Enviar avisos ahora'}
            </button>
          )
        }
      >
        <Aviso error={error} ok={ok} />
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>El resumen de EPP va al "Correo de avisos SST" de Configuración. Sin ese correo, las alertas de EPP solo se ven en el panel.</li>
          <li>Si el correo de la empresa no está configurado, los avisos quedan "omitidos" y saldrán cuando lo esté.</li>
          <li>
            Los días de anticipación y el correo se cambian en{' '}
            <Link to="/configuracion" className="text-blue-600 hover:underline">
              Configuración
            </Link>
            .
          </li>
        </ul>
      </Seccion>

      <Seccion titulo="Historial" descripcion="Los 200 intentos más recientes. No se pueden editar ni borrar.">
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select aria-label="Filtrar por tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoAvisoSst | '')} className="rounded-md border border-slate-300 px-2 py-2 text-sm">
            <option value="">Todos los tipos</option>
            {(Object.keys(ETIQUETA_TIPO_AVISO) as TipoAvisoSst[]).map((t) => (
              <option key={t} value={t}>
                {ETIQUETA_TIPO_AVISO[t]}
              </option>
            ))}
          </select>
          <select aria-label="Filtrar por resultado" value={estado} onChange={(e) => setEstado(e.target.value as EstadoAvisoSst | '')} className="rounded-md border border-slate-300 px-2 py-2 text-sm">
            <option value="">Todos los resultados</option>
            {(Object.keys(ETIQUETA_ESTADO_AVISO) as EstadoAvisoSst[]).map((e) => (
              <option key={e} value={e}>
                {ETIQUETA_ESTADO_AVISO[e]}
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[42rem] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Fecha</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Resultado</th>
                <th className="px-3 py-2 font-medium">Para</th>
                <th className="px-3 py-2 font-medium">Asunto o detalle</th>
              </tr>
            </thead>
            <tbody>
              {avisos && avisos.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-slate-400">
                    Todavía no se ha intentado ningún aviso.
                  </td>
                </tr>
              )}
              {avisos?.map((a) => (
                <tr key={a.id} className="border-b border-slate-100 align-top last:border-0">
                  <td className="whitespace-nowrap px-3 py-2">{fechaHora(a.createdAt)}</td>
                  <td className="px-3 py-2">
                    {ETIQUETA_TIPO_AVISO[a.tipo]}
                    {a.cantidad !== null && <span className="block text-xs text-slate-500">{a.cantidad} elemento{a.cantidad === 1 ? '' : 's'}</span>}
                  </td>
                  <td className="px-3 py-2">
                    <Insignia tono={TONO_ESTADO_AVISO[a.estado]}>{ETIQUETA_ESTADO_AVISO[a.estado]}</Insignia>
                  </td>
                  <td className="px-3 py-2 break-all">{a.destinatario ?? '—'}</td>
                  <td className="px-3 py-2">
                    {a.asunto ?? '—'}
                    {a.detalle && <span className="block text-xs text-slate-500">{a.detalle}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Seccion>
    </div>
  )
}
