import PDFDocument from 'pdfkit';
import { formatearCOP } from '../common/formato.util.js';
import type { ContenidoRecibo } from './recibo-contenido.js';

export interface AnulacionRecibo {
  fecha: Date;
  motivo: string;
  usuario: string;
}

export interface OpcionesPdfRecibo {
  /** Imagen del logo ya leída del almacenamiento (solo PNG o JPG; pdfkit no dibuja WebP). */
  logo?: Buffer;
  /** Si el abono se anuló, el recibo se dibuja con la marca de agua ANULADO. */
  anulacion?: AnulacionRecibo;
}

const FORMATO_FECHA = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' });
const FORMATO_FECHA_HORA = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const colorSeguro = (color: string) => (/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#2563eb');

// El PDF se genera siempre desde la fotografía guardada al emitir el recibo (ContenidoRecibo):
// volver a descargarlo da exactamente el mismo documento (RF-REC-09).
export function generarPdfRecibo(contenido: ContenidoRecibo, opciones: OpcionesPdfRecibo = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const documento = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Recibo de caja ${contenido.numeroTexto}` } });
    const trozos: Buffer[] = [];
    documento.on('data', (trozo: Buffer) => trozos.push(trozo));
    documento.on('end', () => resolve(Buffer.concat(trozos)));
    documento.on('error', reject);

    const color = colorSeguro(contenido.empresa.colorPrimario);
    const ancho = documento.page.width - 80;
    const { empresa } = contenido;

    // ---- Encabezado: empresa ----
    let xTexto = 40;
    if (opciones.logo) {
      try {
        documento.image(opciones.logo, 40, 40, { fit: [64, 64] });
        xTexto = 116;
      } catch {
        // Un logo que no se pueda dibujar no debe impedir emitir el recibo.
      }
    }
    documento.fillColor('#0f172a').font('Helvetica-Bold').fontSize(15).text(empresa.nombreComercial, xTexto, 42, { width: ancho - 190 });
    documento.font('Helvetica').fontSize(9).fillColor('#475569');
    documento.text(`${empresa.razonSocial} · NIT ${empresa.nit}`, xTexto, documento.y + 1, { width: ancho - 190 });
    const contacto = [empresa.direccion, empresa.telefonos, empresa.correo].filter(Boolean).join(' · ');
    if (contacto) documento.text(contacto, xTexto, documento.y + 1, { width: ancho - 190 });

    // ---- Encabezado: número y fecha ----
    documento.roundedRect(documento.page.width - 40 - 170, 40, 170, 64, 6).lineWidth(1.2).strokeColor(color).stroke();
    documento.fillColor(color).font('Helvetica-Bold').fontSize(10).text('RECIBO DE CAJA', documento.page.width - 40 - 170, 48, { width: 170, align: 'center' });
    documento.fillColor('#0f172a').fontSize(15).text(`No. ${contenido.numeroTexto}`, documento.page.width - 40 - 170, 63, { width: 170, align: 'center' });
    documento.font('Helvetica').fontSize(8).fillColor('#475569').text(`Fecha: ${FORMATO_FECHA.format(new Date(contenido.fechaAbono))}`, documento.page.width - 40 - 170, 86, {
      width: 170,
      align: 'center',
    });

    documento.y = 122;
    if (contenido.esHistorico) {
      documento.font('Helvetica-Oblique').fontSize(8).fillColor('#92400e');
      documento.text('Recibo histórico: constancia de un pago anterior al sistema o importado; no corresponde a la numeración de recibos de caja.', 40, documento.y, { width: ancho });
      documento.moveDown(0.6);
    }
    documento.moveTo(40, documento.y).lineTo(40 + ancho, documento.y).strokeColor('#e2e8f0').lineWidth(1).stroke();
    documento.moveDown(0.8);

    // ---- Cliente y lote ----
    const campo = (etiqueta: string, valor: string, x: number, y: number, anchoCampo: number) => {
      documento.font('Helvetica').fontSize(7.5).fillColor('#64748b').text(etiqueta.toUpperCase(), x, y, { width: anchoCampo });
      documento.font('Helvetica-Bold').fontSize(10.5).fillColor('#0f172a').text(valor, x, y + 10, { width: anchoCampo });
    };
    let y = documento.y;
    campo('Recibimos de', contenido.cliente.nombre, 40, y, ancho * 0.6);
    campo('Documento', contenido.cliente.documento, 40 + ancho * 0.62, y, ancho * 0.38);
    y += 38;
    campo('Proyecto', contenido.proyecto, 40, y, ancho * 0.5);
    campo('Manzana', contenido.manzana ?? '—', 40 + ancho * 0.52, y, ancho * 0.2);
    campo('Lote', contenido.lote, 40 + ancho * 0.74, y, ancho * 0.26);

    // ---- Valor ----
    y += 46;
    documento.roundedRect(40, y, ancho, 58, 6).fillAndStroke('#f8fafc', '#cbd5e1');
    documento.fillColor('#64748b').font('Helvetica').fontSize(7.5).text('LA SUMA DE', 52, y + 8);
    documento.fillColor('#0f172a').font('Helvetica-Bold').fontSize(18).text(formatearCOP(contenido.valor), 52, y + 19, { width: ancho - 24 });
    documento.font('Helvetica').fontSize(8.5).fillColor('#334155').text(contenido.valorEnLetras, 52, y + 42, { width: ancho - 24 });

    // ---- Medio de pago ----
    y += 74;
    campo('Medio de pago', contenido.medioPagoEtiqueta, 40, y, ancho * 0.28);
    campo(
      'Cuenta destino',
      contenido.cuenta ? `${contenido.cuenta.banco} · ${contenido.cuenta.alias}` : contenido.medioPago === 'EFECTIVO' ? 'Efectivo (sin cuenta)' : '—',
      40 + ancho * 0.3,
      y,
      ancho * 0.4,
    );
    campo('Referencia', contenido.referencia ?? '—', 40 + ancho * 0.72, y, ancho * 0.28);
    y += 34;
    documento.font('Helvetica').fontSize(8).fillColor(contenido.conSoporte ? '#166534' : '#92400e').text(
      contenido.conSoporte ? 'Soporte de pago del cliente adjunto.' : 'Sin soporte de pago adjunto.',
      40,
      y,
    );

    // ---- Cuotas que cubre ----
    y += 22;
    documento.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a').text('Concepto: abono a la compra del lote', 40, y);
    y += 15;
    documento.font('Helvetica').fontSize(8.5).fillColor('#334155');
    for (const cuota of contenido.cuotasCubiertas) {
      documento.text(`${cuota.etiqueta}: ${formatearCOP(cuota.valor)} ${cuota.completa ? '(queda pagada)' : '(pago parcial)'}`, 52, y);
      y += 13;
    }

    // ---- Saldos ----
    y += 8;
    documento.moveTo(40, y).lineTo(40 + ancho, y).strokeColor('#e2e8f0').stroke();
    y += 10;
    campo('Saldo anterior', formatearCOP(contenido.saldoAnterior), 40, y, ancho * 0.3);
    campo('Este abono', formatearCOP(contenido.valor), 40 + ancho * 0.33, y, ancho * 0.3);
    campo('Saldo nuevo', formatearCOP(contenido.saldoNuevo), 40 + ancho * 0.66, y, ancho * 0.34);

    // ---- Firma ----
    y += 70;
    documento.moveTo(40, y).lineTo(40 + 200, y).strokeColor('#94a3b8').lineWidth(0.8).stroke();
    documento.font('Helvetica').fontSize(8).fillColor('#475569').text('Recibido por', 40, y + 4);
    documento.font('Helvetica-Bold').fontSize(9.5).fillColor('#0f172a').text(contenido.recibidoPor, 40, y + 15, { width: 220 });

    // Pie de página: se escribe al borde inferior, así que se quita el margen para que pdfkit no abra una segunda hoja.
    documento.page.margins.bottom = 0

    // ---- Texto legal ----
    if (empresa.textoLegal) {
      documento.font('Helvetica').fontSize(7.5).fillColor('#64748b').text(empresa.textoLegal, 40, 760, { width: ancho, align: 'center' });
    }
    documento.font('Helvetica').fontSize(7).fillColor('#94a3b8').text(
      `Emitido el ${FORMATO_FECHA_HORA.format(new Date(contenido.fechaEmision))}`,
      40,
      800,
      { width: ancho, align: 'center' },
    );

    // ---- Anulación: marca de agua y datos ----
    if (opciones.anulacion) {
      const { anulacion } = opciones;
      documento.save();
      documento.fillColor('#dc2626').fillOpacity(0.16).font('Helvetica-Bold').fontSize(96);
      documento.rotate(-35, { origin: [documento.page.width / 2, documento.page.height / 2] });
      documento.text('ANULADO', 40, documento.page.height / 2 - 60, { width: ancho, align: 'center', lineBreak: false });
      documento.restore();

      documento.roundedRect(40, 696, ancho, 52, 5).fillAndStroke('#fef2f2', '#fca5a5');
      documento.fillColor('#991b1b').font('Helvetica-Bold').fontSize(9).text('RECIBO ANULADO', 52, 703);
      documento.font('Helvetica').fontSize(8).fillColor('#7f1d1d').text(
        `Anulado el ${FORMATO_FECHA_HORA.format(anulacion.fecha)} por ${anulacion.usuario}. Motivo: ${anulacion.motivo}`,
        52,
        717,
        { width: ancho - 24 },
      );
    }

    documento.end();
  });
}
