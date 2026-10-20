import { Building2 } from 'lucide-react'
import { useEmpresa } from '../contexts/EmpresaContext'
import { cn } from '../lib/utils'

// Logo de la empresa; si aún no subió uno, un ícono genérico con el color de la marca.
// Con `grande` (pantalla de ingreso) el logo propio se muestra a lo ancho, sin recortarlo a un cuadrado: un logo con
// nombre y lema es más ancho que alto y a 56 px no se leería. El ícono genérico conserva su tamaño de siempre.
export function LogoEmpresa({ className, grande = false }: { className?: string; grande?: boolean }) {
  const { logoUrl, marca } = useEmpresa()

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`Logo de ${marca.nombreComercial || marca.nombreProducto}`}
        className={cn('object-contain', grande ? 'mx-auto h-auto max-h-40 w-full max-w-[16rem]' : className)}
      />
    )
  }

  return (
    <div className={cn('flex items-center justify-center rounded-md bg-blue-600 text-white', grande ? 'mx-auto h-14 w-14' : className)} aria-hidden="true">
      <Building2 className="h-3/5 w-3/5" />
    </div>
  )
}
