import { useEffect } from 'react'
import { crearTrabajador, type Trabajador } from '../../lib/api'
import { FormularioTrabajador } from './FormularioTrabajador'

interface Props {
  // Se llama con el trabajador ya guardado, para que quien abrió la ventana lo use sin salir de lo que estaba haciendo.
  onCreado: (trabajador: Trabajador) => void
  onCerrar: () => void
}

// Ventana para dar de alta a un trabajador sin salir de la pantalla en la que se está (CC-09, RF-PER-25): por ejemplo, en
// medio de una liquidación de quincena. Usa el mismo formulario y el mismo servicio que la pantalla "Nuevo trabajador",
// así que valida y audita igual. Debe renderizarse FUERA de cualquier <form>: el formulario del trabajador es un <form>.
export function NuevoTrabajadorModal({ onCreado, onCerrar }: Props) {
  useEffect(() => {
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [onCerrar])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="titulo-nuevo-trabajador">
      <div className="w-full max-w-2xl rounded-lg bg-white p-4 shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="titulo-nuevo-trabajador" className="text-lg font-semibold text-slate-900">
              Nuevo trabajador
            </h2>
            <p className="text-sm text-slate-500">Al guardarlo se agrega a la liquidación. Lo que ya escribiste no se pierde.</p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="shrink-0 rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100">
            Cerrar
          </button>
        </div>
        <div className="mt-4">
          <FormularioTrabajador
            modo="crear"
            onGuardar={async (payload) => {
              const trabajador = await crearTrabajador(payload)
              onCreado(trabajador)
            }}
          />
        </div>
      </div>
    </div>
  )
}
