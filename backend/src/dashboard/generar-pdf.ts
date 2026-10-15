import PDFDocument from 'pdfkit';
import { formatearCOP, formatearFechaISO } from '../common/formato.util.js';
import type { ResumenDashboard } from './resumen-dashboard.js';

export interface EmpresaParaReporte {
  nombreComercial: string;
  razonSocial: string;
  nit: string;
}

export function generarPdfResumen(resumen: ResumenDashboard, empresa: EmpresaParaReporte): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const documento = new PDFDocument({ margin: 40 });
    const trozos: Buffer[] = [];
    documento.on('data', (trozo: Buffer) => trozos.push(trozo));
    documento.on('end', () => resolve(Buffer.concat(trozos)));
    documento.on('error', reject);

    documento.fontSize(14).font('Helvetica-Bold').text(empresa.nombreComercial, { align: 'center' });
    documento
      .fontSize(9)
      .font('Helvetica')
      .text(`${empresa.razonSocial} · NIT ${empresa.nit}`, { align: 'center' });
    documento.moveDown();

    documento.fontSize(18).text('Reporte general', { align: 'center' });
    documento.moveDown(0.5);
    documento
      .fontSize(10)
      .text(
        `Período: ${resumen.periodo.desde ? formatearFechaISO(resumen.periodo.desde) : 'inicio'} a ${resumen.periodo.hasta ? formatearFechaISO(resumen.periodo.hasta) : 'hoy'}`,
        { align: 'center' },
      );
    documento.moveDown();

    documento.fontSize(14).text('Finanzas');
    documento
      .fontSize(10)
      .text(`Ingresos por ventas: ${formatearCOP(resumen.finanzas.ingresosPorVentas)}`)
      .text(`Ingresos generales: ${formatearCOP(resumen.finanzas.ingresosGenerales)}`)
      .text(`Gastos: ${formatearCOP(resumen.finanzas.gastos)}`)
      .text(`Total ingresos: ${formatearCOP(resumen.finanzas.totalIngresos)}`)
      .text(`Caja neta: ${formatearCOP(resumen.finanzas.cajaNeta)}`);
    documento.moveDown();

    documento.fontSize(14).text('Cartera');
    documento
      .fontSize(10)
      .text(`Cartera vencida: ${formatearCOP(resumen.cartera.saldoVencido)}`)
      .text(`Cartera por vencer: ${formatearCOP(resumen.cartera.saldoPorVencer)}`)
      .text(`Interés de mora: ${formatearCOP(resumen.cartera.interesMora)}`);
    documento.moveDown();

    documento.fontSize(14).text('Por proyecto');
    documento.fontSize(9);
    if (resumen.porProyecto.length === 0) {
      documento.text('No hay proyectos con movimientos en este período.');
    }
    for (const fila of resumen.porProyecto) {
      documento
        .moveDown(0.3)
        .font('Helvetica-Bold')
        .text(fila.nombre)
        .font('Helvetica')
        .text(
          `Caja neta: ${formatearCOP(fila.cajaNeta)}  ·  Cartera vencida: ${formatearCOP(fila.saldoVencido)}  ·  Por vencer: ${formatearCOP(fila.saldoPorVencer)}`,
        );
    }

    documento.end();
  });
}
