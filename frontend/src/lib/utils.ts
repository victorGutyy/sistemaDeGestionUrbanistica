import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Combina clases de Tailwind sin choques (patrón estándar de shadcn/ui):
// clsx arma la lista condicional, twMerge resuelve utilidades duplicadas
// (p.ej. si dos clases fijan "p-2" y "p-4", se queda con la última).
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
