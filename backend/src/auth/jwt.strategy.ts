import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JWT_SECRET } from './jwt-secret.js';
import type { UsuarioAutenticado } from './usuario-autenticado.js';

// El payload que firmamos en AuthService.login().
interface JwtPayload {
  sub: string;
  email: string;
  nombre: string;
  rol: UsuarioAutenticado['rol'];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: JWT_SECRET,
    });
  }

  // El valor de retorno queda disponible como request.user.
  validate(payload: JwtPayload): UsuarioAutenticado {
    return { id: payload.sub, email: payload.email, nombre: payload.nombre, rol: payload.rol };
  }
}
