import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso } from '../auth/roles.decorator.js';
import { CrearMovimientoDto } from './dto/crear-movimiento.dto.js';
import { FiltroPeriodoDto } from './dto/filtro-periodo.dto.js';
import { ListarMovimientosQueryDto } from './dto/listar-movimientos-query.dto.js';
import { FinanzasService } from './finanzas.service.js';

@Controller('finanzas')
export class FinanzasController {
  constructor(private readonly finanzasService: FinanzasService) {}

  @Permiso(PERMISOS.FINANZAS_REGISTRAR)
  @Post('movimientos')
  crear(@Body() dto: CrearMovimientoDto) {
    return this.finanzasService.crear(dto);
  }

  @Permiso(PERMISOS.FINANZAS_VER)
  @Get('movimientos')
  listar(@Query() filtro: ListarMovimientosQueryDto) {
    return this.finanzasService.listar(filtro);
  }

  @Permiso(PERMISOS.FINANZAS_VER)
  @Get('consolidado')
  consolidado(@Query() filtro: FiltroPeriodoDto) {
    return this.finanzasService.consolidado(filtro);
  }
}
