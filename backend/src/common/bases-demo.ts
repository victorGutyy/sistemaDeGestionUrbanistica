// Nombres y direcciones de las bases de datos derivadas (demostración y volumen). Funciones puras: se prueban sin
// base de datos. La base derivada se calcula SIEMPRE a partir de DATABASE_URL (la de desarrollo) agregando un sufijo,
// así nunca se escribe por error en la base principal.

export type ModoBase = 'demo' | 'volumen';

export const SUFIJOS_BASE: Record<ModoBase, string> = { demo: '_demo', volumen: '_volumen' };

const NOMBRE_VALIDO = /^[a-z][a-z0-9_]*$/;

export function nombreDeLaBase(urlConexion: string): string {
  const nombre = decodeURIComponent(new URL(urlConexion).pathname.replace(/^\//, ''));
  if (!NOMBRE_VALIDO.test(nombre)) {
    throw new Error(`El nombre de la base de datos "${nombre}" no es válido: usa minúsculas, números y guion bajo`);
  }
  return nombre;
}

export function esBaseDerivada(nombre: string): boolean {
  return Object.values(SUFIJOS_BASE).some((sufijo) => nombre.endsWith(sufijo));
}

// La misma conexión (usuario, clave, servidor y puerto) apuntando a otra base.
export function conOtraBase(urlConexion: string, nombre: string): string {
  const url = new URL(urlConexion);
  url.pathname = `/${nombre}`;
  return url.toString();
}

export interface BaseDerivada {
  nombre: string;
  url: string;
  // Conexión a la base de mantenimiento ("postgres"), desde donde se crea o se elimina la derivada.
  urlMantenimiento: string;
  nombreOriginal: string;
}

export function baseDerivada(urlConexion: string, modo: ModoBase): BaseDerivada {
  const nombreOriginal = nombreDeLaBase(urlConexion);
  if (esBaseDerivada(nombreOriginal)) {
    throw new Error(`DATABASE_URL ya apunta a una base derivada (${nombreOriginal}): usa la de desarrollo para calcular el nombre`);
  }
  const nombre = `${nombreOriginal}${SUFIJOS_BASE[modo]}`;
  return { nombre, url: conOtraBase(urlConexion, nombre), urlMantenimiento: conOtraBase(urlConexion, 'postgres'), nombreOriginal };
}

// Solo una base derivada se puede eliminar y recrear con --reiniciar: la de desarrollo jamás.
export function exigirBaseDerivadaParaReiniciar(nombre: string): void {
  if (!esBaseDerivada(nombre)) {
    throw new Error(`"${nombre}" no es una base de demostración o de volumen: no se reinicia`);
  }
}

export function parseModo(valor: string | undefined): ModoBase {
  if (valor === 'demo' || valor === 'volumen') return valor;
  throw new Error('Indica la base con --base demo o --base volumen');
}
