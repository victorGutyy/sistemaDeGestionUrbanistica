import { diferenciaEnDiasCalendario } from '../cartera/mora.js';
import { EstadoVerificacion, MedioPago } from '../generated/prisma/enums.js';

export const ETIQUETA_VERIFICACION: Record<EstadoVerificacion, string> = {
  NO_REQUIERE: 'No requiere',
  POR_VERIFICAR: 'Por verificar',
  VERIFICADO: 'Verificado',
};

// Reglas puras de la verificación de abonos contra el extracto bancario (RF-REC-10).

// Si el abono nace "por verificar". Lo decide la configuración de cada medio de pago (el gerente la edita); si el
// medio todavía no tiene fila de configuración, el efectivo no se verifica (se cuadra en el cierre de caja) y los
// demás sí.
export function medioRequiereVerificacion(medio: MedioPago, config: { requiereVerificacion: boolean } | null): boolean {
  return config ? config.requiereVerificacion : medio !== MedioPago.EFECTIVO;
}

// Cuántos días lleva esperando un abono desde que se registró (días calendario).
export function diasDeEspera(registradoEn: Date, hoy: Date): number {
  return Math.max(0, diferenciaEnDiasCalendario(registradoEn, hoy));
}

// En rojo desde "diasAlerta" días de espera (0 = todo lo pendiente se resalta).
export function esperaEnAlerta(dias: number, diasAlerta: number): boolean {
  return dias >= diasAlerta;
}
