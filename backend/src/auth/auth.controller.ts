import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { CurrentUsuario } from './current-usuario.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import { RestablecerConTokenDto, SolicitarRecuperacionDto } from './dto/recuperacion.dto.js';
import { Public } from './public.decorator.js';
import { RecuperacionService } from './recuperacion.service.js';
import { SoloSesion } from './roles.decorator.js';
import type { UsuarioAutenticado } from './usuario-autenticado.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly recuperacionService: RecuperacionService,
  ) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // Recuperación de contraseña por correo (RF-USR-06). Responde siempre lo mismo, exista o no el correo.
  @Public()
  @HttpCode(200)
  @Post('recuperar')
  async recuperar(@Body() dto: SolicitarRecuperacionDto) {
    await this.recuperacionService.solicitar(dto.email);
    return { mensaje: 'Si el correo está registrado, te enviamos un enlace para elegir una contraseña nueva.' };
  }

  @Public()
  @HttpCode(200)
  @Post('restablecer')
  async restablecer(@Body() dto: RestablecerConTokenDto) {
    await this.recuperacionService.restablecer(dto.token, dto.password);
    return { mensaje: 'Contraseña cambiada. Ya puedes ingresar con la nueva.' };
  }

  // El frontend lo usa para validar el token guardado al recargar la página.
  @SoloSesion()
  @Get('me')
  perfil(@CurrentUsuario() usuario: UsuarioAutenticado) {
    return usuario;
  }
}
