import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { ArchivoGuardado, StorageService } from './storage.service.js';

// "uploads/" vive fuera de src/ (es contenido que se genera en tiempo de
// ejecución, no código fuente) y fuera de dist/ (no se debe borrar al
// reconstruir el proyecto).
const DIRECTORIO_BASE = join(process.cwd(), 'uploads');

@Injectable()
export class LocalStorageService implements StorageService {
  async guardar(carpeta: string, nombreOriginal: string, buffer: Buffer): Promise<ArchivoGuardado> {
    // Solo nos quedamos con la extensión del nombre original: el nombre de
    // archivo real es un UUID, así que un nombre malicioso (con "../" o
    // separadores de ruta) nunca llega a formar parte de la ruta en disco.
    const extension = extname(nombreOriginal).toLowerCase();
    const nombreArchivo = `${randomUUID()}${extension}`;
    const rutaRelativa = `${carpeta}/${nombreArchivo}`;

    await mkdir(join(DIRECTORIO_BASE, carpeta), { recursive: true });
    await writeFile(join(DIRECTORIO_BASE, carpeta, nombreArchivo), buffer);

    return { rutaRelativa };
  }

  leer(rutaRelativa: string): Promise<Buffer> {
    const segmentos = rutaRelativa.split('/');
    return readFile(join(DIRECTORIO_BASE, ...segmentos));
  }
}
