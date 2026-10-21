import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso, SoloAlcanceTotal } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { CorreoService } from './correo.service.js';
import { EnviarPruebaDto } from './dto/enviar-prueba.dto.js';

// Estado del correo de la empresa y mensaje de prueba. Es de toda la empresa: no aplica a quien está limitado a proyectos.
@SoloAlcanceTotal()
@Controller('correo')
export class CorreoController {
  constructor(private readonly correoService: CorreoService) {}

  @Permiso(PERMISOS.CONFIGURACION_VER)
  @Get('estado')
  estado() {
    return this.correoService.estado();
  }

  @Permiso(PERMISOS.CONFIGURACION_EDITAR)
  @Post('prueba')
  enviarPrueba(@Body() dto: EnviarPruebaDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.correoService.enviarPrueba(dto.destino.trim(), usuario);
  }
}
