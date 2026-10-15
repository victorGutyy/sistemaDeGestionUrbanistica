// Colombia no tiene horario de verano: es UTC-5 todo el año. Toda la lógica
// de fechas de negocio (plan de cuotas, mora, recordatorios) usa fechas
// "locales", así que fijamos la zona del proceso para que el resultado sea
// el mismo en un PC en Bogotá o en un servidor en UTC.
//
// Debe importarse antes que cualquier otro módulo (ver main.ts).
export const ZONA_HORARIA = 'America/Bogota';

process.env.TZ = ZONA_HORARIA;
