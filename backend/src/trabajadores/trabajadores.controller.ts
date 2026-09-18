import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CrearTrabajadorDto } from './dto/crear-trabajador.dto.js';
import { TrabajadoresService } from './trabajadores.service.js';

@Controller('trabajadores')
export class TrabajadoresController {
  constructor(private readonly trabajadoresService: TrabajadoresService) {}

  @Post()
  crear(@Body() dto: CrearTrabajadorDto) {
    return this.trabajadoresService.crear(dto);
  }

  @Get()
  listar() {
    return this.trabajadoresService.listar();
  }

  @Get(':id')
  buscarPorId(@Param('id') id: string) {
    return this.trabajadoresService.buscarPorId(id);
  }
}
