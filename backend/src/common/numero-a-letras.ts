// Valor en letras para los recibos: "CUARENTA Y CINCO MILLONES DE PESOS M/CTE".
// Solo pesos enteros (los valores de venta y de abonos no llevan centavos).

const UNIDADES = [
  'cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce',
  'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno',
  'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve',
];
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

const MAXIMO = 999_999_999_999_999; // cientos de billones: de sobra para pesos

// Delante de "mil", "millones" o "pesos", "uno" se dice "un" (y "veintiuno", "veintiún").
function apocopar(texto: string): string {
  if (texto.endsWith('veintiuno')) return texto.slice(0, -'veintiuno'.length) + 'veintiún';
  return texto.endsWith('uno') ? texto.slice(0, -1) : texto;
}

function menorDeMil(n: number, conApocope: boolean): string {
  if (n === 0) return 'cero';
  if (n === 100) return 'cien';
  const centenas = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (centenas > 0) partes.push(CENTENAS[centenas]);
  if (resto > 0) {
    if (resto < 30) {
      partes.push(UNIDADES[resto]);
    } else {
      const unidad = resto % 10;
      partes.push(DECENAS[Math.floor(resto / 10)] + (unidad ? ` y ${UNIDADES[unidad]}` : ''));
    }
  }
  const texto = partes.join(' ');
  return conApocope ? apocopar(texto) : texto;
}

function convertir(n: number, conApocope: boolean): string {
  if (n < 1000) return menorDeMil(n, conApocope);

  if (n < 1_000_000) {
    const miles = Math.floor(n / 1000);
    const resto = n % 1000;
    const parteMiles = miles === 1 ? 'mil' : `${menorDeMil(miles, true)} mil`;
    return resto ? `${parteMiles} ${menorDeMil(resto, conApocope)}` : parteMiles;
  }

  const millones = Math.floor(n / 1_000_000);
  const resto = n % 1_000_000;
  const parteMillones = millones === 1 ? 'un millón' : `${convertir(millones, true)} millones`;
  return resto ? `${parteMillones} ${convertir(resto, conApocope)}` : parteMillones;
}

export function valorEnLetras(valor: number | string | { toString(): string }): string {
  const n = Number(valor.toString());
  if (!Number.isInteger(n) || n < 0 || n > MAXIMO) {
    throw new RangeError('El valor en letras solo admite pesos enteros no negativos');
  }
  if (n === 1) return 'UN PESO M/CTE';
  const letras = convertir(n, true);
  // "un millón de pesos", "dos millones de pesos", pero "un millón quinientos mil pesos".
  const exactoEnMillones = n >= 1_000_000 && n % 1_000_000 === 0;
  return `${letras}${exactoEnMillones ? ' de' : ''} pesos M/CTE`.toUpperCase();
}
