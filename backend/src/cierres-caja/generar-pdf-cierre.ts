import PDFDocument from 'pdfkit';
import { ETIQUETA_MEDIO_PAGO } from '../common/medio-pago.js';
import { ajustarAlAncho } from '../common/pdf-texto.js';
import { formatearCOP } from '../common/formato.util.js';
import type { MedioPago } from '../generated/prisma/enums.js';
import type { ResultadoCierre } from './calcular-cierre.js';
import { formatearDiaDDMMAAAA } from './periodo.js';

export interface EmpresaPdfCierre {
  nombreComercial: string;
  razonSocial: string;
  nit: string;
  direccion: string | null;
  telefonos: string | null;
  correo: string | null;
  colorPrimario: string;
}

export interface DatosPdfCierre {
  numeroTexto: string | null;
  tipo: 'DIARIO' | 'SEMANAL' | 'QUINCENAL';
  desde: string;
  hasta: string;
  estado: 'BORRADOR' | 'CERRADO' | 'APROBADO' | 'DEVUELTO';
  creadoPor: string | null;
  cerradoPor: string | null;
  cerradoEn: Date | null;
  resueltoPor: string | null;
  resueltoEn: Date | null;
  observacionGerente: string | null;
  efectivoContado: string | null;
  diferencia: string | null;
  explicacionDiferencia: string | null;
  resumen: ResultadoCierre;
}

export interface OpcionesPdfCierre {
  empresa: EmpresaPdfCierre;
  // Imagen del logo ya leída del almacenamiento (solo PNG o JPG).
  logo?: Buffer;
  generadoEn?: Date;
}

const ETIQUETA_TIPO = { DIARIO: 'Diario', SEMANAL: 'Semanal', QUINCENAL: 'Quincenal' } as const;
const ETIQUETA_ESTADO = { BORRADOR: 'BORRADOR', CERRADO: 'CERRADO (pendiente de aprobación)', APROBADO: 'APROBADO', DEVUELTO: 'DEVUELTO' } as const;

