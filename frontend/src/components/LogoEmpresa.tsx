import { Building2 } from 'lucide-react'
import { useEmpresa } from '../contexts/EmpresaContext'
import { cn } from '../lib/utils'

// Logo de la empresa; si aún no subió uno, un ícono genérico con el color de la marca.
export function LogoEmpresa({ className }: { className?: string }) {
  const { logoUrl, marca } = useEmpresa()

  if (logoUrl) {
    return <img src={logoUrl} alt={`Logo de ${marca.nombreComercial || marca.nombreProducto}`} className={cn('object-contain', className)} />
  }

  return (
    <div className={cn('flex items-center justify-center rounded-md bg-blue-600 text-white', className)} aria-hidden="true">
      <Building2 className="h-3/5 w-3/5" />
    </div>
  )
}
