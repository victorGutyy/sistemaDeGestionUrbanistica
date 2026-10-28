import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Insignia } from '../components/formulario'
import { useAuth } from '../contexts/AuthContext'
import { listarTrabajadoresSst, obtenerAlertasSst, type AlertasSst, type TrabajadorSst } from '../lib/api'
import { PERMISOS } from '../lib/permisos'
import { ETIQUETA_CORTA_TIPO_ENTIDAD, TIPOS_ENTIDAD } from '../lib/seguridadSocial'

function Tarjeta({ titulo, valor, alerta }: { titulo: string; valor: number; alerta?: boolean }) {
  const hayAlerta = alerta && valor > 0
  return (
    <div className={`rounded-lg border p-4 ${hayAlerta ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <p className={`text-xs ${hayAlerta ? 'text-amber-800' : 'text-slate-500'}`}>{titulo}</p>
      <p className={`mt-1 text-lg font-semibold ${hayAlerta ? 'text-amber-900' : 'text-slate-900'}`}>{valor}</p>
    </div>
  )
}

// Página de inicio del módulo de seguridad y salud en el trabajo (CC-03): qué le falta a cada trabajador y acceso a su ficha.
export function SstPage() {
  const { tiene } = useAuth()
  const [trabajadores, setTrabajadores] = useState<TrabajadorSst[]>([])
  const [alertas, setAlertas] = useState<AlertasSst | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [buscar, setBuscar] = useState('')
  const [soloActivos, setSoloActivos] = useState(true)

  useEffect(() => {
    Promise.all([listarTrabajadoresSst(), obtenerAlertasSst()])
      .then(([lista, resumen]) => {
        setTrabajadores(lista)
        setAlertas(resumen)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setCargando(false))
  }, [])

  const alertaDe = useMemo(() => new Map((alertas?.trabajadores ?? []).map((a) => [a.trabajadorId, a])), [alertas])

  const visibles = useMemo(() => {
    const texto = buscar.trim().toLowerCase()
    return trabajadores.filter((t) => (!soloActivos || t.estado === 'ACTIVO') && (texto === '' || t.nombre.toLowerCase().includes(texto) || t.documento.includes(texto)))
  }, [trabajadores, buscar, soloActivos])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Seguridad y salud en el trabajo</h1>
          <p className="text-sm text-slate-500">Afiliaciones a la seguridad social, soportes y autorizaciones de los trabajadores.</p>
        </div>
        {tiene(PERMISOS.CONFIGURACION_EDITAR) && (
          <Link to="/configuracion/seguridad-social" className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Parámetros y entidades
          </Link>
        )}
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {alertas && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Tarjeta titulo="Trabajadores activos" valor={alertas.resumen.trabajadoresRevisados} />
          <Tarjeta titulo="Con alguna alerta" valor={alertas.resumen.conAlertas} alerta />
          <Tarjeta titulo="Sin afiliación completa" valor={alertas.resumen.sinAfiliacionCompleta} alerta />
          <Tarjeta titulo="Sin certificado de afiliación" valor={alertas.resumen.sinCertificadoAfiliacion} alerta />
          <Tarjeta titulo="Sin autorización de salud" valor={alertas.resumen.sinAutorizacionSalud} alerta />
        </div>
      )}

      <section>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Trabajadores</h2>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={soloActivos} onChange={(e) => setSoloActivos(e.target.checked)} />
              Solo activos
            </label>
            <input
              aria-label="Buscar trabajador"
              placeholder="Buscar por nombre o documento"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 sm:w-64"
            />
          </div>
        </div>

        <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Trabajador</th>
                <th className="px-4 py-3 font-medium">Cargo</th>
                <th className="px-4 py-3 font-medium">Afiliaciones</th>
                <th className="px-4 py-3 font-medium">Pendientes</th>
              </tr>
            </thead>
            <tbody>
              {!cargando && visibles.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                    {trabajadores.length === 0 ? 'Todavía no hay trabajadores registrados.' : 'Ningún trabajador coincide con la búsqueda.'}
                  </td>
                </tr>
              )}
              {visibles.map((t) => {
                const alerta = alertaDe.get(t.id)
                return (
                  <tr key={t.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3">
                      <Link to={`/sst/trabajadores/${t.id}`} className="text-blue-600 hover:underline">
                        {t.nombre}
                      </Link>
                      <span className="ml-1 text-xs text-slate-400">— {t.documento}</span>
                      {t.estado === 'INACTIVO' && <span className="ml-2"><Insignia tono="gris">Retirado</Insignia></span>}
                    </td>
                    <td className="px-4 py-3">{t.cargo}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {TIPOS_ENTIDAD.map((tipo) => {
                          const afiliacion = t.afiliaciones.find((a) => a.tipo === tipo)
                          return (
                            <span key={tipo} title={afiliacion ? afiliacion.entidad.nombre : 'Sin afiliación vigente'}>
                              <Insignia tono={afiliacion ? 'verde' : 'gris'}>{ETIQUETA_CORTA_TIPO_ENTIDAD[tipo]}</Insignia>
                            </span>
                          )
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {alerta ? (
                        <div className="flex flex-wrap gap-1">
                          {alerta.afiliacionesFaltantes.length > 0 && <Insignia tono="ambar">Faltan {alerta.afiliacionesFaltantes.length} afiliaciones</Insignia>}
                          {alerta.sinCertificadoAfiliacion && <Insignia tono="ambar">Sin certificado</Insignia>}
                          {alerta.sinAutorizacionSalud && <Insignia tono="ambar">Sin autorización</Insignia>}
                        </div>
                      ) : t.estado === 'ACTIVO' ? (
                        <Insignia tono="verde">Al día</Insignia>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
