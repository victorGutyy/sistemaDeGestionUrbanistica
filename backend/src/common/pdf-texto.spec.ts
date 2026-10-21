import PDFDocument from 'pdfkit';
import { describe, expect, it } from 'vitest';
import { ajustarAlAncho } from './pdf-texto.js';

describe('ajustarAlAncho', () => {
  const documento = new PDFDocument();
  documento.font('Helvetica').fontSize(8.5);

  it('deja intacto un texto que cabe', () => {
    expect(ajustarAlAncho(documento, 'Efectivo', 200)).toBe('Efectivo');
  });

  it('recorta con puntos suspensivos un texto que no cabe, y el resultado sí cabe', () => {
    const largo = 'Davivienda ahorros (demostración) con un nombre larguísimo';
    const ajustado = ajustarAlAncho(documento, largo, 90);
    expect(ajustado.endsWith('…')).toBe(true);
    expect(ajustado.length).toBeLessThan(largo.length);
    expect(documento.widthOfString(ajustado)).toBeLessThanOrEqual(90);
  });

  it('con un ancho diminuto no se queda en un ciclo', () => {
    expect(ajustarAlAncho(documento, 'Texto', 1)).toBe('T…');
  });
});
