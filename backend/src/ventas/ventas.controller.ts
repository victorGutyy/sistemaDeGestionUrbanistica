import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CrearVentaDto } from './dto/crear-venta.dto.js';
import { VentasService } from './ventas.service.js';

@Controller('ventas')
export class VentasController {
  constructor(private readonly ventasService: VentasService) {}

  @Post()
  crear(@Body() dto: CrearVentaDto) {
    return this.ventasService.crear(dto);
  }

  @Get()
  listar() {
    return this.ventasService.listar();
  }

  @Get(':id')
  buscarPorId(@Param('id') id: string) {
    return this.ventasService.buscarPorId(id);
  }
}
