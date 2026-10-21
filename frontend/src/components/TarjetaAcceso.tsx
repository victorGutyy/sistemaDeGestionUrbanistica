import type { ReactNode } from 'react'
import { useEmpresa } from '../contexts/EmpresaContext'
import { LogoEmpresa } from './LogoEmpresa'

// Tarjeta centrada con el logo y el nombre de la empresa, para las pantallas públicas (recuperar la contraseña).
export function TarjetaAcceso({ titulo, descripcion, children }: { titulo: string; descripcion?: string; children: ReactNode }) {
  const { marca } = useEmpresa()
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <LogoEmpresa grande />
        <p className="mt-4 text-center text-xs text-slate-400">{marca.nombreComercial || marca.nombreProducto}</p>
        <h1 className="mt-1 text-center text-lg font-semibold text-slate-900">{titulo}</h1>
        {descripcion && <p className="mt-1 text-center text-sm text-slate-500">{descripcion}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
}
