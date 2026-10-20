import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { convertirVentas, escribirPlantilla, partirNomenclatura } from './convertir-ventas.js';

// Libro INVENTADO con la misma forma que el de ventas por lote: títulos arriba, encabezados en la fila 5, un par
// fecha/valor por mes y fórmulas de total. Ningún dato es real.
function libroInventado() {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('VENTAS');
  hoja.addRow(['Título del reporte']);
  hoja.addRow([]);
  hoja.addRow([]);
  hoja.addRow([]);
  hoja.addRow(['N° LOTE', 'NOMENCLATURA', 'M2 LOTE', 'CEDULA CIUDADANIA', 'CLIENTE', 'CELULAR', 'FECHA', 'VALOR LOTE', 'VR CUOTA', 'FEC INI', 'CUOTA INICAL', 'FEC ENE', 'ENERO', 'FEC FEB', 'FEBRERO', 'ABONO TOTAL', 'SALDO LOTE']);
  const d = (dia: number, mes: number) => new Date(Date.UTC(2026, mes - 1, dia));
  // Financiado: cuota inicial + enero + febrero; el total viene como fórmula con su resultado guardado.
  hoja.addRow([1, 'A 01', 100, 1000000001, 'Cliente Inventado Uno', 3000000001, d(5, 12), 50_000_000, 2_000_000, d(5, 12), 15_000_000, d(5, 1), 2_000_000, d(5, 2), 2_000_000, { formula: 'SUM(...)', result: 19_000_000 }, { formula: 'H6-P6', result: 31_000_000 }]);
  // Contado: sin valor de cuota.
  hoja.addRow([2, 'A 02', 90, '1.000.000.002', 'Cliente Inventado Dos', '3000000002', d(10, 1), 40_000_000, null, d(10, 1), 40_000_000, null, null, null, null, { formula: 'SUM(...)', result: 40_000_000 }, { formula: 'H7-P7', result: 0 }]);
  // Lote sin vender.
  hoja.addRow([3, 'B-03', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null]);
  // Venta sin cédula, con un pago sin fecha.
  hoja.addRow([4, 'B 04', 100, null, 'Cliente Inventado Tres', null, d(1, 2), 45_000_000, 3_000_000, null, 9_000_000, null, null, null, null, { formula: 'SUM(...)', result: 9_000_000 }, { formula: 'H9-P9', result: 36_000_000 }]);
  // El mismo cliente comprando otro lote.
  hoja.addRow([5, 'B 05', 100, 1000000001, 'Cliente Inventado Uno', 3000000001, d(1, 2), 45_000_000, 3_000_000, d(1, 2), 9_000_000, null, null, null, null, { formula: 'SUM(...)', result: 9_000_000 }, { formula: 'H10-P10', result: 36_000_000 }]);
  // Fila de totales: sin nomenclatura.
  hoja.addRow([null, null, null, null, null, null, null, { formula: 'SUBTOTAL(...)', result: 180_000_000 }]);
  return libro.getWorksheet('VENTAS')!;
}

const OPCIONES = { proyecto: 'Proyecto Inventado', medioPago: 'Efectivo' };

describe('partirNomenclatura', () => {
  it('separa manzana y lote con espacio, guion o sin separador', () => {
    expect(partirNomenclatura('A 12')).toEqual({ manzana: 'A', numero: '12', reconocida: true });
    expect(partirNomenclatura('b-03')).toEqual({ manzana: 'B', numero: '03', reconocida: true });
    expect(partirNomenclatura('C7')).toEqual({ manzana: 'C', numero: '7', reconocida: true });
  });

  it('lo que no tiene esa forma queda entero como número de lote y se marca como no reconocido', () => {
    expect(partirNomenclatura('LOTE ESQUINERO')).toEqual({ manzana: null, numero: 'LOTE ESQUINERO', reconocida: false });
  });
});

