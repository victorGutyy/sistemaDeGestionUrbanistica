// Modelo común de los reportes (RF-REP-04 a 11). Cada reporte es una función que consulta y devuelve ESTA estructura:
// título, filtros aplicados y secciones con columnas y filas. La pantalla, el PDF y el Excel dibujan cualquier reporte
// desde ella, así que todos salen iguales y agregar uno nuevo es escribir una sola función.
import type { Prisma } from '../generated/prisma/client.js';

export type TipoColumna = 'texto' | 'pesos' | 'fecha' | 'entero';

export interface ColumnaReporte {
  clave: string;
  encabezado: string;
  tipo: TipoColumna;
  // Ancho relativo en el PDF y la pantalla (por defecto 1; el dinero y las fechas ocupan poco, los textos largos más).
  peso?: number;
}

// texto: tal cual · pesos: pesos enteros como texto ("1500000", sin perder precisión) · fecha: "aaaa-mm-dd" · entero: número.
export type ValorCelda = string | number | null;
export type FilaReporte = Record<string, ValorCelda>;

export interface SeccionReporte {
  titulo: string;
  nota?: string;
  columnas: ColumnaReporte[];
  filas: FilaReporte[];
  // Fila de totales (se dibuja al final, resaltada).
  totales?: FilaReporte;
  // Si el detalle se recortó: cuántas filas había en total (el PDF y la pantalla avisan que filtren o usen Excel).
  filasTotales?: number;
}

export type ClaveReporte = 'recaudo' | 'cartera-edades' | 'egresos' | 'inventario-lotes' | 'flujo-caja';

export interface ReporteGenerado {
  clave: ClaveReporte;
  titulo: string;
  descripcion: string;
  // Lo que se pidió, en palabras (p. ej. "Proyecto: La Floresta"), para que el papel diga de qué es.
  filtros: { etiqueta: string; valor: string }[];
  generadoEn: string;
  secciones: SeccionReporte[];
}

// Tope de filas de una tabla de detalle. Más allá, el reporte avisa que se afine el filtro (protege al servidor y
// mantiene el PDF por debajo de los 10 segundos de RNF-REN-03).
export const MAXIMO_FILAS_DE_DETALLE = 5000;

// Pesos enteros como texto: los reportes no manejan centavos (CLAUDE.md: dinero en pesos enteros).
export function pesos(valor: Prisma.Decimal | number | string): string {
  const numero = typeof valor === 'object' ? valor : Number(valor);
  const entero = typeof numero === 'number' ? Math.round(numero) : numero.toDecimalPlaces(0, 4 /* ROUND_HALF_UP */).toString();
  return String(entero);
}

// Parte sobre total como texto con coma decimal ("35,2 %"); sin total, "0 %".
export function porcentaje(parte: Prisma.Decimal, total: Prisma.Decimal): string {
  return total.isZero() ? '0 %' : `${parte.div(total).mul(100).toDecimalPlaces(1).toString().replace('.', ',')} %`;
}

// Recorta un detalle largo y deja constancia en la sección.
export function recortarDetalle(filas: FilaReporte[]): { filas: FilaReporte[]; filasTotales?: number } {
  return filas.length > MAXIMO_FILAS_DE_DETALLE ? { filas: filas.slice(0, MAXIMO_FILAS_DE_DETALLE), filasTotales: filas.length } : { filas };
}
