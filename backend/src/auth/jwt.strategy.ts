import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { EstadoUsuario } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { JWT_SECRET } from './jwt-secret.js';
import type { UsuarioAutenticado } from './usuario-autenticado.js';

// El payload que firmamos en AuthService.login(). Solo lleva el id: todo lo
// demás (rol, permisos, estado) se lee de la base en cada petición.
interface JwtPayload {
  sub: string;
  iat?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: JWT_SECRET,
    });
  }

  // El valor de retorno queda disponible como request.user.
  async validate(payload: JwtPayload): Promise<UsuarioAutenticado> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: payload.sub },
      include: { rol: true, proyectosPermitidos: { select: { proyectoId: true } } },
    });

    // Usuario desactivado, rol desactivado o sesión anterior a un
    // restablecimiento de contraseña: el token deja de servir aunque no haya vencido.
    const sesionRevocada =
      usuario?.sesionesValidasDesde != null &&
      (payload.iat ?? 0) < Math.floor(usuario.sesionesValidasDesde.getTime() / 1000);
    if (!usuario || usuario.estado === EstadoUsuario.INACTIVO || !usuario.rol.activo || sesionRevocada) {
      throw new UnauthorizedException();
    }

    return {
      id: usuario.id,
      email: usuario.email,
      nombre: usuario.nombre,
      rol: { id: usuario.rol.id, clave: usuario.rol.clave, nombre: usuario.rol.nombre },
      permisos: usuario.rol.permisos,
      proyectoIds: usuario.todosLosProyectos ? null : usuario.proyectosPermitidos.map((p) => p.proyectoId),
    };
  }
}
