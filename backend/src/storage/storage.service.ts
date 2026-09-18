export interface ArchivoGuardado {
  rutaRelativa: string;
}

// Abstracción para no acoplar el resto del código al filesystem local: el
// día que esto se mueva a almacenamiento en la nube (S3, etc.), solo hay
// que escribir una nueva implementación de esta clase y cambiar el
// "provide" en storage.module.ts — nada más se toca.
export abstract class StorageService {
  abstract guardar(carpeta: string, nombreOriginal: string, buffer: Buffer): Promise<ArchivoGuardado>;
  abstract leer(rutaRelativa: string): Promise<Buffer>;
}
