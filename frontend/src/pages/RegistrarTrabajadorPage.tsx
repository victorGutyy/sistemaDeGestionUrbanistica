import { useNavigate } from 'react-router-dom'
import { FormularioTrabajador } from '../components/trabajador/FormularioTrabajador'
import { crearTrabajador } from '../lib/api'

export function RegistrarTrabajadorPage() {
  const navigate = useNavigate()

  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-semibold text-slate-900">Nuevo trabajador</h1>
      <p className="text-sm text-slate-500">Datos del trabajador y salario base. Después podrás registrar sus afiliaciones a la seguridad social.</p>

      <div className="mt-6">
        <FormularioTrabajador
          modo="crear"
          onGuardar={async (payload) => {
            const trabajador = await crearTrabajador(payload)
            navigate(`/trabajadores/${trabajador.id}`)
          }}
        />
      </div>
    </div>
  )
}
