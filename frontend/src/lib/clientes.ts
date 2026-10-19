import type { Semaforo, TipoDocumento } from './api'

// Textos de pantalla de los tipos de documento y del semáforo de cartera (los usan la lista y la ficha de clientes,
// el formulario de nuevo cliente y la venta).
export const TIPOS_DOCUMENTO: TipoDocumento[] = ['CC', 'CE', 'NIT', 'PASAPORTE', 'TI', 'OTRO']

export const ETIQUETA_TIPO_DOCUMENTO: Record<TipoDocumento, string> = {
  CC: 'Cédula de ciudadanía',
  CE: 'Cédula de extranjería',
  NIT: 'NIT',
  PASAPORTE: 'Pasaporte',
  TI: 'Tarjeta de identidad',
  OTRO: 'Otro',
}

// Forma corta para listas ("CC 1000000001").
export const SIGLA_TIPO_DOCUMENTO: Record<TipoDocumento, string> = {
  CC: 'CC',
  CE: 'CE',
  NIT: 'NIT',
  PASAPORTE: 'Pasaporte',
  TI: 'TI',
  OTRO: 'Doc.',
}

export const ESTILO_SEMAFORO: Record<Semaforo, string> = {
  VERDE: 'bg-green-100 text-green-700',
  AMARILLO: 'bg-amber-100 text-amber-700',
  ROJO: 'bg-red-100 text-red-700',
}

export const ETIQUETA_SEMAFORO: Record<Semaforo, string> = {
  VERDE: 'Al día',
  AMARILLO: 'Próximo a vencer',
  ROJO: 'En mora',
}
