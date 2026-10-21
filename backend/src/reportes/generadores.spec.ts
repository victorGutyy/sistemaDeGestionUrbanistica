import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { generarExcelReporte } from './generar-excel.js';
import { generarPdfReporte, textoDeCelda } from './generar-pdf.js';
import type { ReporteGenerado } from './modelo.js';

const EMPRESA = { nombreComercial: 'Empresa de Prueba', razonSocial: 'Empresa de Prueba SAS', nit: '900000000' };

const reporte = (filas = 3): ReporteGenerado => ({
  clave: 'recaudo',
  titulo: 'Recaudo',
  descripcion: 'Lo que pagaron los clientes.',
  filtros: [{ etiqueta: 'Período', valor: '01/10/2026 a 31/10/2026' }],
  generadoEn: '2026-10-21T15:00:00.000Z',
  secciones: [
    {
      titulo: 'Detalle: abonos / [prueba]',
      nota: 'Una nota de la sección.',
      columnas: [
        { clave: 'fecha', encabezado: 'Fecha', tipo: 'fecha' },
        { clave: 'cliente', encabezado: 'Cliente', tipo: 'texto', peso: 3 },
        { clave: 'cantidad', encabezado: 'Abonos', tipo: 'entero' },
        { clave: 'valor', encabezado: 'Valor', tipo: 'pesos' },
      ],
      filas: Array.from({ length: filas }, (_, i) => ({ fecha: '2026-10-05', cliente: `Cliente Inventado ${i + 1}`, cantidad: i + 1, valor: String(1_000_000 * (i + 1)) })),
      totales: { fecha: 'Total', valor: '6000000' },
    },
    { titulo: 'Detalle: abonos / [prueba]', columnas: [{ clave: 'a', encabezado: 'A', tipo: 'texto' }], filas: [] },
  ],
});

describe('textoDeCelda (lo que se ve en el papel)', () => {
  it('muestra el dinero como $1.234.567 y un negativo como -$680.000', () => {
    expect(textoDeCelda({ clave: 'v', encabezado: 'V', tipo: 'pesos' }, '1234567')).toBe('$1.234.567');
    expect(textoDeCelda({ clave: 'v', encabezado: 'V', tipo: 'pesos' }, '-680000')).toBe('-$680.000');
    expect(textoDeCelda({ clave: 'v', encabezado: 'V', tipo: 'pesos' }, '0')).toBe('$0');
  });

  it('muestra las fechas como dd/mm/aaaa y deja pasar el texto y las celdas vacías', () => {
    expect(textoDeCelda({ clave: 'f', encabezado: 'F', tipo: 'fecha' }, '2026-10-05')).toBe('05/10/2026');
    expect(textoDeCelda({ clave: 't', encabezado: 'T', tipo: 'texto' }, 'Hola')).toBe('Hola');
    expect(textoDeCelda({ clave: 't', encabezado: 'T', tipo: 'texto' }, null)).toBe('');
    expect(textoDeCelda({ clave: 'e', encabezado: 'E', tipo: 'entero' }, 12000)).toBe('12.000');
  });
});

describe('generarExcelReporte', () => {
  it('arma una portada y una hoja por sección, con nombres válidos y sin repetirse', async () => {
    const buffer = await generarExcelReporte(reporte(), EMPRESA);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buffer as unknown as ExcelJS.Buffer);

    expect(libro.worksheets.map((h) => h.name)).toEqual(['Reporte', 'Detalle abonos prueba', 'Detalle abonos prueba 2']);
    const portada = libro.getWorksheet('Reporte')!;
    const textos = portada.getSheetValues().flat().map(String);
    expect(textos).toContain('Empresa de Prueba');
    expect(textos).toContain('01/10/2026 a 31/10/2026');
  });

  it('deja los números como números, el dinero con formato de pesos y las fechas como fechas', async () => {
    const buffer = await generarExcelReporte(reporte(), EMPRESA);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const hoja = libro.getWorksheet('Detalle abonos prueba')!;

    // Fila 1 título, 2 nota, 3 vacía, 4 encabezados, 5 en adelante datos.
    expect(hoja.getRow(4).getCell(2).value).toBe('Cliente');
    const primera = hoja.getRow(5);
    expect(primera.getCell(1).value).toEqual(new Date('2026-10-05T00:00:00.000Z'));
    expect(primera.getCell(3).value).toBe(1);
    expect(primera.getCell(4).value).toBe(1_000_000);
    expect(hoja.getColumn(4).numFmt).toContain('$');
    expect(hoja.getRow(8).getCell(4).value).toBe(6_000_000);
    expect(hoja.getRow(8).font?.bold).toBe(true);
  });

  it('avisa en la hoja cuando el detalle se recortó', async () => {
    const recortado = reporte();
    recortado.secciones[0].filasTotales = 9000;
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load((await generarExcelReporte(recortado, EMPRESA)) as unknown as ExcelJS.Buffer);
    expect(libro.getWorksheet('Detalle abonos prueba')!.getSheetValues().flat().map(String).some((t) => t.includes('de 9000 filas'))).toBe(true);
  });
});

describe('generarPdfReporte', () => {
  const paginas = (pdf: Buffer) => Number(/\/Count (\d+)/.exec(pdf.toString('latin1'))?.[1]);
  const esPdf = (pdf: Buffer) => pdf.subarray(0, 5).toString('ascii') === '%PDF-';

  it('genera un PDF válido de una hoja para un reporte corto', async () => {
    const pdf = await generarPdfReporte(reporte(), { empresa: EMPRESA });
    expect(esPdf(pdf)).toBe(true);
    expect(paginas(pdf)).toBe(1);
  });

  it('pasa a más hojas cuando la tabla es larga', async () => {
    const pdf = await generarPdfReporte(reporte(300), { empresa: EMPRESA });
    expect(esPdf(pdf)).toBe(true);
    expect(paginas(pdf)).toBeGreaterThan(3);
  });

  it('una tabla ancha (más de 6 columnas) sale en una hoja horizontal', async () => {
    const ancho = reporte();
    ancho.secciones[0].columnas = Array.from({ length: 8 }, (_, i) => ({ clave: `c${i}`, encabezado: `Columna ${i}`, tipo: 'texto' as const }));
    ancho.secciones[0].filas = [{ c0: 'x' }];
    const pdf = await generarPdfReporte(ancho, { empresa: EMPRESA });
    // En una hoja A4 horizontal el ancho (MediaBox) es mayor que el alto.
    const caja = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(pdf.toString('latin1'))!;
    expect(Number(caja[1])).toBeGreaterThan(Number(caja[2]));
  });

  it('un reporte sin datos, sin filtros y con un logo que no sirve igual se genera', async () => {
    const vacio = reporte(0);
    vacio.filtros = [];
    const pdf = await generarPdfReporte(vacio, { empresa: EMPRESA, logo: Buffer.from('esto no es una imagen') });
    expect(esPdf(pdf)).toBe(true);
  });
});
