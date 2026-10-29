// Lo que comparten las pantallas de carga desde Excel (ventas y seguridad y salud en el trabajo).

export const BOTON_PRIMARIO = 'w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 sm:w-auto sm:py-2'
export const BOTON_SECUNDARIO =
  'w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:w-auto sm:py-2'

// Debe coincidir con el tope del servidor.
export const TAMANO_MAXIMO_MB = 5
export const MAXIMO_PROBLEMAS_VISIBLES = 30

// "1 trabajador" o "2 trabajadores".
export const cantidad = (n: number, singular: string, plural: string) => `${n} ${n === 1 ? singular : plural}`
