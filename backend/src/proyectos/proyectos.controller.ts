import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ActualizarEstadoProyectoDto } from './dto/actualizar-estado-proyecto.dto.js';
import { CrearProyectoDto } from './dto/crear-proyecto.dto.js';
import { ProyectosService } from './proyectos.service.js';

@Controller('proyectos')
export class ProyectosController {
  constructor(private readonly proyectosService: ProyectosService) {}

  @Post()
  crear(@Body() dto: CrearProyectoDto) {
    return this.proyectosService.crear(dto);
  }

  @Get()
  listar() {
    return this.proyectosService.listar();
  }

  @Get(':id')
  buscarPorId(@Param('id') id: string) {
    return this.proyectosService.buscarPorId(id);
  }

  @Patch(':id/estado')
  actualizarEstado(@Param('id') id: string, @Body() dto: ActualizarEstadoProyectoDto) {
    return this.proyectosService.actualizarEstado(id, dto);
  }
}
