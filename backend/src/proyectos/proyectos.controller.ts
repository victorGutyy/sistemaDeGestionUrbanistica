import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso } from '../auth/roles.decorator.js';
import { ActualizarEstadoProyectoDto } from './dto/actualizar-estado-proyecto.dto.js';
import { CrearProyectoDto } from './dto/crear-proyecto.dto.js';
import { ProyectosService } from './proyectos.service.js';

@Controller('proyectos')
export class ProyectosController {
  constructor(private readonly proyectosService: ProyectosService) {}

  @Permiso(PERMISOS.PROYECTOS_GESTIONAR)
  @Post()
  crear(@Body() dto: CrearProyectoDto) {
    return this.proyectosService.crear(dto);
  }

  @Permiso(PERMISOS.PROYECTOS_VER)
  @Get()
  listar() {
    return this.proyectosService.listar();
  }

  @Permiso(PERMISOS.PROYECTOS_VER)
  @Get(':id')
  buscarPorId(@Param('id') id: string) {
    return this.proyectosService.buscarPorId(id);
  }

  // Finalizar/reactivar un proyecto es una decisión de negocio, no operativa.
  @Permiso(PERMISOS.PROYECTOS_CAMBIAR_ESTADO)
  @Patch(':id/estado')
  actualizarEstado(@Param('id') id: string, @Body() dto: ActualizarEstadoProyectoDto) {
    return this.proyectosService.actualizarEstado(id, dto);
  }
}
