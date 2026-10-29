import ExcelJS from 'exceljs';
import { HOJAS, type ClaveHoja, type ColumnaPlantilla, type HojaPlantilla } from './plantilla-definicion.js';

const FILAS_CON_LISTA = 2000;
const COLOR_ENCABEZADO = 'FF1E3A8A';
const COLOR_OBLIGATORIA = 'FFFEF3C7';

function letraDeColumna(indice: number): string {
  let letra = '';
  for (let n = indice; n > 0; n = Math.floor((n - 1) / 26)) {
    letra = String.fromCharCode(65 + ((n - 1) % 26)) + letra;
  }
  return letra;
}

function textoDeAyuda(columna: ColumnaPlantilla): string {
  return `${columna.obligatoria ? 'Obligatoria. ' : 'Opcional. '}${columna.ayuda}\nEjemplo: ${columna.ejemplo}`;
}

export interface DefinicionDeLibro<C extends string = ClaveHoja> {
  titulo: string;
  // Los pasos de la hoja "Instrucciones".
  pasos: readonly string[];
  hojas: readonly HojaPlantilla<C>[];
}

const PASOS_DE_VENTAS = [
  '1. Llena las hojas que necesites (puedes dejar vacías las que no uses). No cambies los nombres de las hojas ni de los encabezados.',
  '2. Una fila por registro. Las filas completamente vacías se ignoran.',
  '3. Los lotes se identifican por Proyecto + Manzana + Lote. Los clientes, por su Documento. Escríbelos igual en todas las hojas.',
  '4. Dinero en pesos enteros, sin centavos (por ejemplo 45000000 o $45.000.000). Fechas como dd/mm/aaaa.',
  '5. Los abonos entran con recibo histórico (serie H-) y se aplican a las cuotas en orden de vencimiento. Las cuentas bancarias deben estar creadas antes en Configuración.',
  '6. En el sistema, sube el archivo: primero se valida SIN guardar y se muestran los errores por hoja y fila. Solo cuando no haya errores se confirma la carga.',
  '7. Lo que ya existe (proyectos, lotes, clientes) se reutiliza y no se modifica. Una venta o un abono nunca se duplica ni se sobrescribe.',
  '8. Pasa el cursor sobre cada encabezado para ver la ayuda y un ejemplo. Las columnas obligatorias tienen el encabezado en amarillo.',
];

// Libro de Excel con las hojas de la plantilla de ventas (RF-MIG-01).
export function generarPlantilla(): Promise<Buffer> {
  return generarLibroDePlantilla({ titulo: 'Plantilla de carga de datos', pasos: PASOS_DE_VENTAS, hojas: HOJAS });
}

// Libro de Excel con las hojas de una plantilla. Cada hoja tiene solo la fila de encabezados: las filas
// de ejemplo van en la hoja Instrucciones y en una nota de cada encabezado, para que NUNCA se importe un ejemplo.
export async function generarLibroDePlantilla<C extends string>({ titulo, pasos, hojas }: DefinicionDeLibro<C>): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Urbanix';

  const instrucciones = libro.addWorksheet('Instrucciones');
  instrucciones.getColumn(1).width = 28;
  instrucciones.getColumn(2).width = 110;
  instrucciones.addRow([titulo]).font = { bold: true, size: 14 };
  instrucciones.addRow([]);
  for (const paso of pasos) {
    const fila = instrucciones.addRow([paso]);
    instrucciones.mergeCells(fila.number, 1, fila.number, 2);
    fila.alignment = { wrapText: true, vertical: 'top' };
  }
  instrucciones.addRow([]);
  instrucciones.addRow(['Hojas']).font = { bold: true };
  for (const hoja of hojas) {
    const fila = instrucciones.addRow([hoja.nombre, hoja.descripcion]);
    fila.getCell(1).font = { bold: true };
    fila.getCell(2).alignment = { wrapText: true, vertical: 'top' };
  }

  for (const hoja of hojas) {
    const sheet = libro.addWorksheet(hoja.nombre);
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    hoja.columnas.forEach((columna, indice) => {
      const celda = sheet.getCell(1, indice + 1);
      celda.value = columna.encabezado;
      celda.font = { bold: true, color: { argb: columna.obligatoria ? 'FF000000' : 'FFFFFFFF' } };
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: columna.obligatoria ? COLOR_OBLIGATORIA : COLOR_ENCABEZADO } };
      celda.note = textoDeAyuda(columna);
      sheet.getColumn(indice + 1).width = columna.ancho ?? 18;

      if (columna.tipo === 'lista' && columna.opciones) {
        const letra = letraDeColumna(indice + 1);
        for (let fila = 2; fila <= FILAS_CON_LISTA; fila++) {
          sheet.getCell(`${letra}${fila}`).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [`"${columna.opciones.join(',')}"`],
          };
        }
      }
      if (columna.tipo === 'fecha') {
        sheet.getColumn(indice + 1).numFmt = 'dd/mm/yyyy';
      } else if (columna.tipo === 'pesos') {
        sheet.getColumn(indice + 1).numFmt = '#,##0';
      } else if (columna.tipo === 'texto') {
        // Los documentos y números de lote como texto: Excel no les quita ceros ni los vuelve notación científica.
        sheet.getColumn(indice + 1).numFmt = '@';
      }
    });
  }

  return Buffer.from(await libro.xlsx.writeBuffer());
}
