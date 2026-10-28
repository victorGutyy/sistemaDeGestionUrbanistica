import type { SexoTrabajador, TipoContrato, TipoDocumento, TipoDocumentoTrabajador, TipoEntidadSS } from './api'
import { PERMISOS } from './permisos'

// Textos de pantalla de la seguridad social y la ficha del trabajador (CC-03).

export const TIPOS_ENTIDAD: TipoEntidadSS[] = ['EPS', 'AFP', 'CESANTIAS', 'ARL', 'CAJA']

export const ETIQUETA_TIPO_ENTIDAD: Record<TipoEntidadSS, string> = {
  EPS: 'EPS (salud)',
  AFP: 'Fondo de pensión',
  CESANTIAS: 'Fondo de cesantías',
  ARL: 'ARL (riesgos laborales)',
  CAJA: 'Caja de compensación',
}

// Versión corta, para etiquetas pequeñas.
export const ETIQUETA_CORTA_TIPO_ENTIDAD: Record<TipoEntidadSS, string> = {
  EPS: 'EPS',
  AFP: 'Pensión',
  CESANTIAS: 'Cesantías',
  ARL: 'ARL',
  CAJA: 'Caja',
}

export const ETIQUETA_TIPO_CONTRATO: Record<TipoContrato, string> = {
  OBRA_LABOR: 'Obra o labor',
  TERMINO_FIJO: 'Término fijo',
  TERMINO_INDEFINIDO: 'Término indefinido',
  PRESTACION_SERVICIOS: 'Prestación de servicios',
}

export const ETIQUETA_SEXO: Record<SexoTrabajador, string> = {
  FEMENINO: 'Femenino',
  MASCULINO: 'Masculino',
  OTRO: 'Otro',
}

export const TIPOS_DOCUMENTO_IDENTIDAD: TipoDocumento[] = ['CC', 'CE', 'PASAPORTE', 'TI', 'OTRO']

export const ETIQUETA_TIPO_DOCUMENTO_IDENTIDAD: Record<TipoDocumento, string> = {
  CC: 'Cédula de ciudadanía',
  CE: 'Cédula de extranjería',
  NIT: 'NIT',
  PASAPORTE: 'Pasaporte',
  TI: 'Tarjeta de identidad',
  OTRO: 'Otro',
}

export const ETIQUETA_TIPO_DOCUMENTO_TRABAJADOR: Record<TipoDocumentoTrabajador, string> = {
  CERTIFICADO_AFILIACION: 'Certificado de afiliación',
  AUTORIZACION_DATOS: 'Autorización de datos',
  CONTRATO: 'Contrato',
  OTRO: 'Otro documento',
}

// Qué tipos de documento puede adjuntar quien mira la pantalla (el servidor lo vuelve a comprobar): los de seguridad
// social, con sst.gestionar; el contrato y los demás, con nomina.gestionar.
export function tiposDocumentoPermitidos(tiene: (permiso: string) => boolean): TipoDocumentoTrabajador[] {
  return [
    ...(tiene(PERMISOS.SST_GESTIONAR) ? (['CERTIFICADO_AFILIACION', 'AUTORIZACION_DATOS'] as const) : []),
    ...(tiene(PERMISOS.NOMINA_GESTIONAR) ? (['CONTRATO', 'OTRO'] as const) : []),
  ]
}

// Los porcentajes llegan de la base como "66.67" o "50.00": se muestran con coma y sin ceros sobrantes.
export function formatearPorcentaje(valor: string | number | null | undefined, decimales = 3): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  const numero = Number(valor)
  if (!Number.isFinite(numero)) return String(valor)
  return `${numero.toLocaleString('es-CO', { maximumFractionDigits: decimales })} %`
}

// "2,5" y "2.5" significan lo mismo para quien escribe en Colombia.
export function aNumero(texto: string): number {
  return Number(texto.trim().replace(',', '.'))
}

export function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

// Solo dígitos para los pesos: "1.750.905" y "1750905" se aceptan por igual.
export function pesosATexto(texto: string): string {
  return texto.replace(/[.\s$]/g, '').replace(',', '.')
}
