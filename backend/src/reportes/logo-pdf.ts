import { detectarTipoDocumento } from '../common/tipo-archivo.js';
import type { StorageService } from '../storage/storage.service.js';

// El logo de la empresa para el encabezado de un PDF. pdfkit solo dibuja PNG y JPG: un WebP, o un logo que ya no se puede
// leer, se omite sin impedir que el PDF salga.
export async function leerLogoParaPdf(storage: StorageService, logoRuta: string | null): Promise<Buffer | undefined> {
  if (!logoRuta) return undefined;
  try {
    const buffer = await storage.leer(logoRuta);
    const tipo = detectarTipoDocumento(buffer);
    return tipo === 'png' || tipo === 'jpg' ? buffer : undefined;
  } catch {
    return undefined;
  }
}
