import { useState } from 'react'
import { registrarAutorizacionSalud, type DatosTrabajador } from '../../lib/api'
import { formatearFecha } from '../../lib/formato'
import { Aviso, CLASE_BOTON, CLASE_BOTON_SECUNDARIO, Insignia, Seccion } from '../formulario'

interface Props {
  trabajador: DatosTrabajador
  puedeGestionar: boolean
  onCambio: () => void
}

// Autorización para tratar los datos de salud del trabajador (Ley 1581 de 2012, RNF-LEG-03): sin ella no se deben
// registrar diagnósticos. Queda la fecha y quién la registró.
export function SeccionAutorizacionSalud({ trabajador, puedeGestionar, onCambio }: Props) {
  const [enviando, setEnviando] = useState(false)
  const [confirmandoRetiro, setConfirmandoRetiro] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function cambiar(autoriza: boolean) {
    setError(null)
    setEnviando(true)
    try {
      await registrarAutorizacionSalud(trabajador.id, autoriza)
      setConfirmandoRetiro(false)
      onCambio()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la autorización')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Seccion titulo="Autorización de datos de salud" descripcion="El trabajador debe autorizar por escrito el tratamiento de sus datos de salud (incapacidades y diagnósticos). Adjunta el documento firmado en la sección Documentos.">
      <Aviso error={error} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {trabajador.autorizaDatosSalud ? (
            <>
              <Insignia tono="verde">Autorizó</Insignia>
              <p className="mt-1 text-sm text-slate-600">
                Registrada el {formatearFecha(trabajador.fechaAutorizacionSalud)}
                {trabajador.autorizacionSaludRegistradaPor && ` por ${trabajador.autorizacionSaludRegistradaPor.nombre}`}
              </p>
            </>
          ) : (
            <>
              <Insignia tono="ambar">Sin autorización registrada</Insignia>
              <p className="mt-1 text-sm text-slate-600">Todavía no se ha registrado que el trabajador autorizó el tratamiento de sus datos de salud.</p>
            </>
          )}
        </div>
        {puedeGestionar &&
          (trabajador.autorizaDatosSalud ? (
            confirmandoRetiro ? (
              <div className="flex gap-2">
                <button type="button" disabled={enviando} className={CLASE_BOTON} onClick={() => void cambiar(false)}>
                  Sí, retirarla
                </button>
                <button type="button" className={CLASE_BOTON_SECUNDARIO} onClick={() => setConfirmandoRetiro(false)}>
                  No
                </button>
              </div>
            ) : (
              <button type="button" className={CLASE_BOTON_SECUNDARIO} onClick={() => setConfirmandoRetiro(true)}>
                Retirar autorización
              </button>
            )
          ) : (
            <button type="button" disabled={enviando} className={CLASE_BOTON} onClick={() => void cambiar(true)}>
              {enviando ? 'Guardando…' : 'Registrar autorización'}
            </button>
          ))}
      </div>
    </Seccion>
  )
}
