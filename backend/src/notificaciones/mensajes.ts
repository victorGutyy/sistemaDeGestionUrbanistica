import { ZONA_HORARIA } from '../common/zona-horaria.js';

// Textos de los mensajes de WhatsApp (RF-NOT-04). Viven aquí, en un solo lugar, para poder ajustar el tono sin
// tocar la lógica. El sistema no envía el mensaje: arma el texto y el enlace; la persona lo revisa y lo manda.

export function fechaCorta(fecha: Date): string {
  return fecha.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: ZONA_HORARIA });
}

interface Base {
  empresa: string;
  cliente: string;
  proyecto: string;
  lote: string;
}

export interface DatosMensajeRecibo extends Base {
  numeroRecibo: string;
  valor: string;
  fecha: string;
  saldoNuevo: string;
}

export interface DatosMensajeRecordatorio extends Base {
  etiquetaCuota: string;
  fechaVencimiento: string;
  valor: string;
}

export interface DatosMensajeMora extends Base {
  cuotas: { etiqueta: string; fechaVencimiento: string; saldo: string }[];
  saldoVencido: string;
}

export function mensajeRecibo(d: DatosMensajeRecibo): string {
  return [
    `Hola ${d.cliente}, te saludamos de ${d.empresa}.`,
    `Registramos tu pago de ${d.valor} del ${d.fecha} para el lote ${d.lote} de ${d.proyecto}. Tu recibo es el ${d.numeroRecibo}.`,
    `Tu saldo pendiente queda en ${d.saldoNuevo}. ¡Gracias por tu pago!`,
  ].join('\n\n');
}

export function mensajeRecordatorio(d: DatosMensajeRecordatorio): string {
  return [
    `Hola ${d.cliente}, te saludamos de ${d.empresa}.`,
    `Te recordamos que la ${d.etiquetaCuota.toLowerCase()} del lote ${d.lote} de ${d.proyecto} vence el ${d.fechaVencimiento}, por ${d.valor}.`,
    'Si ya realizaste el pago, ignora este mensaje.',
  ].join('\n\n');
}

export function mensajeMora(d: DatosMensajeMora): string {
  const detalle = d.cuotas.map((cuota) => `• ${cuota.etiqueta}, vencida el ${cuota.fechaVencimiento}: ${cuota.saldo}`).join('\n');
  return [
    `Hola ${d.cliente}, te saludamos de ${d.empresa}.`,
    `Tienes cuotas vencidas del lote ${d.lote} de ${d.proyecto}:\n${detalle}`,
    `El total vencido es ${d.saldoVencido}. Si ya pagaste, envíanos el soporte para actualizar tu cuenta; si no, comunícate con nosotros para ponernos de acuerdo.`,
  ].join('\n\n');
}

// El teléfono ya viene normalizado (solo dígitos con indicativo).
export function enlaceWhatsApp(telefono: string, texto: string): string {
  return `https://wa.me/${telefono}?text=${encodeURIComponent(texto)}`;
}
