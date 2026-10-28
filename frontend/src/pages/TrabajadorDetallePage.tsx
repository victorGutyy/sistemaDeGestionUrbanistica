import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Dato, Seccion } from '../components/formulario'
import { DatosPersonales } from '../components/trabajador/DatosPersonales'
import { ResumenLegal } from '../components/trabajador/ResumenLegal'
import { RetiroTrabajador } from '../components/trabajador/RetiroTrabajador'
import { SeccionAfiliaciones } from '../components/trabajador/SeccionAfiliaciones'
import { SeccionAutorizacionSalud } from '../components/trabajador/SeccionAutorizacionSalud'
import { SeccionDocumentos } from '../components/trabajador/SeccionDocumentos'
import { useAuth } from '../contexts/AuthContext'
import { PERMISOS } from '../lib/permisos'
import { obtenerTrabajador, type TrabajadorConPagos } from '../lib/api'
import { formatearCOP, formatearFecha } from '../lib/formato'
import { tiposDocumentoPermitidos } from '../lib/seguridadSocial'

const ETIQUETA_NOVEDAD: Record<string, string> = {
  HORAS_EXTRA: 'Horas extra',
  DESCUENTO: 'Descuento',
  INCAPACIDAD: 'Incapacidad',
}

export function TrabajadorDetallePage() {
  const { tiene } = useAuth()
  const { id } = useParams<{ id: string }>()
  const [trabajador, setTrabajador] = useState<TrabajadorConPagos | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(() => {
    if (!id) return
    obtenerTrabajador(id)
      .then(setTrabajador)
      .catch((err: Error) => setError(err.message))
  }, [id])

  useEffect(cargar, [cargar])

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>
  }

  if (!trabajador) {
    return <p className="text-sm text-slate-500">Cargando trabajador...</p>
  }

  const puedeGestionar = tiene(PERMISOS.NOMINA_GESTIONAR)

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to="/nomina" className="text-sm text-blue-600 hover:underline">
            ← Nómina
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-slate-900">{trabajador.nombre}</h1>
          <p className="text-sm text-slate-500">
            {trabajador.cargo} — {trabajador.documento}
            {trabajador.estado === 'INACTIVO' && ' · Retirado'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tiene(PERMISOS.SST_VER) && (
            <Link to={`/sst/trabajadores/${trabajador.id}`} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Ver en SST
            </Link>
          )}
          {puedeGestionar && (
            <>
              <Link to={`/trabajadores/${trabajador.id}/editar`} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Editar
              </Link>
              {trabajador.estado === 'ACTIVO' && (
                <Link to={`/trabajadores/${trabajador.id}/pagos/nuevo`} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
                  Registrar pago
                </Link>
              )}
            </>
          )}
        </div>
      </div>

      <Seccion titulo="Datos del trabajador">
        <DatosPersonales trabajador={trabajador} />
        <dl className="mt-3 border-t border-slate-100 pt-3">
          <Dato etiqueta="Salario base">{formatearCOP(trabajador.salarioBase)}</Dato>
        </dl>
        {puedeGestionar && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <RetiroTrabajador trabajador={trabajador} onCambio={cargar} />
          </div>
        )}
      </Seccion>

      <ResumenLegal legales={trabajador.legales} />

      <SeccionAfiliaciones
        trabajadorId={trabajador.id}
        fechaIngreso={trabajador.fechaIngreso}
        afiliaciones={trabajador.afiliaciones}
        puedeGestionar={puedeGestionar}
        onCambio={cargar}
      />

      <SeccionAutorizacionSalud trabajador={trabajador} puedeGestionar={tiene(PERMISOS.SST_GESTIONAR)} onCambio={cargar} />

      <SeccionDocumentos trabajadorId={trabajador.id} documentos={trabajador.documentos} tiposPermitidos={tiposDocumentoPermitidos(tiene)} onCambio={cargar} />

      <section>
        <h2 className="text-sm font-semibold text-slate-900">Pagos de nómina</h2>
        <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[30rem] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Período</th>
                <th className="px-4 py-2 font-medium">Fecha de pago</th>
                <th className="px-4 py-2 font-medium">Novedades</th>
                <th className="px-4 py-2 font-medium">Valor pagado</th>
              </tr>
            </thead>
            <tbody>
              {trabajador.pagos.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                    Todavía no hay pagos registrados.
                  </td>
                </tr>
              )}
              {trabajador.pagos.map((pago) => (
                <tr key={pago.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2">
                    {formatearFecha(pago.periodoInicio)} a {formatearFecha(pago.periodoFin)}
                  </td>
                  <td className="px-4 py-2">{formatearFecha(pago.fechaPago)}</td>
                  <td className="px-4 py-2">
                    {pago.novedades.length === 0 ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {pago.novedades.map((novedad) => (
                          <li key={novedad.id} className="text-xs text-slate-600">
                            {ETIQUETA_NOVEDAD[novedad.tipo]}: {formatearCOP(novedad.valor)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-4 py-2 font-medium">{formatearCOP(pago.valorPagado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
