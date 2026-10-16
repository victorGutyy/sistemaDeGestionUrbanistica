import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso } from '../auth/roles.decorator.js';
import { CrearVentaDto } from './dto/crear-venta.dto.js';
import { VentasService } from './ventas.service.js';

@Controller('ventas')
export class VentasController {
  constructor(private readonly ventasService: VentasService) {}

  @Permiso(PERMISOS.VENTAS_CREAR)
  @Post()
  crear(@Body() dto: CrearVentaDto) {
    return this.ventasService.crear(dto);
  }

  @Permiso(PERMISOS.VENTAS_VER)
  @Get()
  listar() {
    return this.ventasService.listar();
  }

  @Permiso(PERMISOS.VENTAS_VER)
  @Get(':id')
  buscarPorId(@Param('id') id: string) {
    return this.ventasService.buscarPorId(id);
  }
}
