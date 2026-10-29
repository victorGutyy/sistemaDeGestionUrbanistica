import type { ColumnaReporte } from './api'
import { formatearCOP } from './formato'

// En pantalla se muestran solo las primeras filas de un detalle largo; el PDF y el Excel traen todo.
export const FILAS_EN_PANTALLA = 500

// Un valor tal como se ve en la pantalla: dinero $1.234.567 (un negativo -$680.000), fechas dd/mm/aaaa.
export function textoDeCelda(columna: ColumnaReporte, valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return ''
  if (columna.tipo === 'pesos') return formatearCOP(valor)
  if (columna.tipo === 'entero') {
    const numero = Number(valor)
    return Number.isFinite(numero) ? numero.toLocaleString('es-CO') : String(valor)
  }
  if (columna.tipo === 'fecha' && /^\d{4}-\d{2}-\d{2}$/.test(String(valor))) return String(valor).split('-').reverse().join('/')
  return String(valor)
}

export const esColumnaNumerica = (columna: ColumnaReporte) => columna.tipo === 'pesos' || columna.tipo === 'entero' || columna.alineacion === 'derecha'
