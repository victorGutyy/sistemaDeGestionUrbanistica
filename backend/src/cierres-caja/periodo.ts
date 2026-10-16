import type { TipoCierre } from '../generated/prisma/enums.js';

// Los períodos de un cierre de caja son días calendario ("YYYY-MM-DD") y se calculan con aritmética de calendario
// pura, sin horas ni zonas horarias, para que el resultado sea el mismo en cualquier servidor.
//
// PROVISIONAL (pendiente de confirmar con el cliente): semana de lunes a domingo y quincena del 1 al 15 y del 16
// al fin de mes. Si cambia la definición, solo cambia este archivo.

const FORMATO_ISO_BOGOTA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// "YYYY-MM-DD" → [año, mes (1-12), día]
function partes(iso: string): [number, number, number] {
  const [anio, mes, dia] = iso.split('-').map(Number);
  return [anio, mes, dia];
}

function aISO(anio: number, mes: number, dia: number): string {
  return `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export function sumarDias(iso: string, dias: number): string {
  const [anio, mes, dia] = partes(iso);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia + dias));
  return aISO(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, fecha.getUTCDate());
}

export function ultimoDiaDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

// El día de hoy en Colombia, aunque el servidor esté en otra zona.
export function hoyISO(ahora: Date = new Date()): string {
  return FORMATO_ISO_BOGOTA.format(ahora);
}

// El instante en que ocurrió algo (p. ej. una anulación), llevado al día calendario de Colombia.
export function diaEnBogota(instante: Date): string {
  return FORMATO_ISO_BOGOTA.format(instante);
}

// Un día de negocio guardado como fecha local (medianoche): se lee con los componentes locales del proceso,
// que la aplicación fija en America/Bogota.
export function diaLocal(fecha: Date): string {
  return aISO(fecha.getFullYear(), fecha.getMonth() + 1, fecha.getDate());
}

// Un campo DATE de la base (Prisma lo entrega a medianoche UTC) como "YYYY-MM-DD".
export function diaDeColumnaDate(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

export function formatearDiaDDMMAAAA(iso: string): string {
  const [anio, mes, dia] = partes(iso);
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${anio}`;
}

// Último día del período calendario que contiene a "desde":
//   DIARIO    → el mismo día
//   SEMANAL   → el domingo de esa semana (si "desde" ya es domingo, el mismo día)
//   QUINCENAL → el 15, o el último día del mes si "desde" cae en la segunda quincena
// Si "desde" no es el primer día del período (porque el cierre anterior terminó a mitad), el cierre cubre solo
// lo que falta del período: así los cierres quedan consecutivos y sin huecos.
export function finDelPeriodo(tipo: TipoCierre, desde: string): string {
  const [anio, mes, dia] = partes(desde);
  switch (tipo) {
    case 'DIARIO':
      return desde;
    case 'SEMANAL': {
      const diaSemana = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay(); // 0 = domingo
      return sumarDias(desde, (7 - diaSemana) % 7);
    }
    case 'QUINCENAL':
      return dia <= 15 ? aISO(anio, mes, 15) : aISO(anio, mes, ultimoDiaDelMes(anio, mes));
  }
}

export function esFechaISOValida(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [anio, mes, dia] = partes(iso);
  return sumarDias(aISO(anio, mes, dia), 0) === iso;
}
