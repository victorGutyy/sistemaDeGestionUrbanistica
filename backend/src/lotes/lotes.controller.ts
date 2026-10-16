import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { AccionLoteDto, EscriturarLoteDto, ReponerLoteDto } from './dto/accion-lote.dto.js';
import { ActualizarLoteDto } from './dto/actualizar-lote.dto.js';
import { CrearLoteDto } from './dto/crear-lote.dto.js';
import { ListarLotesQueryDto } from './dto/listar-lotes-query.dto.js';
import { LotesService } from './lotes.service.js';

// No existe una ruta para cambiar el estado "a mano": solo estas acciones (RF-PRY-06).
// Vender lo hace la venta y desistir lo hará el desistimiento de la venta.
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
  buscarPorId(@Param('id', ParseUUIDPipe) id: string, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.lotesService.buscarPorId(id, usuario);
  }

  @Permiso(PERMISOS.PROYECTOS_GESTIONAR)
  @Patch(':id')
  actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarLoteDto,
    @CurrentUsuario() usuario: UsuarioAutenticado,
  ) {
    return this.lotesService.actualizar(id, dto, usuario);
  }

  @Permiso(PERMISOS.PROYECTOS_GESTIONAR)
  @Post(':id/separar')
  separar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AccionLoteDto,
    @CurrentUsuario() usuario: UsuarioAutenticado,
  ) {
    return this.lotesService.separar(id, dto, usuario);
  }

  @Permiso(PERMISOS.PROYECTOS_GESTIONAR)
  @Post(':id/liberar')
  liberar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AccionLoteDto,
    @CurrentUsuario() usuario: UsuarioAutenticado,
  ) {
    return this.lotesService.liberar(id, dto, usuario);
  }

  @Permiso(PERMISOS.PROYECTOS_GESTIONAR)
  @Post(':id/escriturar')
  escriturar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EscriturarLoteDto,
    @CurrentUsuario() usuario: UsuarioAutenticado,
  ) {
    return this.lotesService.escriturar(id, dto, usuario);
  }

  // Volver a poner a la venta un lote desistido es decisión del gerente.
  @Permiso(PERMISOS.PROYECTOS_CAMBIAR_ESTADO)
  @Post(':id/reponer')
  reponer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReponerLoteDto,
    @CurrentUsuario() usuario: UsuarioAutenticado,
  ) {
    return this.lotesService.reponer(id, dto, usuario);
  }
}
