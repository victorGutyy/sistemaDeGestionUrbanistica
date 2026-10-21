import ExcelJS from 'exceljs';
import type { ColumnaReporte, ReporteGenerado, SeccionReporte, ValorCelda } from './modelo.js';

export interface EmpresaParaReporte {
  nombreComercial: string;
  razonSocial: string;
  nit: string;
}

const FORMATO_FECHA_HORA = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const textoDeGeneracion = (iso: string) => `Generado el ${FORMATO_FECHA_HORA.format(new Date(iso))}`;

// Excel no admite estos caracteres en el nombre de una hoja, ni más de 31 letras, ni nombres repetidos.
function nombreDeHoja(titulo: string, usados: Set<string>): string {
  const base = titulo.replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Hoja';
  let nombre = base;
  for (let n = 2; usados.has(nombre.toLowerCase()); n++) nombre = `${base.slice(0, 28)} ${n}`;
  usados.add(nombre.toLowerCase());
  return nombre;
}

// "aaaa-mm-dd" como fecha de Excel (medianoche UTC: Excel la muestra con su formato, sin corrimientos de zona).
const aFechaExcel = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function valorDeCelda(columna: ColumnaReporte, valor: ValorCelda): string | number | Date | null {
  if (valor === null || valor === undefined || valor === '') return null;
  switch (columna.tipo) {
    case 'pesos':
    case 'entero': {
      const numero = Number(valor);
      return Number.isFinite(numero) ? numero : String(valor);
    }
    case 'fecha':
      return /^\d{4}-\d{2}-\d{2}$/.test(String(valor)) ? aFechaExcel(String(valor)) : String(valor);
    default:
      return String(valor);
  }
}

function formatoDeColumna(columna: ColumnaReporte): string | undefined {
  if (columna.tipo === 'pesos') return '"$"#,##0;[Red]-"$"#,##0';
  if (columna.tipo === 'entero') return '#,##0';
  if (columna.tipo === 'fecha') return 'dd/mm/yyyy';
  return undefined;
}

function dibujarSeccion(hoja: ExcelJS.Worksheet, seccion: SeccionReporte): void {
  hoja.addRow([seccion.titulo]).font = { bold: true, size: 13 };
  let filaDeEncabezado = 2;
  if (seccion.nota) {
    hoja.addRow([seccion.nota]).font = { italic: true, color: { argb: 'FF475569' } };
    filaDeEncabezado += 1;
  }
  if (seccion.filasTotales) {
    hoja.addRow([`Se muestran las primeras ${seccion.filas.length} de ${seccion.filasTotales} filas: afina los filtros para ver el resto.`]).font = { italic: true, color: { argb: 'FF92400E' } };
    filaDeEncabezado += 1;
  }
  hoja.addRow([]);
  filaDeEncabezado += 1;

  const encabezado = hoja.addRow(seccion.columnas.map((columna) => columna.encabezado));
  encabezado.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  encabezado.alignment = { vertical: 'middle', wrapText: true };
  encabezado.eachCell((celda) => {
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  });

  seccion.columnas.forEach((columna, indice) => {
    const formato = formatoDeColumna(columna);
    if (formato) hoja.getColumn(indice + 1).numFmt = formato;
    if (columna.tipo === 'pesos' || columna.tipo === 'entero') hoja.getColumn(indice + 1).alignment = { horizontal: 'right' };
    hoja.getColumn(indice + 1).width = Math.max(12, Math.round(14 * (columna.peso ?? 1)));
  });
  // Los encabezados y el título no deben heredar la alineación ni el formato numérico de la columna.
  encabezado.eachCell((celda) => {
    celda.numFmt = 'General';
    celda.alignment = { vertical: 'middle', wrapText: true, horizontal: 'center' };
  });

  for (const fila of seccion.filas) {
    hoja.addRow(seccion.columnas.map((columna) => valorDeCelda(columna, fila[columna.clave] ?? null)));
  }
  if (seccion.totales) {
    const totales = hoja.addRow(seccion.columnas.map((columna) => valorDeCelda(columna, seccion.totales![columna.clave] ?? null)));
    totales.font = { bold: true };
    totales.eachCell((celda) => {
      celda.border = { top: { style: 'thin' } };
    });
  }

  hoja.views = [{ state: 'frozen', ySplit: filaDeEncabezado }];
  if (seccion.filas.length > 1) {
    hoja.autoFilter = { from: { row: filaDeEncabezado, column: 1 }, to: { row: filaDeEncabezado + seccion.filas.length, column: seccion.columnas.length } };
  }
}

// Reporte en Excel (RF-REP-10): una hoja de portada con el encabezado y los filtros, y una hoja por sección, con los
// números como números (se pueden sumar y filtrar), el dinero con formato de pesos y las fechas como fechas.
export async function generarExcelReporte(reporte: ReporteGenerado, empresa: EmpresaParaReporte): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = empresa.nombreComercial;
  libro.created = new Date(reporte.generadoEn);
  const usados = new Set<string>();

  const portada = libro.addWorksheet(nombreDeHoja('Reporte', usados));
  portada.getColumn(1).width = 28;
  portada.getColumn(2).width = 70;
  portada.addRow([empresa.nombreComercial]).font = { bold: true, size: 14 };
  portada.addRow([`${empresa.razonSocial} · NIT ${empresa.nit}`]);
  portada.addRow([]);
  portada.addRow([reporte.titulo]).font = { bold: true, size: 13 };
  portada.addRow([reporte.descripcion]).font = { italic: true, color: { argb: 'FF475569' } };
  portada.addRow([]);
  if (reporte.filtros.length === 0) portada.addRow(['Filtros', 'Sin filtros: todo lo registrado']);
  for (const filtro of reporte.filtros) {
    const fila = portada.addRow([filtro.etiqueta, filtro.valor]);
    fila.getCell(1).font = { bold: true };
  }
  portada.addRow([]);
  portada.addRow([textoDeGeneracion(reporte.generadoEn)]).font = { color: { argb: 'FF475569' } };
  portada.addRow([]);
  portada.addRow(['Hojas de este libro']).font = { bold: true };

  for (const seccion of reporte.secciones) {
    const hoja = libro.addWorksheet(nombreDeHoja(seccion.titulo, usados));
    portada.addRow([hoja.name, `${seccion.filas.length} fila${seccion.filas.length === 1 ? '' : 's'}`]);
    dibujarSeccion(hoja, seccion);
  }

  return Buffer.from(await libro.xlsx.writeBuffer());
}

// Para los nombres de archivo ("recaudo-2026-10-01-a-2026-10-31.xlsx").
export function nombreDeArchivo(reporte: ReporteGenerado, extension: 'pdf' | 'xlsx', desde?: string, hasta?: string): string {
  const rango = desde || hasta ? `-${desde ?? 'inicio'}-a-${hasta ?? 'hoy'}` : '';
  return `${reporte.clave}${rango}.${extension}`;
}

