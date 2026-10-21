import 'dotenv/config';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { baseDerivada, type BaseDerivada, type ModoBase } from '../../src/common/bases-demo.js';

// Carpeta (fuera de Git) con lo propio de las bases derivadas: credenciales de los usuarios de la demostración y los
// archivos que se suban mientras se prueba. Así la demostración nunca mezcla archivos con los de desarrollo.
// Se calcula al cargar (antes de cambiar de carpeta): los scripts se corren siempre desde backend/.
export const CARPETA_DEMO = join(process.cwd(), '.demo');

export const carpetaDe = (modo: ModoBase): string => join(CARPETA_DEMO, modo);

export function baseDeEntorno(modo: ModoBase): BaseDerivada {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL en backend/.env');
  return baseDerivada(url, modo);
}

// Apunta el proceso a la base derivada y le quita lo que podría tocar el mundo real: el correo (los recordatorios
// diarios no deben escribirle a nadie, aunque sean direcciones inventadas) y los archivos de desarrollo.
export function aislarProceso(modo: ModoBase, base: BaseDerivada): void {
  process.env.DATABASE_URL = base.url;
  // Excepción para probar el envío de correos de punta a punta: DEMO_SMTP_LOCAL="127.0.0.1:2525" apunta a un servidor de
  // prueba en este mismo equipo que solo recibe (nada sale a internet). Cualquier otro valor se ignora: la demostración
  // nunca debe poder escribirle a una dirección de verdad.
  const local = process.env.DEMO_SMTP_LOCAL ?? '';
  if (/^(127\.0\.0\.1|localhost):\d{2,5}$/.test(local)) {
    const [host, puerto] = local.split(':');
    process.env.SMTP_HOST = host;
    process.env.SMTP_PORT = puerto;
    process.env.SMTP_USER = 'demo';
    process.env.SMTP_PASS = 'demo';
    process.env.SMTP_FROM = 'avisos@demo.test';
  } else {
    process.env.SMTP_HOST = '';
    process.env.SMTP_USER = '';
    process.env.SMTP_PASS = '';
    process.env.SMTP_FROM = '';
  }
  const carpeta = carpetaDe(modo);
  mkdirSync(join(carpeta, 'uploads'), { recursive: true });
  // El almacenamiento local guarda en <carpeta de trabajo>/uploads.
  process.chdir(carpeta);
}
