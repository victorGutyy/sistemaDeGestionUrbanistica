import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { leerLibro } from './leer-libro.js';
import { generarPlantilla } from './plantilla.js';
import { HOJAS } from './plantilla-definicion.js';
import { validarImportacion } from './validar.js';

async function cargar(buffer: Buffer) {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return libro;
}

async function aBuffer(libro: ExcelJS.Workbook) {
  return Buffer.from(await libro.xlsx.writeBuffer());
}

describe('plantilla de Excel (RF-MIG-01)', () => {
  it('trae la hoja de instrucciones y una hoja por cada hoja definida, solo con encabezados', async () => {
    const libro = await cargar(await generarPlantilla());
    expect(libro.worksheets.map((hoja) => hoja.name)).toEqual(['Instrucciones', ...HOJAS.map((hoja) => hoja.nombre)]);

    for (const definicion of HOJAS) {
      const hoja = libro.getWorksheet(definicion.nombre);
      expect(hoja?.getRow(1).values).toEqual([undefined, ...definicion.columnas.map((columna) => columna.encabezado)]);
      // Ninguna fila de ejemplo: lo que se descarga nunca se puede importar por accidente.
      expect(hoja?.actualRowCount).toBe(1);
    }
  });

  it('cada encabezado lleva una nota de ayuda con un ejemplo', async () => {
    const libro = await cargar(await generarPlantilla());
    const nota = libro.getWorksheet('Abonos')?.getCell('E1').note;
    expect(JSON.stringify(nota)).toMatch(/Ejemplo:/);
  });

  it('la plantilla vacía se lee sin problemas de columnas, y validarla dice que no hay filas', async () => {
    const leido = await leerLibro(await generarPlantilla());
    expect(leido.problemas).toEqual([]);
    expect(Object.values(leido.hojas).every((hoja) => hoja.presente && hoja.filas.length === 0)).toBe(true);
    const resultado = validarImportacion(leido, {
      hoy: '2026-10-18',
      proyectos: [],
      clientes: [],
      vendedores: [],
      cuentas: [],
      mediosActivos: [],
      referencias: [],
      cierresBloqueantes: [],
    });
    expect(resultado.errores.map((error) => error.mensaje).join(' ')).toMatch(/no trae filas para importar/);
  });
});

describe('lectura del libro', () => {
  it('lee las filas llenadas, con fechas de Excel, números y texto, e ignora filas vacías', async () => {
    const libro = await cargar(await generarPlantilla());
    const clientes = libro.getWorksheet('Clientes') as ExcelJS.Worksheet;
    clientes.addRow(['1000000001', 'Cliente de Prueba Uno', '3000000001', 'cliente1@ejemplo.test', 'Calle 1 # 2-3']);
    clientes.addRow([]);
    clientes.addRow([1000000002, 'Cliente de Prueba Dos']);
    const abonos = libro.getWorksheet('Abonos') as ExcelJS.Worksheet;
    abonos.addRow(['La Floresta', 'A', 12, new Date(Date.UTC(2026, 4, 10)), 13500000, 'Consignación', 'Bancolombia ahorros', '000123']);

    const leido = await leerLibro(await aBuffer(libro));
    expect(leido.problemas).toEqual([]);
    expect(leido.hojas.clientes.filas.map((fila) => [fila.fila, fila.celdas.documento, fila.celdas.nombre])).toEqual([
      [2, '1000000001', 'Cliente de Prueba Uno'],
      [4, 1000000002, 'Cliente de Prueba Dos'],
    ]);
    expect(leido.hojas.abonos.filas[0].celdas).toMatchObject({ proyecto: 'La Floresta', manzana: 'A', numero: 12, valor: 13500000, medioPago: 'Consignación', cuenta: 'Bancolombia ahorros' });
    expect((leido.hojas.abonos.filas[0].celdas.fecha as Date).toISOString().slice(0, 10)).toBe('2026-05-10');
  });

  it('reconoce los encabezados por sus nombres alternativos, sin importar tildes ni mayúsculas, y en otro orden', async () => {
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet('CLIENTES');
    hoja.addRow(['NOMBRE COMPLETO', 'cedula', 'Celular', 'columna que sobra']);
    hoja.addRow(['Cliente de Prueba Uno', '1000000001', '3000000001', 'x']);

    const leido = await leerLibro(await aBuffer(libro));
    expect(leido.problemas).toEqual([]);
    expect(leido.hojas.clientes.filas[0].celdas).toEqual({ nombre: 'Cliente de Prueba Uno', documento: '1000000001', telefono: '3000000001' });
    expect(leido.hojas.proyectos.presente).toBe(false);
  });

  it('reporta las columnas obligatorias que faltan', async () => {
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet('Clientes');
    hoja.addRow(['Documento']);
    hoja.addRow(['1000000001']);

    const leido = await leerLibro(await aBuffer(libro));
    expect(leido.problemas).toEqual([{ hoja: 'Clientes', fila: 1, columna: 'Nombre', mensaje: 'Falta la columna "Nombre"' }]);
    expect(leido.hojas.clientes.filas).toEqual([]);
  });

  it('rechaza lo que no es un libro de Excel, aunque tenga extensión .xlsx', async () => {
    await expect(leerLibro(Buffer.from('esto es un texto cualquiera'))).rejects.toBeInstanceOf(BadRequestException);
    await expect(leerLibro(Buffer.from('PK\u0003\u0004 pero no es un excel de verdad'))).rejects.toThrow(/No se pudo leer el archivo/);
  });

  it('rechaza un libro que no trae ninguna hoja de la plantilla', async () => {
    const libro = new ExcelJS.Workbook();
    libro.addWorksheet('Otra cosa').addRow(['a']);
    await expect(leerLibro(await aBuffer(libro))).rejects.toThrow(/ninguna de las hojas de la plantilla/);
  });
});
