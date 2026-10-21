import PDFDocument from 'pdfkit';
import { formatearDiaDDMMAAAA } from '../cierres-caja/periodo.js';
import { ajustarAlAncho } from '../common/pdf-texto.js';
import { textoDeGeneracion, type EmpresaParaReporte } from './generar-excel.js';
import type { ColumnaReporte, ReporteGenerado, SeccionReporte, ValorCelda } from './modelo.js';

export interface OpcionesPdfReporte {
  empresa: EmpresaParaReporte & { colorPrimario?: string };
  // Imagen del logo ya leída del almacenamiento (solo PNG o JPG).
  logo?: Buffer;
}

const colorSeguro = (color: string | undefined) => (color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#1e3a8a');

const FORMATO_MONEDA = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0, useGrouping: 'always' });
const FORMATO_ENTERO = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0, useGrouping: 'always' });

// Un valor tal como se ve en el papel: dinero $1.234.567 (un negativo -$680.000), fechas dd/mm/aaaa.
export function textoDeCelda(columna: ColumnaReporte, valor: ValorCelda): string {
  if (valor === null || valor === undefined || valor === '') return '';
  if (columna.tipo === 'pesos') {
    const numero = Number(valor);
    if (!Number.isFinite(numero)) return String(valor);
    return `${numero < 0 ? '-' : ''}$${FORMATO_MONEDA.format(Math.abs(numero))}`;
  }
  if (columna.tipo === 'entero') {
    const numero = Number(valor);
    return Number.isFinite(numero) ? FORMATO_ENTERO.format(numero) : String(valor);
  }
  if (columna.tipo === 'fecha' && /^\d{4}-\d{2}-\d{2}$/.test(String(valor))) return formatearDiaDDMMAAAA(String(valor));
  return String(valor);
}

const esNumerica = (columna: ColumnaReporte) => columna.tipo === 'pesos' || columna.tipo === 'entero';

