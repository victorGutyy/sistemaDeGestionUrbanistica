import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { leerLibroDe } from '../importacion/leer-libro.js';
import { generarLibroDePlantilla } from '../importacion/plantilla.js';
import { HOJAS_SST, PASOS_SST } from './plantilla-sst-definicion.js';

async function plantilla() {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load((await generarLibroDePlantilla({ titulo: 'Plantilla de prueba', pasos: PASOS_SST, hojas: HOJAS_SST })) as unknown as ArrayBuffer);
  return libro;
}

describe('plantilla de carga de SST (RF-SST-23)', () => {
  it('trae una hoja de instrucciones y una hoja por cada hoja de la definición', async () => {
    const libro = await plantilla();
    expect(libro.worksheets.map((h) => h.name)).toEqual(['Instrucciones', 'Trabajadores', 'Ausentismos', 'Entregas EPP', 'Asistencias']);
    const instrucciones = libro.getWorksheet('Instrucciones')!;
    const texto = JSON.stringify(instrucciones.getSheetValues());
    expect(texto).toContain('Plantilla de prueba');
    expect(texto).toContain('entra todo o no entra nada');
    for (const hoja of HOJAS_SST) expect(texto).toContain(hoja.nombre);
  });

  it('cada hoja tiene solo los encabezados de su definición: nunca una fila de ejemplo que se pueda cargar por error', async () => {
    const libro = await plantilla();
    for (const hoja of HOJAS_SST) {
      const sheet = libro.getWorksheet(hoja.nombre)!;
      // Las filas con lista desplegable existen, pero sin valores: la única fila con datos es la de los encabezados.
      const filasConValores: number[] = [];
      sheet.eachRow({ includeEmpty: true }, (fila, numero) => {
        if (fila.hasValues) filasConValores.push(numero);
      });
      expect(filasConValores, hoja.nombre).toEqual([1]);
      expect(hoja.columnas.map((_, i) => sheet.getCell(1, i + 1).value)).toEqual(hoja.columnas.map((c) => c.encabezado));
    }
  });

  it('las columnas obligatorias se distinguen y cada encabezado trae su ayuda y su ejemplo', async () => {
    const libro = await plantilla();
    const sheet = libro.getWorksheet('Ausentismos')!;
    const columnas = HOJAS_SST.find((h) => h.clave === 'ausentismos')!.columnas;
    columnas.forEach((columna, i) => {
      const celda = sheet.getCell(1, i + 1);
      const fondo = (celda.fill as ExcelJS.FillPattern).fgColor?.argb;
      expect(fondo, columna.encabezado).toBe(columna.obligatoria ? 'FFFEF3C7' : 'FF1E3A8A');
      const nota = typeof celda.note === 'string' ? celda.note : JSON.stringify(celda.note);
      expect(nota, columna.encabezado).toContain(columna.obligatoria ? 'Obligatoria.' : 'Opcional.');
      expect(nota, columna.encabezado).toContain('Ejemplo:');
    });
  });

  it('las columnas de lista traen la lista desplegable', async () => {
    const libro = await plantilla();
    const sheet = libro.getWorksheet('Entregas EPP')!;
    const motivo = HOJAS_SST.find((h) => h.clave === 'entregasEpp')!.columnas.findIndex((c) => c.clave === 'motivo') + 1;
    expect(sheet.getCell(2, motivo).dataValidation).toMatchObject({ type: 'list' });
    expect(String(sheet.getCell(2, motivo).dataValidation.formulae?.[0])).toContain('Dotación inicial');
  });

  it('los nombres de las hojas y de los encabezados no se repiten, y las claves tampoco', () => {
    expect(new Set(HOJAS_SST.map((h) => h.clave)).size).toBe(HOJAS_SST.length);
    for (const hoja of HOJAS_SST) {
      expect(new Set(hoja.columnas.map((c) => c.clave)).size, hoja.nombre).toBe(hoja.columnas.length);
      expect(new Set(hoja.columnas.map((c) => c.encabezado)).size, hoja.nombre).toBe(hoja.columnas.length);
    }
  });
});

describe('leerLibroDe con las hojas de SST', () => {
  async function libroConFilas(armar: (libro: ExcelJS.Workbook) => void) {
    const libro = new ExcelJS.Workbook();
    armar(libro);
    return Buffer.from(await libro.xlsx.writeBuffer());
  }

  it('lee las filas de cada hoja por el encabezado, también con los nombres alternativos, y ignora lo que no conoce', async () => {
    const buffer = await libroConFilas((libro) => {
      const trabajadores = libro.addWorksheet('Trabajadores');
      trabajadores.addRow(['Cédula', 'Nombres', 'Apellidos', 'Cargo', 'Salario', 'Ingreso', 'Columna que no existe']);
      trabajadores.addRow([1000000001, 'Persona', 'Inventada', 'Oficial', 1750905, '15/01/2026', 'x']);
      trabajadores.addRow([null, null, null, null, null, null, null]);
      const ausentismos = libro.addWorksheet('Incapacidades');
      ausentismos.addRow(['Documento', 'Tipo', 'Desde', 'Hasta', 'CIE-10', 'Prórroga']);
      ausentismos.addRow(['1000000001', 'Enfermedad general', '10/03/2026', '14/03/2026', 'M54.5', 'No']);
      libro.addWorksheet('Hoja que no es de la plantilla').addRow(['a']);
    });
    const leido = await leerLibroDe(buffer, HOJAS_SST);
    expect(leido.problemas).toEqual([]);
    expect(leido.hojas.trabajadores.filas).toEqual([{ fila: 2, celdas: expect.objectContaining({ documento: 1000000001, nombres: 'Persona', salarioBase: 1750905, fechaIngreso: '15/01/2026' }) }]);
    expect(leido.hojas.trabajadores.filas[0].celdas).not.toHaveProperty('Columna que no existe');
    expect(leido.hojas.ausentismos.filas[0]).toMatchObject({ fila: 2, celdas: { documento: '1000000001', tipo: 'Enfermedad general', cie10: 'M54.5', prorroga: 'No' } });
    expect(leido.hojas.entregasEpp.presente).toBe(false);
    expect(leido.hojas.asistencias.presente).toBe(false);
  });

  it('una columna obligatoria que falta es un problema y la hoja no se lee', async () => {
    const buffer = await libroConFilas((libro) => {
      const hoja = libro.addWorksheet('Trabajadores');
      hoja.addRow(['Documento', 'Nombres', 'Apellidos', 'Cargo', 'Salario base']);
      hoja.addRow(['1000000001', 'Persona', 'Inventada', 'Oficial', 1750905]);
    });
    const leido = await leerLibroDe(buffer, HOJAS_SST);
    expect(leido.problemas).toEqual([{ hoja: 'Trabajadores', fila: 1, columna: 'Fecha de ingreso', mensaje: 'Falta la columna "Fecha de ingreso"' }]);
    expect(leido.hojas.trabajadores.filas).toEqual([]);
  });

  it('un libro sin ninguna hoja de la plantilla se rechaza diciendo cuáles son', async () => {
    const buffer = await libroConFilas((libro) => libro.addWorksheet('Otra').addRow(['a']));
    await expect(leerLibroDe(buffer, HOJAS_SST)).rejects.toThrow('Trabajadores, Ausentismos, Entregas EPP, Asistencias');
  });

  it('algo que no es un .xlsx se rechaza', async () => {
    await expect(leerLibroDe(Buffer.from('esto no es un libro de Excel'), HOJAS_SST)).rejects.toThrow(/no es un libro de Excel/);
  });
});
