import { useState, type FormEvent } from 'react'
import { reactivarTrabajador, retirarTrabajador, type Trabajador } from '../../lib/api'
import { fechaParaInput, hoyEnBogota } from '../../lib/formato'
import { Aviso, CLASE_BOTON, CLASE_BOTON_PELIGRO, CLASE_BOTON_SECUNDARIO, CLASE_INPUT, Campo } from '../formulario'

// Retiro y reactivación (RF-PER-17). El retiro no borra nada: queda inactivo con la fecha y el motivo, y su historia
// (pagos, afiliaciones, documentos) se conserva.
export function RetiroTrabajador({ trabajador, onCambio }: { trabajador: Trabajador; onCambio: () => void }) {
  const [abierto, setAbierto] = useState(false)
  const [fechaRetiro, setFechaRetiro] = useState(() => hoyEnBogota())
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function retirar(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      await retirarTrabajador(trabajador.id, { fechaRetiro, motivo: motivo.trim() })
      setAbierto(false)
      onCambio()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo retirar al trabajador')
    } finally {
      setEnviando(false)
    }
  }

  async function reactivar() {
    setError(null)
    setEnviando(true)
    try {
      await reactivarTrabajador(trabajador.id)
      onCambio()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reactivar al trabajador')
    } finally {
      setEnviando(false)
    }
  }

  if (trabajador.estado === 'INACTIVO') {
    return (
      <div>
        <Aviso error={error} />
        <button type="button" disabled={enviando} onClick={() => void reactivar()} className={CLASE_BOTON_SECUNDARIO}>
          Reactivar trabajador
        </button>
      </div>
    )
  }

  return (
    <div>
      <Aviso error={error} />
      {!abierto ? (
        <button type="button" onClick={() => setAbierto(true)} className={CLASE_BOTON_PELIGRO}>
          Retirar trabajador
        </button>
      ) : (
        <form onSubmit={retirar} className="max-w-md rounded-md border border-red-200 bg-red-50/50 p-3">
          <p className="text-sm text-slate-700">El trabajador queda inactivo; su historia se conserva. Las afiliaciones se cierran a mano con su fecha.</p>
          <div className="mt-3 space-y-3">
            <Campo id="fechaRetiro" etiqueta="Fecha de retiro">
              <input id="fechaRetiro" type="date" required min={fechaParaInput(trabajador.fechaIngreso)} value={fechaRetiro} onChange={(e) => setFechaRetiro(e.target.value)} className={CLASE_INPUT} />
            </Campo>
            <Campo id="motivoRetiro" etiqueta="Motivo">
              <input id="motivoRetiro" required minLength={5} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={CLASE_INPUT} />
            </Campo>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button type="submit" disabled={enviando} className={CLASE_BOTON}>
              {enviando ? 'Guardando…' : 'Confirmar retiro'}
            </button>
            <button type="button" onClick={() => setAbierto(false)} className={CLASE_BOTON_SECUNDARIO}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
