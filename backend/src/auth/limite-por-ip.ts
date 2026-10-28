import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

// Límite de peticiones por dirección IP en las rutas PÚBLICAS (las que no exigen sesión): iniciar sesión, pedir el
// enlace de recuperación de contraseña y restablecerla. El bloqueo por cuenta (5 intentos fallidos) ya existe en la base;
// esto cubre lo que ese bloqueo no ve: probar claves contra MUCHAS cuentas distintas desde una misma conexión, o llenar de
// correos de recuperación a otras personas.
//
// Los valores se leen del entorno EN CADA PETICIÓN (no están fijos en el código), con estos nombres:
//   LIMITE_LOGIN_PETICIONES / LIMITE_LOGIN_SEGUNDOS
//   LIMITE_RECUPERAR_PETICIONES / LIMITE_RECUPERAR_SEGUNDOS
//   LIMITE_RESTABLECER_PETICIONES / LIMITE_RESTABLECER_SEGUNDOS
// Un valor vacío, no numérico o menor que 1 se ignora y se usa el de reserva de esta tabla.
// LIMITE_POR_IP=desactivado apaga el límite (solo para las pruebas automáticas).
export type RutaLimitada = 'LOGIN' | 'RECUPERAR' | 'RESTABLECER';

export const LIMITES_DE_RESERVA: Record<RutaLimitada, { peticiones: number; segundos: number }> = {
  // Una oficina puede compartir una sola IP: 10 por minuto deja ingresar con holgura y frena a un programa que prueba claves.
  LOGIN: { peticiones: 10, segundos: 60 },
  RECUPERAR: { peticiones: 5, segundos: 3600 },
  RESTABLECER: { peticiones: 10, segundos: 3600 },
};

function enteroPositivo(valor: string | undefined): number | null {
  if (valor === undefined || valor.trim() === '') return null;
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= 1 ? numero : null;
}

export function leerLimite(ruta: RutaLimitada): { peticiones: number; segundos: number } {
  const reserva = LIMITES_DE_RESERVA[ruta];
  return {
    peticiones: enteroPositivo(process.env[`LIMITE_${ruta}_PETICIONES`]) ?? reserva.peticiones,
    segundos: enteroPositivo(process.env[`LIMITE_${ruta}_SEGUNDOS`]) ?? reserva.segundos,
  };
}

// Se usa junto con @UseGuards(LimitePorIpGuard). Cada ruta lleva su propio contador por IP.
export const limitarPorIp = (ruta: RutaLimitada) =>
  Throttle({
    default: {
      limit: () => leerLimite(ruta).peticiones,
      ttl: () => leerLimite(ruta).segundos * 1000,
    },
  });

@Injectable()
export class LimitePorIpGuard extends ThrottlerGuard {
  protected override shouldSkip(_contexto: ExecutionContext): Promise<boolean> {
    return Promise.resolve(process.env.LIMITE_POR_IP === 'desactivado');
  }

  // El mensaje sale en español y se muestra tal cual en la pantalla de ingreso. La cabecera Retry-After ya la pone la clase base.
  protected override throwThrottlingException(): Promise<void> {
    throw new HttpException(
      { statusCode: HttpStatus.TOO_MANY_REQUESTS, message: 'Demasiados intentos desde esta conexión. Espera unos minutos y vuelve a intentarlo.' },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
