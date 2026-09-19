import { ForbiddenException, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Rol } from '../generated/prisma/enums.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { ROLES_KEY } from './roles.decorator.js';
import type { UsuarioAutenticado } from './usuario-autenticado.js';

// Guard global (ver AppModule), corre después de JwtAuthGuard.
//
// Reglas:
// - Ruta @Public(): pasa sin más.
// - Ruta con @Roles(...): el rol del usuario debe estar en esa lista.
// - Cualquier otra ruta: el rol CONSULTA solo puede hacer GET (solo
//   lectura en toda la app); propietario y administrador pasan siempre.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const esPublica = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (esPublica) return true;

    const rolesPermitidos = this.reflector.getAllAndOverride<Rol[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const usuario: UsuarioAutenticado = request.user;

    if (rolesPermitidos && rolesPermitidos.length > 0) {
      if (!rolesPermitidos.includes(usuario.rol)) {
        throw new ForbiddenException('No tienes permiso para realizar esta acción');
      }
      return true;
    }

    if (usuario.rol === Rol.CONSULTA && request.method !== 'GET') {
      throw new ForbiddenException('Tu rol solo tiene acceso de lectura');
    }

    return true;
  }
}
