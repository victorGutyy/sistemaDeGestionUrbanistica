import type { CanalNotificacion, EstadoNotificacion, TipoNotificacion } from './api'

export const ETIQUETA_TIPO_NOTIFICACION: Record<TipoNotificacion, string> = {
  RECIBO: 'Recibo',
  RECORDATORIO: 'Recordatorio de cuota',
  MORA: 'Aviso de mora',
}

export const ETIQUETA_CANAL: Record<CanalNotificacion, string> = {
  CORREO: 'Correo',
  WHATSAPP: 'WhatsApp',
}

export const ETIQUETA_ESTADO_NOTIFICACION: Record<EstadoNotificacion, string> = {
  ENVIADA: 'Enviada',
  FALLIDA: 'Falló',
  OMITIDA: 'Omitida',
  ENLACE_ABIERTO: 'Enlace abierto',
}

export const CLASE_ESTADO_NOTIFICACION: Record<EstadoNotificacion, string> = {
  ENVIADA: 'bg-green-100 text-green-700',
  FALLIDA: 'bg-red-100 text-red-700',
  OMITIDA: 'bg-amber-100 text-amber-800',
  ENLACE_ABIERTO: 'bg-blue-100 text-blue-700',
}

export const ORDEN_ESTADOS_NOTIFICACION: EstadoNotificacion[] = ['ENVIADA', 'FALLIDA', 'OMITIDA', 'ENLACE_ABIERTO']

// "21/10/2026 8:05 a. m." en hora de Colombia, sin depender de la zona del computador.
export function formatearFechaHora(fecha: string | Date): string {
  const f = typeof fecha === 'string' ? new Date(fecha) : fecha
  const dia = f.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Bogota' })
  const hora = f.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' })
  return `${dia} ${hora}`
}
