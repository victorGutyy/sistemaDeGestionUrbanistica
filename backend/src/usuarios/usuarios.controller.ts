import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso, SoloAlcanceTotal } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { ActualizarEstadoUsuarioDto } from './dto/actualizar-estado-usuario.dto.js';
import { ActualizarUsuarioDto } from './dto/actualizar-usuario.dto.js';
import { CrearUsuarioDto } from './dto/crear-usuario.dto.js';
import { RestablecerPasswordDto } from './dto/restablecer-password.dto.js';
import { UsuariosService } from './usuarios.service.js';

// La gestión de cuentas la hace quien tenga el permiso usuarios.gestionar (el gerente).
@Permiso(PERMISOS.USUARIOS_GESTIONAR)
@SoloAlcanceTotal()
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Post()
  crear(@Body() dto: CrearUsuarioDto, @CurrentUsuario() actor: UsuarioAutenticado) {
    return this.usuariosService.crear(dto, actor);
  }

  @Get()
  listar() {
    return this.usuariosService.listar();
  }

  @Patch(':id')
  actualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarUsuarioDto, @CurrentUsuario() actor: UsuarioAutenticado) {
    return this.usuariosService.actualizar(id, dto, actor);
  }

  @Patch(':id/estado')
  actualizarEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarEstadoUsuarioDto,
    @CurrentUsuario() usuarioActual: UsuarioAutenticado,
  ) {
    return this.usuariosService.actualizarEstado(id, dto, usuarioActual);
  }

  @Post(':id/password')
  restablecerPassword(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RestablecerPasswordDto, @CurrentUsuario() actor: UsuarioAutenticado) {
    return this.usuariosService.restablecerPassword(id, dto, actor);
  }

  @Post(':id/desbloquear')
  desbloquear(@Param('id', ParseUUIDPipe) id: string, @CurrentUsuario() actor: UsuarioAutenticado) {
    return this.usuariosService.desbloquear(id, actor);
  }
}
