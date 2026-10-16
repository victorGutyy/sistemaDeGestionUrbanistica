import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso } from '../auth/roles.decorator.js';
import { CrearLoteDto } from './dto/crear-lote.dto.js';
import { ListarLotesQueryDto } from './dto/listar-lotes-query.dto.js';
import { LotesService } from './lotes.service.js';

@Controller('lotes')
export class LotesController {
  constructor(private readonly lotesService: LotesService) {}

  @Permiso(PERMISOS.PROYECTOS_GESTIONAR)
  @Post()
  crear(@Body() dto: CrearLoteDto) {
    return this.lotesService.crear(dto);
  }

  @Permiso(PERMISOS.PROYECTOS_VER)
  @Get()
  listar(@Query() filtro: ListarLotesQueryDto) {
    return this.lotesService.listar(filtro);
  }

  @Permiso(PERMISOS.PROYECTOS_VER)
  @Get(':id')
  buscarPorId(@Param('id') id: string) {
    return this.lotesService.buscarPorId(id);
  }
}