// Reporte en PDF (RF-REP-10): encabezado con el logo y la empresa, los filtros aplicados y cada sección como tabla, con
// el encabezado de la tabla repetido en cada hoja y la numeración de páginas. Horizontal si alguna tabla es ancha.
export function generarPdfReporte(reporte: ReporteGenerado, opciones: OpcionesPdfReporte): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ancha = reporte.secciones.some((seccion) => seccion.columnas.length > 6);
    const documento = new PDFDocument({ size: 'A4', layout: ancha ? 'landscape' : 'portrait', margin: 36, bufferPages: true, info: { Title: reporte.titulo } });
    const trozos: Buffer[] = [];
    documento.on('data', (trozo: Buffer) => trozos.push(trozo));
    documento.on('end', () => resolve(Buffer.concat(trozos)));
    documento.on('error', reject);

    const color = colorSeguro(opciones.empresa.colorPrimario);
    const margen = 36;
    const ancho = documento.page.width - margen * 2;
    const limiteInferior = () => documento.page.height - 48;
    const asegurarEspacio = (alto: number) => {
      if (documento.y + alto > limiteInferior()) documento.addPage();
    };

    // ---- Encabezado ----
    let xTexto = margen;
    if (opciones.logo) {
      try {
        documento.image(opciones.logo, margen, margen, { fit: [90, 54] });
        xTexto = margen + 100;
      } catch {
        // Un logo que no se pueda dibujar no debe impedir generar el reporte.
      }
    }
    documento.fillColor('#0f172a').font('Helvetica-Bold').fontSize(14).text(opciones.empresa.nombreComercial, xTexto, margen + 2, { width: ancho - (xTexto - margen) });
    documento.font('Helvetica').fontSize(9).fillColor('#475569').text(`${opciones.empresa.razonSocial} · NIT ${opciones.empresa.nit}`, xTexto, documento.y + 1, { width: ancho - (xTexto - margen) });

    documento.y = Math.max(documento.y, margen + 58) + 6;
    documento.font('Helvetica-Bold').fontSize(16).fillColor(color).text(reporte.titulo, margen, documento.y, { width: ancho });
    documento.font('Helvetica').fontSize(9).fillColor('#475569').text(reporte.descripcion, margen, documento.y + 2, { width: ancho });
    documento.moveDown(0.4);
    if (reporte.filtros.length === 0) {
      documento.font('Helvetica').fontSize(9).fillColor('#0f172a').text('Sin filtros: todo lo registrado.', margen, documento.y, { width: ancho });
    }
    for (const filtro of reporte.filtros) {
      documento
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#0f172a')
        .text(`${filtro.etiqueta}: `, margen, documento.y, { continued: true, width: ancho })
        .font('Helvetica')
        .text(filtro.valor);
    }
    documento.font('Helvetica').fontSize(8).fillColor('#64748b').text(textoDeGeneracion(reporte.generadoEn), margen, documento.y + 2, { width: ancho });
    documento.moveDown(0.6);

    // ---- Secciones ----
    const dibujarSeccion = (seccion: SeccionReporte) => {
      asegurarEspacio(70);
      documento.font('Helvetica-Bold').fontSize(11).fillColor(color).text(seccion.titulo.toUpperCase(), margen, documento.y, { width: ancho });
      documento.moveTo(margen, documento.y + 1).lineTo(margen + ancho, documento.y + 1).strokeColor('#e2e8f0').lineWidth(1).stroke();
      documento.moveDown(0.4);
      if (seccion.nota) documento.font('Helvetica-Oblique').fontSize(8).fillColor('#475569').text(seccion.nota, margen, documento.y, { width: ancho });
      if (seccion.filasTotales) {
        documento
          .font('Helvetica-Oblique')
          .fontSize(8)
          .fillColor('#92400e')
          .text(`Se muestran las primeras ${seccion.filas.length} de ${seccion.filasTotales} filas. Afina los filtros o exporta a Excel para ver el resto.`, margen, documento.y + 1, { width: ancho });
      }
      documento.moveDown(0.3);

      const suma = seccion.columnas.reduce((total, columna) => total + (columna.peso ?? 1), 0);
      const anchos = seccion.columnas.map((columna) => (ancho * (columna.peso ?? 1)) / suma);
      const tamano = seccion.columnas.length > 8 ? 7.5 : 8.5;
      const altoFila = tamano + 6;

      const fila = (celdas: string[], opcionesFila: { negrita?: boolean; fondo?: string; colorTexto?: string; linea?: boolean }) => {
        const y = documento.y;
        if (opcionesFila.fondo) documento.rect(margen, y - 2, ancho, altoFila).fill(opcionesFila.fondo);
        if (opcionesFila.linea) documento.moveTo(margen, y - 2).lineTo(margen + ancho, y - 2).strokeColor('#94a3b8').lineWidth(0.8).stroke();
        let x = margen;
        seccion.columnas.forEach((columna, indice) => {
          documento.font(opcionesFila.negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(tamano).fillColor(opcionesFila.colorTexto ?? '#0f172a');
          documento.text(ajustarAlAncho(documento, celdas[indice] ?? '', anchos[indice] - 6), x + 2, y + 1, { width: anchos[indice] - 6, align: esNumerica(columna) ? 'right' : 'left', lineBreak: false });
          x += anchos[indice];
        });
        documento.y = y + altoFila;
      };
      const encabezado = () => fila(seccion.columnas.map((columna) => columna.encabezado), { negrita: true, fondo: color, colorTexto: '#ffffff' });

      encabezado();
      seccion.filas.forEach((datos, indice) => {
        if (documento.y + altoFila > limiteInferior()) {
          documento.addPage();
          encabezado();
        }
        fila(
          seccion.columnas.map((columna) => textoDeCelda(columna, datos[columna.clave] ?? null)),
          { fondo: indice % 2 === 1 ? '#f1f5f9' : undefined },
        );
      });
      if (seccion.filas.length === 0) {
        documento.font('Helvetica-Oblique').fontSize(8.5).fillColor('#64748b').text('No hay datos con estos filtros.', margen + 2, documento.y + 2, { width: ancho });
        documento.moveDown(0.6);
      }
      if (seccion.totales) {
        if (documento.y + altoFila > limiteInferior()) {
          documento.addPage();
          encabezado();
        }
        fila(seccion.columnas.map((columna) => textoDeCelda(columna, seccion.totales![columna.clave] ?? null)), { negrita: true, linea: true });
      }
      documento.moveDown(1);
    };
    for (const seccion of reporte.secciones) dibujarSeccion(seccion);

    // ---- Pie de página con la numeración ----
    const rango = documento.bufferedPageRange();
    for (let i = rango.start; i < rango.start + rango.count; i++) {
      documento.switchToPage(i);
      // El pie va dentro del margen inferior: sin esto pdfkit abriría una hoja nueva para escribirlo.
      documento.page.margins.bottom = 0;
      documento
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor('#64748b')
        .text(`${opciones.empresa.nombreComercial} · ${reporte.titulo} · Página ${i - rango.start + 1} de ${rango.count}`, margen, documento.page.height - 30, { width: ancho, align: 'center', lineBreak: false });
    }

    documento.end();
  });
}
