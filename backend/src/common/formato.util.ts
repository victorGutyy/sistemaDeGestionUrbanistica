import type { Prisma } from '../generated/prisma/client.js';

// Formato colombiano para documentos generados en el servidor (PDF, correos):
// dinero $1.234.567 y fechas dd/mm/aaaa. Solo para mostrar; los cálculos se
// hacen siempre con Decimal.
const FORMATO_MONEDA = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
  useGrouping: 'always',
});

export function formatearCOP(valor: Prisma.Decimal | string | number): string {
  return `$${FORMATO_MONEDA.format(Number(valor.toString()))}`;
}

// Recibe una fecha calendario "aaaa-mm-dd" (la que llega de los filtros).
export function formatearFechaISO(fechaISO: string): string {
  return fechaISO.split('-').reverse().join('/');
}
