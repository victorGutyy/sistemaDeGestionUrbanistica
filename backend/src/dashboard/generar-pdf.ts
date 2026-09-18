import PDFDocument from 'pdfkit';
import type { ResumenDashboard } from './resumen-dashboard.js';

export function generarPdfResumen(resumen: ResumenDashboard): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const documento = new PDFDocument({ margin: 40 });
    const trozos: Buffer[] = [];
    documento.on('data', (trozo: Buffer) => trozos.push(trozo));
    documento.on('end', () => resolve(Buffer.concat(trozos)));
    documento.on('error', reject);

    documento.fontSize(18).text('Reporte general', { align: 'center' });
    documento.moveDown(0.5);
    documento
      .fontSize(10)
      .text(`Período: ${resumen.periodo.desde ?? 'inicio'} a ${resumen.periodo.hasta ?? 'hoy'}`, {
        align: 'center',
      });
    documento.moveDown();

    documento.fontSize(14).text('Finanzas');
    documento
      .fontSize(10)
      .text(`Ingresos por ventas: $${resumen.finanzas.ingresosPorVentas.toString()}`)
      .text(`Ingresos generales: $${resumen.finanzas.ingresosGenerales.toString()}`)
      .text(`Gastos: $${resumen.finanzas.gastos.toString()}`)
      .text(`Total ingresos: $${resumen.finanzas.totalIngresos.toString()}`)
      .text(`Caja neta: $${resumen.finanzas.cajaNeta.toString()}`);
    documento.moveDown();

    documento.fontSize(14).text('Cartera');
    documento
      .fontSize(10)
      .text(`Cartera vencida: $${resumen.cartera.saldoVencido.toString()}`)
      .text(`Cartera por vencer: $${resumen.cartera.saldoPorVencer.toString()}`)
      .text(`Interés de mora: $${resumen.cartera.interesMora.toString()}`);
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
          `Caja neta: $${fila.cajaNeta.toString()}  ·  Cartera vencida: $${fila.saldoVencido.toString()}  ·  Por vencer: $${fila.saldoPorVencer.toString()}`,
        );
    }

    documento.end();
  });
}