describe('convertirVentas', () => {
  const r = convertirVentas(libroInventado(), OPCIONES);

  it('genera un lote por fila con nomenclatura y deja pasar las filas de totales', () => {
    expect(r.lotes.map((l) => `${l.manzana}${l.numero}`)).toEqual(['A01', 'A02', 'B03', 'B04', 'B05']);
    expect(r.lotes[0]).toMatchObject({ proyecto: 'Proyecto Inventado', area: 100, valorVenta: 50_000_000 });
  });

  it('avisa los lotes sin área o sin valor, con el número de fila del original y nunca con datos', () => {
    expect(r.avisos.get('Lote sin área (la plantilla la pide)')).toEqual([8]);
    expect(r.avisos.get('Lote sin valor (la plantilla lo pide)')).toEqual([8]);
  });

  it('una venta con valor de cuota es financiada: cuota inicial, fecha y número de cuotas salen del saldo', () => {
    expect(r.ventas[0]).toMatchObject({
      documentoCliente: '1000000001',
      formaPago: 'Financiado',
      valorTotal: 50_000_000,
      cuotaInicial: 15_000_000,
      numeroCuotas: 18,
      saldoSegunExcel: 31_000_000,
    });
    expect(r.ventas[0].fechaCuotaInicial).toEqual(new Date(Date.UTC(2026, 11, 5)));
  });

  it('una venta sin valor de cuota es de contado y no lleva cuotas ni cuota inicial aparte', () => {
    expect(r.ventas[1]).toMatchObject({ documentoCliente: '1000000002', formaPago: 'Contado', cuotaInicial: null, numeroCuotas: null });
  });

  it('un lote sin cliente no genera venta', () => {
    expect(r.ventas.some((v) => v.numero === '03')).toBe(false);
  });

  it('crea cada cliente una sola vez aunque compre dos lotes, con la cédula limpia', () => {
    expect(r.clientes.map((c) => c.documento)).toEqual(['1000000001', '1000000002']);
    expect(r.clientes[0]).toMatchObject({ tipoDocumento: 'CC', nombre: 'Cliente Inventado Uno', telefono: '3000000001' });
    expect(r.ventas.filter((v) => v.documentoCliente === '1000000001')).toHaveLength(2);
  });

  it('una venta sin cédula no crea cliente y se avisa para completarla', () => {
    expect(r.avisos.get('Venta sin cédula (no se creó el cliente; completa Clientes y Ventas)')).toEqual([9]);
    expect(r.ventas.find((v) => v.numero === '04')?.documentoCliente).toBeNull();
  });

  it('cada pago (cuota inicial y meses) es un abono con la fecha de la columna de su izquierda', () => {
    const delPrimero = r.abonos.filter((a) => a.numero === '01');
    expect(delPrimero.map((a) => a.valor)).toEqual([15_000_000, 2_000_000, 2_000_000]);
    expect(delPrimero.map((a) => a.fecha)).toEqual([new Date(Date.UTC(2026, 11, 5)), new Date(Date.UTC(2026, 0, 5)), new Date(Date.UTC(2026, 1, 5))]);
    expect(delPrimero.every((a) => a.medioPago === 'Efectivo')).toBe(true);
  });

  it('un pago sin fecha se convierte igual y se avisa', () => {
    expect(r.avisos.get('Pago de cuota inicial sin fecha (la plantilla la pide)')).toEqual([9]);
  });

  it('ningún aviso del original trae valores: solo texto fijo y números de fila', () => {
    for (const [tipo, filas] of r.avisos) {
      expect(tipo).not.toMatch(/Cliente Inventado|1000000/);
      expect(filas.every((f) => Number.isInteger(f))).toBe(true);
    }
  });

  it('comprueba que el total del original coincide con la suma de lo convertido', () => {
    expect(r.filasQueNoCuadran).toEqual([]);
    const desajustado = libroInventado();
    desajustado.getRow(6).getCell(16).value = { formula: 'SUM(...)', result: 99 };
    expect(convertirVentas(desajustado, OPCIONES).filasQueNoCuadran).toEqual([6]);
  });

  it('sin la columna NOMENCLATURA no se puede convertir', () => {
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet('X');
    hoja.addRow(['A', 'B']);
    expect(() => convertirVentas(hoja, OPCIONES)).toThrow(/NOMENCLATURA/);
  });
});

describe('escribirPlantilla', () => {
  it('deja las filas convertidas en las hojas de la plantilla estándar, con sus encabezados', async () => {
    const buffer = await escribirPlantilla(convertirVentas(libroInventado(), OPCIONES));
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buffer as unknown as ExcelJS.Buffer);

    expect(libro.getWorksheet('Lotes')!.getRow(2).getCell(3).value).toBe('01');
    expect(libro.getWorksheet('Clientes')!.getRow(2).getCell(1).value).toBe('1000000001');
    expect(libro.getWorksheet('Ventas')!.rowCount).toBeGreaterThanOrEqual(5);
    expect(libro.getWorksheet('Abonos')!.getRow(2).getCell(1).value).toBe('Proyecto Inventado');
    // Las instrucciones y las hojas de la plantilla siguen ahí.
    expect(libro.getWorksheet('Instrucciones')).toBeDefined();
  });
});
