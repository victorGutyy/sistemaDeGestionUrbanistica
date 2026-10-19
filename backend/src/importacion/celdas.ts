import { Prisma } from '../generated/prisma/client.js';

// Lectura de celdas de Excel. Funciones puras: reciben lo que trae la celda (texto, número, fecha) y devuelven el
// valor ya convertido o un mensaje en español de qué está mal. Nunca lanzan.

export type Celda = string | number | boolean | Date | null;

export type Lectura<T> = { ok: true; valor: T } | { ok: false; mensaje: string };

const ok = <T>(valor: T): Lectura<T> => ({ ok: true, valor });
const mal = (mensaje: string): Lectura<never> => ({ ok: false, mensaje });

// Máximo que cabe en una columna de dinero (Decimal 14,2) sin decimales.
const MAXIMO_PESOS = 999_999_999_999;

export function esVacia(celda: Celda | undefined): boolean {
  return celda === null || celda === undefined || (typeof celda === 'string' && celda.trim() === '');
}

// Para comparar nombres sin importar mayúsculas, tildes, espacios dobles ni signos.
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Para mostrar y guardar: sin espacios sobrantes y con los espacios dobles reducidos a uno.
export function limpiarTexto(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}

export function leerTexto(celda: Celda): Lectura<string> {
  if (celda instanceof Date) return mal('Debe ser texto, no una fecha');
  const texto = limpiarTexto(String(celda));
  return ok(texto);
}

// Documentos y códigos que Excel a veces guarda como número (1000000001) o como número con formato (1.000.000.001).
export function leerCodigo(celda: Celda): Lectura<string> {
  if (celda instanceof Date) return mal('Debe ser texto o número, no una fecha');
  if (typeof celda === 'number') {
    if (!Number.isFinite(celda) || !Number.isInteger(celda)) return mal('Debe ser un número entero o texto');
    return ok(String(celda));
  }
  return ok(limpiarTexto(String(celda)));
}

const PESOS_CON_PUNTOS = /^\d{1,3}(\.\d{3})+(,0+)?$/;
const PESOS_PLANOS = /^\d+(,0+)?$/;

// Dinero en pesos enteros. Acepta 1500000, "1500000", "$1.500.000" y "1.500.000,00"; rechaza decimales y negativos.
export function leerPesos(celda: Celda): Lectura<Prisma.Decimal> {
  if (celda instanceof Date) return mal('Debe ser un valor en pesos, no una fecha');
  let entero: string;
  if (typeof celda === 'number') {
    if (!Number.isFinite(celda)) return mal('Debe ser un valor en pesos');
    if (celda < 0) return mal('No puede ser negativo');
    if (!Number.isInteger(celda)) return mal('Debe ser en pesos enteros, sin centavos');
    entero = String(celda);
  } else {
    const texto = String(celda).replace(/[$\s]/g, '');
    if (texto.startsWith('-')) return mal('No puede ser negativo');
    if (PESOS_CON_PUNTOS.test(texto)) entero = texto.replace(/,.*$/, '').replace(/\./g, '');
    else if (PESOS_PLANOS.test(texto)) entero = texto.replace(/,.*$/, '');
    else return mal('Debe ser un valor en pesos enteros (por ejemplo 1500000 o $1.500.000)');
  }
  if (Number(entero) > MAXIMO_PESOS) return mal('El valor es demasiado grande');
  return ok(new Prisma.Decimal(entero));
}

// Áreas y medidas: número con hasta 2 decimales (punto o coma).
export function leerDecimal(celda: Celda): Lectura<Prisma.Decimal> {
  if (celda instanceof Date) return mal('Debe ser un número, no una fecha');
  let texto: string;
  if (typeof celda === 'number') {
    if (!Number.isFinite(celda)) return mal('Debe ser un número');
    texto = String(celda);
  } else {
    texto = String(celda).replace(/\s/g, '').replace(',', '.');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(texto)) {
    return mal(texto.startsWith('-') ? 'No puede ser negativo' : 'Debe ser un número con hasta 2 decimales');
  }
  if (Number(texto) > 99_999_999) return mal('El valor es demasiado grande');
  return ok(new Prisma.Decimal(texto));
}

export function leerEntero(celda: Celda): Lectura<number> {
  if (celda instanceof Date) return mal('Debe ser un número entero, no una fecha');
  const numero = typeof celda === 'number' ? celda : /^\d+$/.test(String(celda).trim()) ? Number(String(celda).trim()) : Number.NaN;
  if (!Number.isInteger(numero) || numero < 0 || numero > 100_000) return mal('Debe ser un número entero');
  return ok(numero);
}

const ANIO_MINIMO = 1990;
const ANIO_MAXIMO = 2100;

function esFechaReal(anio: number, mes: number, dia: number): boolean {
  if (anio < ANIO_MINIMO || anio > ANIO_MAXIMO) return false;
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia;
}

function aISO(anio: number, mes: number, dia: number): string {
  return `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

const MENSAJE_FECHA = 'Debe ser una fecha válida en formato dd/mm/aaaa';

// Una fecha de calendario como "aaaa-mm-dd". Acepta celdas de fecha de Excel, el número de serie de Excel,
// "dd/mm/aaaa", "dd-mm-aaaa" y "aaaa-mm-dd". Excel guarda las fechas a medianoche UTC: por eso se leen las partes UTC.
export function leerFecha(celda: Celda): Lectura<string> {
  if (celda instanceof Date) {
    if (Number.isNaN(celda.getTime())) return mal(MENSAJE_FECHA);
    const [anio, mes, dia] = [celda.getUTCFullYear(), celda.getUTCMonth() + 1, celda.getUTCDate()];
    return esFechaReal(anio, mes, dia) ? ok(aISO(anio, mes, dia)) : mal(MENSAJE_FECHA);
  }
  if (typeof celda === 'number') {
    // Número de serie de Excel (días desde 1899-12-30).
    if (!Number.isFinite(celda) || celda < 25_000 || celda > 80_000) return mal(MENSAJE_FECHA);
    return leerFecha(new Date(Date.UTC(1899, 11, 30) + Math.floor(celda) * 86_400_000));
  }
  const texto = String(celda).trim();
  let coincidencia = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(texto);
  if (coincidencia) {
    const [dia, mes, anio] = [Number(coincidencia[1]), Number(coincidencia[2]), Number(coincidencia[3])];
    return esFechaReal(anio, mes, dia) ? ok(aISO(anio, mes, dia)) : mal(MENSAJE_FECHA);
  }
  coincidencia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (coincidencia) {
    const [anio, mes, dia] = [Number(coincidencia[1]), Number(coincidencia[2]), Number(coincidencia[3])];
    return esFechaReal(anio, mes, dia) ? ok(aISO(anio, mes, dia)) : mal(MENSAJE_FECHA);
  }
  return mal(MENSAJE_FECHA);
}

// Una opción de una lista cerrada, sin importar mayúsculas ni tildes. Devuelve la opción escrita como en la lista.
export function leerOpcion(celda: Celda, opciones: string[]): Lectura<string> {
  const texto = normalizarTexto(String(celda));
  const encontrada = opciones.find((opcion) => normalizarTexto(opcion) === texto);
  return encontrada ? ok(encontrada) : mal(`Debe ser una de estas opciones: ${opciones.join(', ')}`);
}
