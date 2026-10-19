import { Prisma } from '../generated/prisma/client.js';

// Conversión de lo que devuelve la base de datos a lo que se escribe en una celda de Excel (RNF-LEG-02). Funciones
// puras: se prueban sin base de datos.

// Excel no admite más de 32.767 caracteres por celda.
const MAXIMO_CARACTERES = 32_000;

const FORMATO_BOGOTA = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Bogota',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const dos = (n: number) => String(n).padStart(2, '0');

// Campos que NUNCA se exportan: contraseñas (hash), tokens y secretos.
export function esCampoSensible(nombre: string): boolean {
  return /hash|token|secret|password|contrasena/i.test(nombre);
}

// Una fecha de calendario sale como dd/mm/aaaa y un instante como dd/mm/aaaa hh:mm, siempre en hora de Colombia.
// Hay dos formas de guardar un día en la base: a medianoche UTC (columnas de tipo fecha) y a medianoche de Colombia
// (fechas que llegan de formularios); las dos salen como el día de calendario, sin hora.
export function formatearFechaExcel(fecha: Date): string {
  if (fecha.getUTCHours() === 0 && fecha.getUTCMinutes() === 0 && fecha.getUTCSeconds() === 0 && fecha.getUTCMilliseconds() === 0) {
    return `${dos(fecha.getUTCDate())}/${dos(fecha.getUTCMonth() + 1)}/${fecha.getUTCFullYear()}`;
  }
  const partes = Object.fromEntries(FORMATO_BOGOTA.formatToParts(fecha).map((parte) => [parte.type, parte.value]));
  const dia = `${partes.day}/${partes.month}/${partes.year}`;
  return partes.hour === '00' && partes.minute === '00' && fecha.getUTCSeconds() === 0 ? dia : `${dia} ${partes.hour}:${partes.minute}`;
}

export type CeldaExcel = string | number | null;

export function aCeldaExcel(valor: unknown): CeldaExcel {
  if (valor === null || valor === undefined) return null;
  if (Prisma.Decimal.isDecimal(valor)) return Number((valor as Prisma.Decimal).toString());
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : formatearFechaExcel(valor);
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  if (typeof valor === 'number') return valor;
  if (typeof valor === 'bigint') return Number(valor);
  if (typeof valor === 'string') return recortar(valor);
  if (Array.isArray(valor)) return recortar(valor.map((elemento) => String(aCeldaExcel(elemento) ?? '')).join(', '));
  return recortar(JSON.stringify(valor));
}

function recortar(texto: string): string {
  return texto.length > MAXIMO_CARACTERES ? `${texto.slice(0, MAXIMO_CARACTERES)}… (texto recortado)` : texto;
}
