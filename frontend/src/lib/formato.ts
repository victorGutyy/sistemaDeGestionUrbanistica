// Formato colombiano para la interfaz: dinero $1.234.567 y fechas dd/mm/aaaa.
// Solo para mostrar: los valores se guardan y se calculan en el servidor.

const ZONA_HORARIA = 'America/Bogota'

// Sin decimales cuando el valor es entero; con decimales (coma) solo si los
// tiene, para no esconder centavos que sí existen en el dato.
const FORMATO_MONEDA = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
  useGrouping: 'always',
})

const FORMATO_FECHA = new Intl.DateTimeFormat('es-CO', {
  timeZone: ZONA_HORARIA,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const FORMATO_FECHA_ISO = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_HORARIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function formatearCOP(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  const numero = Number(valor)
  if (!Number.isFinite(numero)) return String(valor)
  // Un negativo se escribe -$680.000, no $-680.000.
  return `${numero < 0 ? '-' : ''}$${FORMATO_MONEDA.format(Math.abs(numero))}`
}

// Recibe el instante ISO que manda el servidor (p. ej. "2026-09-19T05:00:00.000Z")
// y devuelve el día calendario en Colombia como dd/mm/aaaa.
export function formatearFecha(fecha: string | Date | null | undefined): string {
  if (!fecha) return '—'
  const instante = fecha instanceof Date ? fecha : new Date(fecha)
  if (Number.isNaN(instante.getTime())) return String(fecha)
  return FORMATO_FECHA.format(instante)
}

// Una fecha límite (día calendario) ya pasó si es anterior a hoy en Colombia.
export function estaVencida(fecha: string | Date | null | undefined): boolean {
  if (!fecha) return false
  const instante = fecha instanceof Date ? fecha : new Date(fecha)
  if (Number.isNaN(instante.getTime())) return false
  return FORMATO_FECHA_ISO.format(instante) < FORMATO_FECHA_ISO.format(new Date())
}

// Fecha de hoy en Colombia como aaaa-mm-dd (lo que espera un <input type="date">).
// No usar new Date().toISOString(): da la fecha en UTC y, después de las 7 p. m.
// en Bogotá, ya sería "mañana".
export function hoyEnBogota(): string {
  return FORMATO_FECHA_ISO.format(new Date())
}
