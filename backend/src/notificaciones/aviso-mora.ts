import { diferenciaEnDiasCalendario } from '../cartera/mora.js';

// Cuándo toca repetir el aviso de mora a una venta (RF-NOT-03): si nunca se le avisó, hoy; si ya se le avisó, cuando
// hayan pasado al menos "diasEntreAvisos" días calendario desde el último aviso enviado.
export function tocaAvisoDeMora(ultimoAvisoEnviado: Date | null, diasEntreAvisos: number, hoy: Date): boolean {
  if (!ultimoAvisoEnviado) return true;
  return diferenciaEnDiasCalendario(ultimoAvisoEnviado, hoy) >= diasEntreAvisos;
}

// Una cuota entra en el aviso de mora cuando ya pasaron los días de gracia que el gerente configuró.
export function cuotaParaAvisoDeMora(diasAtraso: number, diasGracia: number): boolean {
  return diasAtraso > Math.max(0, diasGracia);
}
