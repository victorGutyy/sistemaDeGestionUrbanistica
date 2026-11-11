import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { SeccionCargosNomina } from '../components/nomina/SeccionCargosNomina'
import { useAuth } from '../contexts/AuthContext'
import { listarCargosNomina, type CargoNomina } from '../lib/api'
import { PERMISOS } from '../lib/permisos'

// Cargos de nómina (CC-05): los administran el gerente y el administrador, que es quien liquida la nómina.
export function CargosNominaPage() {
  const { tiene } = useAuth()
  const [cargos, setCargos] = useState<CargoNomina[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listarCargosNomina(true)
      .then(setCargos)
      .catch((err: Error) => setError(err.message))
  }, [])

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!cargos) return <p className="text-sm text-slate-500">Cargando cargos...</p>

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <Link to="/nomina" className="text-sm text-blue-600 hover:underline">
          ← Nómina
        </Link>
        <h1 className="mt-2 text-lg font-semibold text-slate-900">Cargos y valor día</h1>
        <p className="text-sm text-slate-500">Se usan para sugerir el valor día al registrar un trabajador. Cada cambio queda en la auditoría.</p>
      </div>
      <SeccionCargosNomina cargos={cargos} puedeGestionar={tiene(PERMISOS.NOMINA_GESTIONAR)} onCambio={setCargos} />
    </div>
  )
}
