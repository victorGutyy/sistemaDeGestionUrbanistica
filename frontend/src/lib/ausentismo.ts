import type { EntidadRecobro, EstadoRecobro, ReglaAusentismo, TotalesAusentismo } from './api'
import type { Tono } from './sst'

// Textos de pantalla del ausentismo (CC-03, fase C).

export const REGLAS: ReglaAusentismo[] = ['INCAPACIDAD_GENERAL', 'ORIGEN_LABORAL', 'PAGA_EPS', 'PAGA_EMPLEADOR', 'DESCUENTO']

export const ETIQUETA_REGLA: Record<ReglaAusentismo, string> = {
  INCAPACIDAD_GENERAL: 'Enfermedad general: por tramos (empleador, EPS y AFP)',
  ORIGEN_LABORAL: 'Origen laboral: paga la ARL',
  PAGA_EPS: 'Paga la EPS un porcentaje',
  PAGA_EMPLEADOR: 'Paga el empleador un porcentaje',
  DESCUENTO: 'Se descuenta un porcentaje',
}

// Las reglas con porcentaje propio del tipo; las incapacidades usan los porcentajes del parámetro legal del año.
export const REGLAS_CON_PORCENTAJE: ReglaAusentismo[] = ['PAGA_EPS', 'PAGA_EMPLEADOR', 'DESCUENTO']

// Las que tienen tramos y, por eso, prórrogas.
export const REGLAS_CON_PRORROGA: ReglaAusentismo[] = ['INCAPACIDAD_GENERAL', 'ORIGEN_LABORAL']

export const ESTADOS_RECOBRO: EstadoRecobro[] = ['PENDIENTE', 'RADICADA', 'PAGADA', 'RECHAZADA']

export const ETIQUETA_ESTADO_RECOBRO: Record<EstadoRecobro, string> = {
  PENDIENTE: 'Pendiente',
  RADICADA: 'Radicado',
  PAGADA: 'Pagado',
  RECHAZADA: 'Rechazado',
}

export const TONO_ESTADO_RECOBRO: Record<EstadoRecobro, Tono> = {
  PENDIENTE: 'ambar',
  RADICADA: 'azul',
  PAGADA: 'verde',
  RECHAZADA: 'rojo',
}

export const ENTIDADES_RECOBRO: EntidadRecobro[] = ['EPS', 'ARL', 'AFP']

export const ETIQUETA_ENTIDAD_RECOBRO: Record<EntidadRecobro, string> = {
  EPS: 'EPS',
  ARL: 'ARL',
  AFP: 'Fondo de pensiones',
}

export const NOMBRES_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export const etiquetaMes = (anio: number, mes: number) => `${NOMBRES_MES[mes - 1]} de ${anio}`

// "Octubre de 2026": solo la primera letra en mayúscula.
export const etiquetaMesTitulo = (anio: number, mes: number) => {
  const texto = etiquetaMes(anio, mes)
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

// "2 del empleador · 3 de la EPS": quién paga los días de un ausentismo, sin valores.
export function textoPagadores(t: Pick<TotalesAusentismo, 'diasEmpleador' | 'diasEps' | 'diasArl' | 'diasAfp' | 'diasLaborados' | 'diasDescuento'>): string {
  const partes = [
    t.diasEmpleador > 0 ? `${t.diasEmpleador} del empleador` : null,
    t.diasEps > 0 ? `${t.diasEps} de la EPS` : null,
    t.diasArl > 0 ? `${t.diasArl} de la ARL` : null,
    t.diasAfp > 0 ? `${t.diasAfp} de la AFP` : null,
    t.diasLaborados > 0 ? `${t.diasLaborados} pagado${t.diasLaborados === 1 ? '' : 's'} como laborado${t.diasLaborados === 1 ? '' : 's'}` : null,
    t.diasDescuento > 0 ? `${t.diasDescuento} a descontar` : null,
  ].filter(Boolean)
  return partes.length > 0 ? partes.join(' · ') : '—'
}

export const textoDiasAusentismo = (dias: number) => `${dias} ${dias === 1 ? 'día' : 'días'}`

// El porcentaje del servidor llega como texto con punto ("25.81"): se muestra con coma.
export function formatearPorcentajeTexto(valor: string | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  const numero = Number(valor)
  return Number.isFinite(numero) ? `${numero.toLocaleString('es-CO', { maximumFractionDigits: 2 })} %` : valor
}
