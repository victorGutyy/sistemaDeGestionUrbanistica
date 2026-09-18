import { diferenciaEnDiasCalendario } from '../cartera/mora.js';
import { EstadoCuota } from '../generated/prisma/enums.js';

export interface CuotaParaRecordatorio {
  estado: EstadoCuota;
  fechaVencimiento: Date;
  recordatorioEnviadoEn: Date | null;
}

// Avisa desde "diasAntes" días antes del vencimiento hasta el mismo día
// que vence (nunca después: una cuota ya vencida es tema de Cartera y
// Mora, no de este recordatorio). Nunca dos veces la misma cuota.
export function necesitaRecordatorio(cuota: CuotaParaRecordatorio, diasAntes: number, hoy: Date): boolean {
  if (cuota.estado === EstadoCuota.PAGADA) {
    return false;
  }
  if (cuota.recordatorioEnviadoEn) {
    return false;
  }

  const diasHastaVencer = -diferenciaEnDiasCalendario(cuota.fechaVencimiento, hoy);
  return diasHastaVencer >= 0 && diasHastaVencer <= diasAntes;
}
