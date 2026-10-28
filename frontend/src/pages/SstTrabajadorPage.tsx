import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Seccion } from '../components/formulario'
import { DatosPersonales } from '../components/trabajador/DatosPersonales'
import { ResumenLegal } from '../components/trabajador/ResumenLegal'
import { SeccionAfiliaciones } from '../components/trabajador/SeccionAfiliaciones'
import { SeccionAutorizacionSalud } from '../components/trabajador/SeccionAutorizacionSalud'
import { SeccionDocumentos } from '../components/trabajador/SeccionDocumentos'
import { useAuth } from '../contexts/AuthContext'
import { obtenerFichaSst, type FichaTrabajadorSst } from '../lib/api'
import { PERMISOS } from '../lib/permisos'
import { tiposDocumentoPermitidos } from '../lib/seguridadSocial'

// Ficha del trabajador para el módulo SST: sin salario ni pagos (esos datos solo salen por la pantalla de nómina).
export function SstTrabajadorPage() {
  const { tiene } = useAuth()
  const { id } = useParams<{ id: string }>()
  const [ficha, setFicha] = useState<FichaTrabajadorSst | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(() => {
    if (!id) return
    obtenerFichaSst(id)
      .then(setFicha)
      .catch((err: Error) => setError(err.message))
  }, [id])

  useEffect(cargar, [cargar])

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!ficha) return <p className="text-sm text-slate-500">Cargando trabajador...</p>

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to="/sst" className="text-sm text-blue-600 hover:underline">
            ← Seguridad y salud
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-slate-900">{ficha.nombre}</h1>
          <p className="text-sm text-slate-500">
            {ficha.cargo} — {ficha.documento}
          </p>
        </div>
        {tiene(PERMISOS.NOMINA_VER) && (
          <Link to={`/trabajadores/${ficha.id}`} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Ver ficha de nómina
          </Link>
        )}
      </div>

      <Seccion titulo="Datos del trabajador">
        <DatosPersonales trabajador={ficha} />
      </Seccion>

      <ResumenLegal legales={ficha.legales} />

      <SeccionAfiliaciones trabajadorId={ficha.id} fechaIngreso={ficha.fechaIngreso} afiliaciones={ficha.afiliaciones} puedeGestionar={tiene(PERMISOS.NOMINA_GESTIONAR)} onCambio={cargar} />

      <SeccionAutorizacionSalud trabajador={ficha} puedeGestionar={tiene(PERMISOS.SST_GESTIONAR)} onCambio={cargar} />

      <SeccionDocumentos trabajadorId={ficha.id} documentos={ficha.documentos} tiposPermitidos={tiposDocumentoPermitidos(tiene)} onCambio={cargar} />
    </div>
  )
}