const FORMATO_FECHA_HORA = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const colorSeguro = (color: string) => (/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#2563eb');
const etiquetaMedio = (medio: MedioPago) => ETIQUETA_MEDIO_PAGO[medio] ?? medio;

// PDF del cierre de caja (RF-CAJ-06). Un cierre cerrado o aprobado se dibuja desde su fotografía; un borrador o un
// devuelto, desde el cálculo en vivo, y lo dice en el encabezado para que nadie lo tome por definitivo.
export function generarPdfCierre(datos: DatosPdfCierre, opciones: OpcionesPdfCierre): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const titulo = datos.numeroTexto ? `Cierre de caja ${datos.numeroTexto}` : 'Cierre de caja (borrador)';
    const documento = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true, info: { Title: titulo } });
    const trozos: Buffer[] = [];
    documento.on('data', (trozo: Buffer) => trozos.push(trozo));
    documento.on('end', () => resolve(Buffer.concat(trozos)));
    documento.on('error', reject);

    const color = colorSeguro(opciones.empresa.colorPrimario);
    const ancho = documento.page.width - 80;
    const { resumen } = datos;
    const definitivo = datos.estado === 'CERRADO' || datos.estado === 'APROBADO';

    // Salta de hoja si lo que sigue no cabe.
    const asegurarEspacio = (alto: number) => {
      if (documento.y + alto > documento.page.height - 60) documento.addPage();
    };
    const seccion = (nombre: string) => {
      asegurarEspacio(60);
      documento.moveDown(0.8);
      documento.font('Helvetica-Bold').fontSize(10.5).fillColor(color).text(nombre.toUpperCase(), 40, documento.y);
      documento.moveTo(40, documento.y + 2).lineTo(40 + ancho, documento.y + 2).strokeColor('#e2e8f0').lineWidth(1).stroke();
      documento.moveDown(0.5);
    };
    // Una fila de tabla con columnas de ancho fijo (la última alineada a la derecha si es dinero).
    const fila = (columnas: { texto: string; ancho: number; derecha?: boolean; negrita?: boolean; color?: string }[], alto = 14) => {
      asegurarEspacio(alto + 4);
      const y = documento.y;
      let x = 40;
      for (const columna of columnas) {
        documento.font(columna.negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).fillColor(columna.color ?? '#0f172a');
        documento.text(ajustarAlAncho(documento, columna.texto, columna.ancho - 6), x, y, { width: columna.ancho - 6, align: columna.derecha ? 'right' : 'left', lineBreak: false });
        x += columna.ancho;
      }
      documento.y = y + alto;
    };

    // ---- Encabezado ----
    let xTexto = 40;
    if (opciones.logo) {
      try {
        documento.image(opciones.logo, 40, 40, { fit: [60, 60] });
        xTexto = 110;
      } catch {
        // Un logo que no se pueda dibujar no debe impedir generar el cierre.
      }
    }
    documento.fillColor('#0f172a').font('Helvetica-Bold').fontSize(15).text(opciones.empresa.nombreComercial, xTexto, 42, { width: ancho - 200 });
    documento.font('Helvetica').fontSize(9).fillColor('#475569');
    documento.text(`${opciones.empresa.razonSocial} · NIT ${opciones.empresa.nit}`, xTexto, documento.y + 1, { width: ancho - 200 });
    const contacto = [opciones.empresa.direccion, opciones.empresa.telefonos, opciones.empresa.correo].filter(Boolean).join(' · ');
    if (contacto) documento.text(contacto, xTexto, documento.y + 1, { width: ancho - 200 });

    const xCaja = documento.page.width - 40 - 180;
    documento.roundedRect(xCaja, 40, 180, 64, 6).lineWidth(1.2).strokeColor(color).stroke();
    documento.fillColor(color).font('Helvetica-Bold').fontSize(10).text('CIERRE DE CAJA', xCaja, 48, { width: 180, align: 'center' });
    documento.fillColor('#0f172a').fontSize(datos.numeroTexto ? 15 : 12).text(datos.numeroTexto ?? 'Sin número', xCaja, 63, { width: 180, align: 'center' });
    documento.font('Helvetica').fontSize(8).fillColor('#475569').text(ETIQUETA_TIPO[datos.tipo], xCaja, 86, { width: 180, align: 'center' });

    documento.y = 118;
    documento.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a').text(`Período: del ${formatearDiaDDMMAAAA(datos.desde)} al ${formatearDiaDDMMAAAA(datos.hasta)}`, 40, documento.y);
    documento.font('Helvetica-Bold').fontSize(9).fillColor(datos.estado === 'APROBADO' ? '#166534' : datos.estado === 'DEVUELTO' ? '#991b1b' : '#92400e').text(`Estado: ${ETIQUETA_ESTADO[datos.estado]}`, 40, documento.y + 2);
    if (!definitivo) {
      documento.font('Helvetica-Oblique').fontSize(8).fillColor('#92400e').text(
        'Documento no definitivo: los valores se calculan con lo registrado hasta este momento y pueden cambiar hasta que el cierre se cierre.',
        40,
        documento.y + 2,
        { width: ancho },
      );
    }

    // ---- Efectivo ----
    seccion('Efectivo de la caja');
    const col = [{ ancho: ancho * 0.7 }, { ancho: ancho * 0.3 }];
    fila([{ texto: 'Efectivo inicial', ancho: col[0].ancho }, { texto: formatearCOP(resumen.efectivo.inicial), ancho: col[1].ancho, derecha: true }]);
    fila([{ texto: '+ Entradas en efectivo', ancho: col[0].ancho }, { texto: formatearCOP(resumen.efectivo.entradas), ancho: col[1].ancho, derecha: true }]);
    fila([{ texto: '− Salidas en efectivo', ancho: col[0].ancho }, { texto: formatearCOP(resumen.efectivo.salidas), ancho: col[1].ancho, derecha: true }]);
    fila([{ texto: 'Efectivo esperado', ancho: col[0].ancho, negrita: true }, { texto: formatearCOP(resumen.efectivo.esperado), ancho: col[1].ancho, derecha: true, negrita: true }]);
    if (datos.efectivoContado !== null && datos.diferencia !== null) {
      fila([{ texto: 'Efectivo contado', ancho: col[0].ancho, negrita: true }, { texto: formatearCOP(datos.efectivoContado), ancho: col[1].ancho, derecha: true, negrita: true }]);
      const hayDiferencia = Number(datos.diferencia) !== 0;
      fila([
        { texto: 'Diferencia (contado − esperado)', ancho: col[0].ancho, negrita: true, color: hayDiferencia ? '#991b1b' : '#166534' },
        { texto: formatearCOP(datos.diferencia), ancho: col[1].ancho, derecha: true, negrita: true, color: hayDiferencia ? '#991b1b' : '#166534' },
      ]);
      if (datos.explicacionDiferencia) {
        documento.font('Helvetica-Oblique').fontSize(8.5).fillColor('#334155').text(`Explicación: ${datos.explicacionDiferencia}`, 40, documento.y + 2, { width: ancho });
        documento.moveDown(0.3);
      }
    } else {
      documento.font('Helvetica-Oblique').fontSize(8.5).fillColor('#64748b').text('El efectivo contado se registra al cerrar la caja.', 40, documento.y + 2);
      documento.moveDown(0.3);
    }

    // ---- Totales ----
    seccion('Totales del período');
    const c3 = [{ ancho: ancho * 0.4 }, { ancho: ancho * 0.3 }, { ancho: ancho * 0.3 }];
    fila([{ texto: '', ancho: c3[0].ancho }, { texto: 'Entradas', ancho: c3[1].ancho, derecha: true, negrita: true }, { texto: 'Salidas', ancho: c3[2].ancho, derecha: true, negrita: true }]);
    fila([{ texto: 'Registrado', ancho: c3[0].ancho }, { texto: formatearCOP(resumen.totales.entradasBrutas), ancho: c3[1].ancho, derecha: true }, { texto: formatearCOP(resumen.totales.salidasBrutas), ancho: c3[2].ancho, derecha: true }]);
    fila([{ texto: 'Anulaciones (reversas)', ancho: c3[0].ancho }, { texto: formatearCOP(resumen.totales.reversasEntradas), ancho: c3[1].ancho, derecha: true }, { texto: formatearCOP(resumen.totales.reversasSalidas), ancho: c3[2].ancho, derecha: true }]);
    fila([{ texto: 'Neto', ancho: c3[0].ancho, negrita: true }, { texto: formatearCOP(resumen.totales.entradas), ancho: c3[1].ancho, derecha: true, negrita: true }, { texto: formatearCOP(resumen.totales.salidas), ancho: c3[2].ancho, derecha: true, negrita: true }]);
    fila([{ texto: 'Movimiento neto del período (entradas − salidas)', ancho: ancho * 0.7, negrita: true }, { texto: formatearCOP(resumen.totales.neto), ancho: ancho * 0.3, derecha: true, negrita: true }]);

    // ---- Por medio de pago y por cuenta ----
    seccion('Por medio de pago');
    const cm = [{ ancho: ancho * 0.4 }, { ancho: ancho * 0.2 }, { ancho: ancho * 0.2 }, { ancho: ancho * 0.2 }];
    fila([{ texto: 'Medio', ancho: cm[0].ancho, negrita: true }, { texto: 'Entradas', ancho: cm[1].ancho, derecha: true, negrita: true }, { texto: 'Salidas', ancho: cm[2].ancho, derecha: true, negrita: true }, { texto: 'Neto', ancho: cm[3].ancho, derecha: true, negrita: true }]);
    if (resumen.porMedio.length === 0) fila([{ texto: 'Sin movimientos', ancho }]);
    for (const medio of resumen.porMedio) {
      fila([{ texto: etiquetaMedio(medio.medioPago), ancho: cm[0].ancho }, { texto: formatearCOP(medio.entradas), ancho: cm[1].ancho, derecha: true }, { texto: formatearCOP(medio.salidas), ancho: cm[2].ancho, derecha: true }, { texto: formatearCOP(medio.neto), ancho: cm[3].ancho, derecha: true }]);
    }

    seccion('Por cuenta');
    fila([{ texto: 'Cuenta', ancho: cm[0].ancho, negrita: true }, { texto: 'Entradas', ancho: cm[1].ancho, derecha: true, negrita: true }, { texto: 'Salidas', ancho: cm[2].ancho, derecha: true, negrita: true }, { texto: 'Neto', ancho: cm[3].ancho, derecha: true, negrita: true }]);
    if (resumen.porCuenta.length === 0) fila([{ texto: 'Sin movimientos', ancho }]);
    for (const cuenta of resumen.porCuenta) {
      fila([{ texto: cuenta.nombre, ancho: cm[0].ancho }, { texto: formatearCOP(cuenta.entradas), ancho: cm[1].ancho, derecha: true }, { texto: formatearCOP(cuenta.salidas), ancho: cm[2].ancho, derecha: true }, { texto: formatearCOP(cuenta.neto), ancho: cm[3].ancho, derecha: true }]);
    }

    // ---- Movimientos ----
    seccion(`Movimientos del período (${resumen.eventos.length})`);
    const ce = [{ ancho: ancho * 0.11 }, { ancho: ancho * 0.1 }, { ancho: ancho * 0.45 }, { ancho: ancho * 0.12 }, { ancho: ancho * 0.22 }];
    const encabezadoMovimientos = () =>
      fila([
        { texto: 'Fecha', ancho: ce[0].ancho, negrita: true },
        { texto: 'Tipo', ancho: ce[1].ancho, negrita: true },
        { texto: 'Descripción', ancho: ce[2].ancho, negrita: true },
        { texto: 'Medio', ancho: ce[3].ancho, negrita: true },
        { texto: 'Valor', ancho: ce[4].ancho, derecha: true, negrita: true },
      ]);
    encabezadoMovimientos();
    if (resumen.eventos.length === 0) fila([{ texto: 'Sin movimientos en este período', ancho }]);
    for (const evento of resumen.eventos) {
      const esEntrada = evento.sentido === 'ENTRADA';
      const reversa = evento.clase === 'ANULACION';
      // Una reversa se escribe con signo contrario al de su entrada o salida.
      const signo = esEntrada === !reversa ? '+' : '−';
      fila([
        { texto: formatearDiaDDMMAAAA(evento.fecha), ancho: ce[0].ancho },
        { texto: reversa ? 'Anulación' : esEntrada ? 'Entrada' : 'Salida', ancho: ce[1].ancho, color: reversa ? '#991b1b' : undefined },
        { texto: evento.descripcion + (evento.detalle ? ` (${evento.detalle})` : ''), ancho: ce[2].ancho },
        { texto: etiquetaMedio(evento.medioPago), ancho: ce[3].ancho },
        { texto: `${signo}${formatearCOP(evento.valor)}`, ancho: ce[4].ancho, derecha: true, color: signo === '+' ? '#166534' : '#991b1b' },
      ]);
    }

    // ---- Firmas y datos del flujo ----
    asegurarEspacio(130);
    documento.moveDown(1.5);
    const yFirma = documento.y + 30;
    documento.moveTo(40, yFirma).lineTo(240, yFirma).strokeColor('#94a3b8').lineWidth(0.8).stroke();
    documento.moveTo(320, yFirma).lineTo(520, yFirma).stroke();
    documento.font('Helvetica').fontSize(8).fillColor('#475569').text('Elaboró (administrador)', 40, yFirma + 4);
    documento.text('Aprobó (gerente)', 320, yFirma + 4);
    documento.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a');
    documento.text(datos.cerradoPor ?? datos.creadoPor ?? '', 40, yFirma + 15, { width: 200 });
    documento.text(datos.estado === 'APROBADO' ? (datos.resueltoPor ?? '') : '', 320, yFirma + 15, { width: 200 });
    documento.font('Helvetica').fontSize(8).fillColor('#64748b');
    if (datos.cerradoEn) documento.text(`Cerrado el ${FORMATO_FECHA_HORA.format(datos.cerradoEn)}`, 40, yFirma + 28, { width: 200 });
    if (datos.estado === 'APROBADO' && datos.resueltoEn) documento.text(`Aprobado el ${FORMATO_FECHA_HORA.format(datos.resueltoEn)}`, 320, yFirma + 28, { width: 200 });
    documento.y = yFirma + 48;
    if (datos.estado === 'DEVUELTO' && datos.observacionGerente) {
      documento.font('Helvetica-Bold').fontSize(8.5).fillColor('#991b1b').text(`Devuelto por ${datos.resueltoPor ?? 'el gerente'}: ${datos.observacionGerente}`, 40, documento.y, { width: ancho });
    } else if (datos.estado === 'APROBADO' && datos.observacionGerente) {
      documento.font('Helvetica-Oblique').fontSize(8.5).fillColor('#334155').text(`Observación del gerente: ${datos.observacionGerente}`, 40, documento.y, { width: ancho });
    }

    // Pie de cada hoja con la numeración de páginas.
    const rango = documento.bufferedPageRange();
    for (let i = rango.start; i < rango.start + rango.count; i += 1) {
      documento.switchToPage(i);
      documento.page.margins.bottom = 0;
      documento
        .font('Helvetica')
        .fontSize(7)
        .fillColor('#94a3b8')
        .text(
          `${titulo} · Generado el ${FORMATO_FECHA_HORA.format(opciones.generadoEn ?? new Date())} · Hoja ${i + 1} de ${rango.count}`,
          40,
          documento.page.height - 30,
          { width: ancho, align: 'center', lineBreak: false },
        );
    }

    documento.end();
  });
}
