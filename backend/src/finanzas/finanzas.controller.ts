import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CrearMovimientoDto } from './dto/crear-movimiento.dto.js';
import { FiltroPeriodoDto } from './dto/filtro-periodo.dto.js';
import { ListarMovimientosQueryDto } from './dto/listar-movimientos-query.dto.js';
import { FinanzasService } from './finanzas.service.js';

@Controller('finanzas')
export class FinanzasController {
  constructor(private readonly finanzasService: FinanzasService) {}

  @Post('movimientos')
  crear(@Body() dto: CrearMovimientoDto) {
    return this.finanzasService.crear(dto);
  }

  @Get('movimientos')
  listar(@Query() filtro: ListarMovimientosQueryDto) {
    return this.finanzasService.listar(filtro);
  }

  @Get('consolidado')
  consolidado(@Query() filtro: FiltroPeriodoDto) {
    return this.finanzasService.consolidado(filtro);
  }
}
