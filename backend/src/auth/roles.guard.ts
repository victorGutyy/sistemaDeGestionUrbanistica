import { ForbiddenException, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { ALCANCE_TOTAL_KEY, PERMISOS_KEY, SOLO_SESION_KEY } from './roles.decorator.js';
import type { UsuarioAutenticado } from './usuario-autenticado.js';

// Guard global (ver AppModule), corre después de JwtAuthGuard.
//
// Reglas, en orden:
// - Ruta @Public(): pasa sin más.
// - Ruta @SoloSesion(): pasa con cualquier sesión válida.
// - Ruta con @Permiso(...): el rol del usuario debe tener todos esos permisos y,
//   si además lleva @SoloAlcanceTotal(), el usuario no puede estar limitado por proyecto.
// - Cualquier otra ruta: se rechaza (cerrado por defecto).
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const destinos = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, destinos)) return true;
    if (this.reflector.getAllAndOverride<boolean>(SOLO_SESION_KEY, destinos)) return true;

    const requeridos = this.reflector.getAllAndOverride<string[]>(PERMISOS_KEY, destinos);
    if (!requeridos || requeridos.length === 0) {
      throw new ForbiddenException('Esta ruta no tiene un permiso asignado');
    }

    const usuario: UsuarioAutenticado = context.switchToHttp().getRequest().user;

    // Datos que no pertenecen a ningún proyecto: no son para usuarios con alcance restringido.
    if (usuario.proyectoIds !== null && this.reflector.getAllAndOverride<boolean>(ALCANCE_TOTAL_KEY, destinos)) {
      throw new ForbiddenException('Tu acceso está limitado a ciertos proyectos: no puedes usar esta sección');
    }

    if (!requeridos.every((permiso) => usuario.permisos.includes(permiso))) {
      throw new ForbiddenException('No tienes permiso para realizar esta acción');
    }
    return true;
  }
}
