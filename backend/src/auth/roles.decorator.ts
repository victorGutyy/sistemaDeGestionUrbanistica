import { SetMetadata } from '@nestjs/common';
import { Rol } from '../generated/prisma/enums.js';

export const ROLES_KEY = 'roles';

// Restringe una ruta a roles específicos. Sin este decorador, cualquier
// usuario autenticado puede entrar (salvo la regla de solo-lectura de
// RolesGuard para el rol CONSULTA).
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES_KEY, roles);
