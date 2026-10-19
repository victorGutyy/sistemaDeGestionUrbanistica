import ExcelJS from 'exceljs';
import { diaLocal } from '../cierres-caja/periodo.js';
import { formatearFechaISO } from '../common/formato.util.js';
import type { FilaConciliacion, ResumenImportacion } from './validar.js';

const ETIQUETA_ESTADO = { COINCIDE: 'Coincide', DIFERENCIA: 'Diferencia', SIN_DATO: 'Sin dato del Excel' } as const;

// Reporte de conciliación de saldos de una importación (RF-MIG-05), para revisarlo con el gerente.
// Todos los valores son pesos enteros: Excel los guarda sin pérdida.
export async function generarConciliacionExcel(
  datos: { nombreArchivo: string; fecha: Date; usuario: string; resumen: ResumenImportacion; filas: FilaConciliacion[] },
  empresa: { nombreComercial: string },
): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Conciliación');

  hoja.addRow([empresa.nombreComercial]).font = { bold: true, size: 14 };
  hoja.addRow(['Conciliación de saldos importados']).font = { bold: true };
  hoja.addRow([`Archivo: ${datos.nombreArchivo} · Importado el ${formatearFechaISO(diaLocal(datos.fecha))} por ${datos.usuario}`]);
  hoja.addRow([
    `Ventas: ${datos.resumen.ventas} · Valor de las ventas: ${datos.resumen.valorVentas} · Abonado: ${datos.resumen.totalAbonado} · Saldo por cobrar: ${datos.resumen.totalSaldo} · Con diferencia: ${datos.resumen.conDiferencia}`,
  ]);
  hoja.addRow([]);

  const encabezado = hoja.addRow([
    'Proyecto',
    'Manzana',
    'Lote',
    'Documento',
    'Cliente',
    'Forma de pago',
    'Valor total',
    'Cuota inicial',
    'Abonado',
    'Saldo según el sistema',
    'Saldo según el Excel',
    'Diferencia',
    'Estado',
    'Cuotas pagadas',
    'Cuotas totales',
    'Abonos',
  ]);
  encabezado.font = { bold: true };
  encabezado.eachCell((celda) => {
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
  });

  for (const fila of datos.filas) {
    const agregada = hoja.addRow([
      fila.proyecto,
      fila.manzana ?? '',
      fila.lote,
      fila.documentoCliente,
      fila.cliente,
      fila.formaPago === 'CONTADO' ? 'Contado' : 'Financiado',
      Number(fila.valorTotal),
      Number(fila.cuotaInicial),
      Number(fila.abonado),
      Number(fila.saldo),
      fila.saldoSegunExcel === null ? '' : Number(fila.saldoSegunExcel),
      fila.diferencia === null ? '' : Number(fila.diferencia),
      ETIQUETA_ESTADO[fila.estado],
      fila.cuotasPagadas,
      fila.cuotasTotales,
      fila.abonos,
    ]);
    if (fila.estado === 'DIFERENCIA') {
      agregada.eachCell((celda) => {
        celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      });
    }
  }
  for (const columna of [7, 8, 9, 10, 11, 12]) hoja.getColumn(columna).numFmt = '#,##0';
  hoja.columns.forEach((columna, indice) => {
    columna.width = indice === 4 ? 30 : indice === 0 ? 24 : 16;
  });

  return Buffer.from(await libro.xlsx.writeBuffer());
}
