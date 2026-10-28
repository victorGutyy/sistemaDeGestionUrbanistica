// Aritmética de días calendario para la gestión SST (hora local de Colombia). Funciones puras, sin horas: un cambio de hora
// del servidor no mueve el resultado.

const MS_POR_DIA = 24 * 60 * 60 * 1000;

export function inicioDelDia(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
}

export function sumarDias(fecha: Date, dias: number): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + dias);
}

// Días calendario entre dos fechas (negativo si "hasta" es anterior a "desde").
export function diasEntre(desde: Date, hasta: Date): number {
  const a = Date.UTC(desde.getFullYear(), desde.getMonth(), desde.getDate());
  const b = Date.UTC(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
  return Math.round((b - a) / MS_POR_DIA);
}

// Mueve una fecha una cantidad de años conservando mes y día. El 29 de febrero de un año que no es bisiesto queda en el
// último día de febrero (y no pasa a marzo).
export function sumarAnios(fecha: Date, anios: number): Date {
  const anio = fecha.getFullYear() + anios;
  const mes = fecha.getMonth();
  const movida = new Date(anio, mes, fecha.getDate());
  return movida.getMonth() === mes ? movida : new Date(anio, mes + 1, 0);
}
