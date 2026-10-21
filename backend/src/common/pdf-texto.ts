import type PDFDocument from 'pdfkit';

// pdfkit no recorta un texto largo por sí solo: aunque se le pida "sin saltos de línea", lo parte en dos renglones y el
// segundo se monta sobre la fila siguiente. Para las celdas de una tabla se mide el texto con la fuente y el tamaño
// ya elegidos y se recorta con "…" hasta que quepa en el ancho de la celda.
export function ajustarAlAncho(documento: InstanceType<typeof PDFDocument>, texto: string, ancho: number): string {
  if (documento.widthOfString(texto) <= ancho) return texto;
  let recorte = texto;
  while (recorte.length > 1 && documento.widthOfString(`${recorte}…`) > ancho) {
    recorte = recorte.slice(0, -1);
  }
  return `${recorte.trimEnd()}…`;
}
