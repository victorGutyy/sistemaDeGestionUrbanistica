import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { ActualizarEquipoDto, BajaEquipoDto, CrearEquipoDto, ListarEquiposQueryDto } from './dto/equipo.dto.js';
import { EquiposService } from './equipos.service.js';

// Equipos de los proyectos de maquinaria. Quien tiene alcance restringido solo ve los de sus proyectos.
@Controller('equipos')
export class EquiposController {
  constructor(private readonly equiposService: EquiposService) {}

  @Permiso(PERMISOS.PROYECTOS_VER)
  @Get()
  listar(@Query() filtro: ListarEquiposQueryDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.equiposService.listar(filtro, usuario);
  }

  // Tipos de equipo activos, para elegir al registrar un equipo.
  @Permiso(PERMISOS.PROYECTOS_VER)
  @Get('tipos')
  tipos() {
    return this.equiposService.listarTipos();
  }

  @Permiso(PERMISOS.EQUIPOS_GESTIONAR)
  @Post()
  crear(@Body() dto: CrearEquipoDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.equiposService.crear(dto, usuario);
  }

  @Permiso(PERMISOS.PROYECTOS_VER)
  @Get(':id')
  obtener(@Param('id', ParseUUIDPipe) id: string, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.equiposService.obtener(id, usuario);
  }

  @Permiso(PERMISOS.EQUIPOS_GESTIONAR)
  @Patch(':id')
  actualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarEquipoDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.equiposService.actualizar(id, dto, usuario);
  }

  @Permiso(PERMISOS.EQUIPOS_BAJA)
  @Post(':id/baja')
  darDeBaja(@Param('id', ParseUUIDPipe) id: string, @Body() dto: BajaEquipoDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.equiposService.darDeBaja(id, dto, usuario);
  }

  @Permiso(PERMISOS.EQUIPOS_BAJA)
  @Post(':id/reactivar')
  reactivar(@Param('id', ParseUUIDPipe) id: string, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.equiposService.reactivar(id, usuario);
  }
}
