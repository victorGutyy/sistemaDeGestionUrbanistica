import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { CrearLoteDto } from './dto/crear-lote.dto.js';
import { ListarLotesQueryDto } from './dto/listar-lotes-query.dto.js';
import { LotesService } from './lotes.service.js';

@Controller('lotes')
export class LotesController {
  constructor(private readonly lotesService: LotesService) {}

  @Permiso(PERMISOS.PROYECTOS_GESTIONAR)
  @Post()
  crear(@Body() dto: CrearLoteDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.lotesService.crear(dto, usuario);
  }

  @Permiso(PERMISOS.PROYECTOS_VER)
  @Get()
  listar(@Query() filtro: ListarLotesQueryDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.lotesService.listar(filtro, usuario);
  }

  @Permiso(PERMISOS.PROYECTOS_VER)
  @Get(':id')
  buscarPorId(@Param('id') id: string, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.lotesService.buscarPorId(id, usuario);
  }
}
