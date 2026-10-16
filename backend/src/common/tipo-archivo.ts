export type TipoDocumento = 'pdf' | 'png' | 'jpg';

export const CONTENT_TYPE_DOCUMENTO: Record<TipoDocumento, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
};

// El tipo que declara el navegador (o la extensión) lo puede falsear quien sube el archivo;
// los primeros bytes del archivo no. Solo se aceptan PDF e imágenes PNG o JPG.
export function detectarTipoDocumento(buffer: Buffer): TipoDocumento | null {
  if (buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-') return 'pdf';
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  return null;
}
