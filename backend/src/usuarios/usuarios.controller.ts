import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { Rol } from '../generated/prisma/enums.js';
import { ActualizarEstadoUsuarioDto } from './dto/actualizar-estado-usuario.dto.js';
import { CrearUsuarioDto } from './dto/crear-usuario.dto.js';
import { UsuariosService } from './usuarios.service.js';

// La gestión de cuentas es exclusiva del propietario.
@Roles(Rol.PROPIETARIO)
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

  @Patch(':id/estado')
  actualizarEstado(
    @Param('id') id: string,
    @Body() dto: ActualizarEstadoUsuarioDto,
    @CurrentUsuario() usuarioActual: UsuarioAutenticado,
  ) {
    return this.usuariosService.actualizarEstado(id, dto, usuarioActual.id);
  }
}
