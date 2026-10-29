import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { normalizarTexto, type Celda } from './celdas.js';
import { HOJAS, MAXIMO_FILAS_POR_HOJA, type ClaveHoja, type HojaPlantilla } from './plantilla-definicion.js';

// Un problema encontrado al leer o validar el archivo, ubicado por hoja y fila para que se pueda corregir en el Excel.
export interface ProblemaImportacion {
  hoja: string;
  // Número de fila en el Excel (la 1 es el encabezado); null si el problema es de toda la hoja o del archivo.
  fila: number | null;
  columna?: string;
  mensaje: string;
}

export interface FilaLeida {
  fila: number;
  celdas: Record<string, Celda>;
}

export interface HojaLeida<C extends string = ClaveHoja> {
  clave: C;
  // false si el libro no trae esa hoja.
  presente: boolean;
  filas: FilaLeida[];
}

export interface LibroLeido<C extends string = ClaveHoja> {
  hojas: Record<C, HojaLeida<C>>;
  problemas: ProblemaImportacion[];
}

// Un .xlsx es un archivo comprimido (zip): empieza por "PK". El nombre o el tipo que declare el navegador no
// prueban nada; los primeros bytes sí.
export function parecexlsx(buffer: Buffer): boolean {
  return buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
}

// Convierte lo que guarda ExcelJS en una celda (texto, número, fecha, fórmula, texto con formato, hipervínculo)
// en un valor simple.
function valorSimple(valor: ExcelJS.CellValue): Celda {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) return valor;
  if (typeof valor === 'object') {
    if ('result' in valor) return valorSimple(valor.result as ExcelJS.CellValue);
    if ('richText' in valor) return valor.richText.map((trozo) => trozo.text).join('');
    if ('text' in valor) return String(valor.text);
    if ('error' in valor) return String(valor.error);
    return null;
  }
  return valor;
}

function buscarHoja<C extends string>(libro: ExcelJS.Workbook, definicion: HojaPlantilla<C>): ExcelJS.Worksheet | undefined {
  const nombres = [definicion.nombre, ...(definicion.alias ?? [])].map(normalizarTexto);
  return libro.worksheets.find((hoja) => nombres.includes(normalizarTexto(hoja.name)));
}

// Lee el libro de la carga de ventas, con las hojas y columnas de su plantilla.
export function leerLibro(buffer: Buffer): Promise<LibroLeido> {
  return leerLibroDe(buffer, HOJAS);
}

// Lee el libro con las hojas y columnas que describe una plantilla. Las hojas y columnas que no se reconocen se
// ignoran; las columnas obligatorias que faltan se reportan. No interpreta los valores: eso lo hace la validación.
export async function leerLibroDe<C extends string>(buffer: Buffer, definiciones: readonly HojaPlantilla<C>[]): Promise<LibroLeido<C>> {
  if (!parecexlsx(buffer)) {
    throw new BadRequestException('El archivo no es un libro de Excel (.xlsx). Descarga la plantilla y llénala.');
  }

  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new BadRequestException('No se pudo leer el archivo. Verifica que sea un .xlsx válido y que no esté dañado.');
  }

  const problemas: ProblemaImportacion[] = [];
  const hojas = {} as Record<C, HojaLeida<C>>;

  for (const definicion of definiciones) {
    const hoja = buscarHoja(libro, definicion);
    if (!hoja) {
      hojas[definicion.clave] = { clave: definicion.clave, presente: false, filas: [] };
      continue;
    }

    if (hoja.rowCount > MAXIMO_FILAS_POR_HOJA + 1) {
      problemas.push({ hoja: definicion.nombre, fila: null, mensaje: `La hoja tiene más de ${MAXIMO_FILAS_POR_HOJA} filas. Divide la carga en varios archivos.` });
      hojas[definicion.clave] = { clave: definicion.clave, presente: true, filas: [] };
      continue;
    }

    // Encabezado (fila 1): qué columna del Excel corresponde a cada campo de la plantilla.
    const columnaDe = new Map<string, number>();
    hoja.getRow(1).eachCell({ includeEmpty: false }, (celda, numeroColumna) => {
      const texto = valorSimple(celda.value);
      if (texto === null) return;
      const encabezado = normalizarTexto(String(texto));
      const columna = definicion.columnas.find((candidata) =>
        [candidata.encabezado, ...(candidata.alias ?? [])].some((nombre) => normalizarTexto(nombre) === encabezado),
      );
      if (columna && !columnaDe.has(columna.clave)) columnaDe.set(columna.clave, numeroColumna);
    });

    const faltantes = definicion.columnas.filter((columna) => columna.obligatoria && !columnaDe.has(columna.clave));
    for (const columna of faltantes) {
      problemas.push({ hoja: definicion.nombre, fila: 1, columna: columna.encabezado, mensaje: `Falta la columna "${columna.encabezado}"` });
    }

    const filas: FilaLeida[] = [];
    if (faltantes.length === 0) {
      hoja.eachRow({ includeEmpty: false }, (fila, numeroFila) => {
        if (numeroFila === 1) return;
        const celdas: Record<string, Celda> = {};
        let conDatos = false;
        for (const [clave, numeroColumna] of columnaDe) {
          const valor = valorSimple(fila.getCell(numeroColumna).value);
          celdas[clave] = valor;
          if (valor !== null && !(typeof valor === 'string' && valor.trim() === '')) conDatos = true;
        }
        if (conDatos) filas.push({ fila: numeroFila, celdas });
      });
    }
    hojas[definicion.clave] = { clave: definicion.clave, presente: true, filas };
  }

  if (!definiciones.some((definicion) => hojas[definicion.clave].presente)) {
    throw new BadRequestException(`El archivo no trae ninguna de las hojas de la plantilla (${definiciones.map((definicion) => definicion.nombre).join(', ')}).`);
  }

  return { hojas, problemas };
}
