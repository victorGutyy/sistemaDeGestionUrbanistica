import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FormularioTrabajador } from '../components/trabajador/FormularioTrabajador'
import { actualizarTrabajador, obtenerTrabajador, type Trabajador } from '../lib/api'

export function EditarTrabajadorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [trabajador, setTrabajador] = useState<Trabajador | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    obtenerTrabajador(id)
      .then(setTrabajador)
      .catch((err: Error) => setError(err.message))
  }, [id])

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!trabajador || !id) return <p className="text-sm text-slate-500">Cargando trabajador...</p>

  return (
    <div className="max-w-2xl">
      <Link to={`/trabajadores/${id}`} className="text-sm text-blue-600 hover:underline">
        ← Volver a la ficha
      </Link>
      <h1 className="mt-2 text-lg font-semibold text-slate-900">Editar a {trabajador.nombre}</h1>
      <p className="text-sm text-slate-500">Cada cambio queda en la auditoría con su valor anterior.</p>

      <div className="mt-6">
        <FormularioTrabajador
          modo="editar"
          trabajador={trabajador}
          onGuardar={async (payload) => {
            await actualizarTrabajador(id, payload)
            navigate(`/trabajadores/${id}`)
          }}
        />
      </div>
    </div>
  )
}
