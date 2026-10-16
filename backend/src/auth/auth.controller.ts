import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { CurrentUsuario } from './current-usuario.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import { Public } from './public.decorator.js';
import { SoloSesion } from './roles.decorator.js';
import type { UsuarioAutenticado } from './usuario-autenticado.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // El frontend lo usa para validar el token guardado al recargar la página.
  @SoloSesion()
  @Get('me')
  perfil(@CurrentUsuario() usuario: UsuarioAutenticado) {
    return usuario;
  }
}
