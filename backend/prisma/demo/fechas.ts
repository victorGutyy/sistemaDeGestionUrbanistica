import { hoyISO, sumarDias, ultimoDiaDelMes } from '../../src/cierres-caja/periodo.js';

// Las bases de demostración y de volumen se arman con fechas RELATIVAS al día en que se corre la carga, para que
// siempre haya clientes al día, por vencer y en mora sin importar cuándo se prepare la demostración.

export const hoy = (): string => hoyISO();

// El día de hace `dias` días (negativo = en el futuro), como "aaaa-mm-dd".
export const hace = (dias: number): string => sumarDias(hoy(), -dias);

export const despues = (dias: number): string => sumarDias(hoy(), dias);

// Suma (o resta, si es negativo) meses a un día, recortando al último día del mes cuando no cabe: igual que el plan
// de cuotas del sistema.
export function sumarMesesISO(iso: string, meses: number): string {
  const [anio, mes, dia] = iso.split('-').map(Number);
  const total = anio * 12 + (mes - 1) + meses;
  const anioNuevo = Math.floor(total / 12);
  const mesNuevo = (total % 12) + 1;
  const diaNuevo = Math.min(dia, ultimoDiaDelMes(anioNuevo, mesNuevo));
  return `${String(anioNuevo).padStart(4, '0')}-${String(mesNuevo).padStart(2, '0')}-${String(diaNuevo).padStart(2, '0')}`;
}

export const menor = (a: string, b: string): string => (a < b ? a : b);
