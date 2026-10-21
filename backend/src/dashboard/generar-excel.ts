import ExcelJS from 'exceljs';
import { formatearFechaISO } from '../common/formato.util.js';
import type { EmpresaParaReporte } from './generar-pdf.js';
import { ETIQUETA_ESTADO_LOTE } from '../reportes/constructores/inventario.js';
import type { ResumenDashboard } from './resumen-dashboard.js';

export async function generarExcelResumen(resumen: ResumenDashboard, empresa: EmpresaParaReporte): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const hoja = workbook.addWorksheet('Resumen general');

  hoja.addRow([empresa.nombreComercial]).font = { bold: true, size: 14 };
  hoja.addRow([`${empresa.razonSocial} · NIT ${empresa.nit}`]);
  hoja.addRow([]);
  hoja.addRow(['Reporte general']).font = { bold: true };
  if (resumen.proyecto) hoja.addRow([`Proyecto: ${resumen.proyecto.nombre}`]);
  hoja.addRow([
    `Período: ${resumen.periodo.desde ? formatearFechaISO(resumen.periodo.desde) : 'inicio'} a ${resumen.periodo.hasta ? formatearFechaISO(resumen.periodo.hasta) : 'hoy'}`,
  ]);
  hoja.addRow([]);

  hoja.addRow(['Finanzas']).font = { bold: true };
  hoja.addRow(['Ingresos por ventas', resumen.finanzas.ingresosPorVentas.toString()]);
  hoja.addRow(['Ingresos generales', resumen.finanzas.ingresosGenerales.toString()]);
  hoja.addRow(['Gastos', resumen.finanzas.gastos.toString()]);
  hoja.addRow(['Total ingresos', resumen.finanzas.totalIngresos.toString()]);
  hoja.addRow(['Caja neta', resumen.finanzas.cajaNeta.toString()]);
  hoja.addRow([]);

  hoja.addRow(['Cartera']).font = { bold: true };
  hoja.addRow(['Cartera vencida', resumen.cartera.saldoVencido.toString()]);
  hoja.addRow([`Cartera al día (más de ${resumen.cartera.diasAlerta} días para vencer)`, resumen.cartera.saldoPorVencer.minus(resumen.cartera.saldoProximoAVencer).toString()]);
  hoja.addRow([`Cartera por vencer (próximos ${resumen.cartera.diasAlerta} días)`, resumen.cartera.saldoProximoAVencer.toString()]);
  hoja.addRow(['Interés de mora', resumen.cartera.interesMora.toString()]);
  hoja.addRow([]);

  hoja.addRow(['Lotes por estado']).font = { bold: true };
  for (const [estado, cantidad] of Object.entries(resumen.lotesPorEstado)) hoja.addRow([ETIQUETA_ESTADO_LOTE[estado as keyof typeof ETIQUETA_ESTADO_LOTE], cantidad]);
  if (resumen.comisionesPendientes) hoja.addRow(['Comisiones por pagar', `${resumen.comisionesPendientes.cantidad} (${resumen.comisionesPendientes.valor.toString()})`]);
  if (resumen.cierresPorAprobar !== undefined) hoja.addRow(['Cierres de caja por aprobar', resumen.cierresPorAprobar]);
  if (resumen.consignacionesPorVerificar) hoja.addRow(['Consignaciones por verificar', resumen.consignacionesPorVerificar.cantidad]);
  hoja.addRow([]);

  const encabezado = hoja.addRow([
    'Proyecto',
    'Ingresos por ventas',
    'Ingresos generales',
    'Gastos',
    'Caja neta',
    'Cartera vencida',
    'Cartera por vencer',
    'Interés de mora',
  ]);
  encabezado.font = { bold: true };

  for (const fila of resumen.porProyecto) {
    hoja.addRow([
      fila.nombre,
      fila.ingresosPorVentas.toString(),
      fila.ingresosGenerales.toString(),
      fila.gastos.toString(),
      fila.cajaNeta.toString(),
      fila.saldoVencido.toString(),
      fila.saldoPorVencer.toString(),
      fila.interesMora.toString(),
    ]);
  }

  hoja.columns.forEach((columna) => {
    columna.width = 22;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
