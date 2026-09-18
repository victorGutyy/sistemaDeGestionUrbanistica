// `new Date('2026-01-31')` parsea la fecha como medianoche UTC. En zonas
// horarias negativas (América/Bogotá, UTC-5) eso cae en "30 de enero,
// 19:00 local", así que `.getDate()` devuelve 30, no 31. Para fechas de
// negocio (fecha de venta, vencimiento de cuotas) solo nos interesa el día
// calendario, nunca la hora, así que las parseamos como fecha local.
export function parsearFechaLocal(fechaISO: string): Date {
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  return new Date(anio, mes - 1, dia);
}
