import { nombreDeLaBase } from './bases-demo.js';

// Candados de la limpieza de una base de datos (`npm run db:limpiar`). Función pura: se prueba sin base de datos.
// La limpieza borra TODOS los datos (también la configuración y los usuarios) y deja la base como una instalación
// nueva, así que solo corre cuando se cumplen todas estas condiciones a la vez.

export const MINUTOS_MAXIMOS_DEL_RESPALDO = 30;
export const MARCA_DEL_RESPALDO = '_pre_limpieza';
const SERVIDORES_LOCALES = ['localhost', '127.0.0.1', '[::1]', '::1'];

export interface EntornoLimpieza {
  nodeEnv?: string;
  databaseUrl: string;
  // Lo que escribió quien limpia en CONFIRMO_LIMPIAR: debe ser el nombre exacto de la base.
  confirmacion?: string;
  // Archivos de la carpeta de respaldos y cuándo se modificaron.
  respaldos: { nombre: string; modificadoEn: Date }[];
  ahora: Date;
}

export function validarLimpieza(entorno: EntornoLimpieza): { nombreBase: string; servidor: string } {
  if (entorno.nodeEnv === 'production') {
    throw new Error('La limpieza no corre con NODE_ENV=production');
  }

  const url = new URL(entorno.databaseUrl);
  if (!SERVIDORES_LOCALES.includes(url.hostname)) {
    throw new Error(`La limpieza solo corre contra una base local (localhost); DATABASE_URL apunta a "${url.hostname}"`);
  }

  const nombreBase = nombreDeLaBase(entorno.databaseUrl);
  if (entorno.confirmacion !== nombreBase) {
    throw new Error(`Para limpiar "${nombreBase}" escribe su nombre exacto en la variable CONFIRMO_LIMPIAR`);
  }

  const limite = entorno.ahora.getTime() - MINUTOS_MAXIMOS_DEL_RESPALDO * 60_000;
  const hayRespaldoReciente = entorno.respaldos.some(
    (respaldo) => respaldo.nombre.includes(nombreBase) && respaldo.nombre.includes(MARCA_DEL_RESPALDO) && respaldo.modificadoEn.getTime() >= limite,
  );
  if (!hayRespaldoReciente) {
    throw new Error(
      `Falta un respaldo reciente: haz un pg_dump de "${nombreBase}" en backend/respaldos/ con un nombre que contenga "${nombreBase}${MARCA_DEL_RESPALDO}" (de los últimos ${MINUTOS_MAXIMOS_DEL_RESPALDO} minutos)`,
    );
  }

  return { nombreBase, servidor: url.hostname };
}
