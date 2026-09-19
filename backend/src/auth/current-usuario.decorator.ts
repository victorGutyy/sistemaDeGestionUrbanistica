import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { UsuarioAutenticado } from './usuario-autenticado.js';

// Atajo para leer request.user en un controller: @CurrentUsuario() usuario: UsuarioAutenticado
export const CurrentUsuario = createParamDecorator((_data: unknown, ctx: ExecutionContext): UsuarioAutenticado => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
