import { createHash, randomBytes } from 'node:crypto';

// El token de recuperación (RF-USR-06) es una clave aleatoria de 256 bits que viaja por correo. En la base de datos
// solo se guarda su huella SHA-256: quien viera la base no podría usar ningún enlace.

// 32 bytes en base64url son siempre 43 caracteres.
export const FORMATO_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function generarToken(): { token: string; huella: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, huella: huellaDeToken(token) };
}

export function huellaDeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// El enlace que se manda por correo. La dirección base es la del sitio (FRONTEND_URL, que hay que fijar al desplegar).
export function enlaceDeRecuperacion(urlBase: string, token: string): string {
  return `${urlBase.replace(/\/+$/, '')}/restablecer?token=${encodeURIComponent(token)}`;
}
