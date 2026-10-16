import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { ActualizarEstadoUsuarioDto } from './dto/actualizar-estado-usuario.dto.js';
import { ActualizarUsuarioDto } from './dto/actualizar-usuario.dto.js';
import { CrearUsuarioDto } from './dto/crear-usuario.dto.js';
import { RestablecerPasswordDto } from './dto/restablecer-password.dto.js';
import { UsuariosService } from './usuarios.service.js';

// La gestión de cuentas la hace quien tenga el permiso usuarios.gestionar (el gerente).
@Permiso(PERMISOS.USUARIOS_GESTIONAR)
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Post()
  crear(@Body() dto: CrearUsuarioDto) {
    return this.usuariosService.crear(dto);
  }

  @Get()
  listar() {
    return this.usuariosService.listar();
  }

  @Patch(':id')
  actualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarUsuarioDto) {
    return this.usuariosService.actualizar(id, dto);
  }

  @Patch(':id/estado')
  actualizarEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarEstadoUsuarioDto,
    @CurrentUsuario() usuarioActual: UsuarioAutenticado,
  ) {
    return this.usuariosService.actualizarEstado(id, dto, usuarioActual.id);
  }

  @Post(':id/password')
  restablecerPassword(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RestablecerPasswordDto) {
    return this.usuariosService.restablecerPassword(id, dto);
  }

  @Post(':id/desbloquear')
  desbloquear(@Param('id', ParseUUIDPipe) id: string) {
    return this.usuariosService.desbloquear(id);
  }
}
