import { useEmpresa } from '../contexts/EmpresaContext'
import { cn } from '../lib/utils'

// Marca de agua: el logo de la empresa, grande y centrado, muy tenue, detrás de todo el contenido (no recibe clics ni se
// imprime). Es el logo que la empresa sube en Configuración; sin logo no se pone nada. `mix-blend-multiply` hace que el
// blanco de un logo con fondo no se note sobre el fondo de la pantalla. El contenedor que lo usa debe llevar `relative isolate`.
// Con `conMenu` se centra en la zona de trabajo (a la derecha del menú lateral en pantallas grandes).
export function FondoLogo({ conMenu = false }: { conMenu?: boolean }) {
  const { logoUrl } = useEmpresa()
  if (!logoUrl) return null

  return (
    <div aria-hidden="true" className={cn('pointer-events-none fixed inset-0 -z-10 flex items-center justify-center p-6 print:hidden', conMenu && 'md:left-60')}>
      <img src={logoUrl} alt="" className="h-auto max-h-[75vh] w-[min(48rem,90%)] select-none object-contain opacity-[0.05] mix-blend-multiply" draggable={false} />
    </div>
  )
}
