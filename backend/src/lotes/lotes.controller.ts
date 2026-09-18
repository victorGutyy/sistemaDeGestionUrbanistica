import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CrearLoteDto } from './dto/crear-lote.dto.js';
import { ListarLotesQueryDto } from './dto/listar-lotes-query.dto.js';
import { LotesService } from './lotes.service.js';

@Controller('lotes')
export class LotesController {
  constructor(private readonly lotesService: LotesService) {}

  @Post()
  crear(@Body() dto: CrearLoteDto) {
    return this.lotesService.crear(dto);
  }

  @Get()
  listar(@Query() filtro: ListarLotesQueryDto) {
    return this.lotesService.listar(filtro);
  }

  @Get(':id')
  buscarPorId(@Param('id') id: string) {
    return this.lotesService.buscarPorId(id);
  }
}
