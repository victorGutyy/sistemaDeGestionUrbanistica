import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { CrearVentaDto, RechazarVentaDto } from './dto/crear-venta.dto.js';
import { ListarVentasQueryDto } from './dto/listar-ventas-query.dto.js';
import { VentasService } from './ventas.service.js';

@Controller('ventas')
export class VentasController {
  constructor(private readonly ventasService: VentasService) {}

  @Permiso(PERMISOS.VENTAS_CREAR)
  @Post()
  crear(@Body() dto: CrearVentaDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.ventasService.crear(dto, usuario);
  }

  // Valores por defecto del negocio para la pantalla de venta nueva.
  @Permiso(PERMISOS.VENTAS_CREAR)
  @Get('parametros')
  parametros(@CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.ventasService.parametros(usuario);
  }

  @Permiso(PERMISOS.VENTAS_VER)
  @Get('vendedores')
  vendedores() {
    return this.ventasService.listarVendedores();
  }

  @Permiso(PERMISOS.VENTAS_VER)
  @Get()
  listar(@Query() filtro: ListarVentasQueryDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.ventasService.listar(usuario, filtro.estado);
  }

  @Permiso(PERMISOS.VENTAS_VER)
  @Get(':id')
  buscarPorId(@Param('id', ParseUUIDPipe) id: string, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.ventasService.buscarPorId(id, usuario);
  }

  // Aprobar o rechazar una venta con excepción es decisión del gerente.
  @Permiso(PERMISOS.VENTAS_AUTORIZAR)
  @Post(':id/aprobar')
  aprobar(@Param('id', ParseUUIDPipe) id: string, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.ventasService.aprobar(id, usuario);
  }

  @Permiso(PERMISOS.VENTAS_AUTORIZAR)
  @Post(':id/rechazar')
  rechazar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RechazarVentaDto,
    @CurrentUsuario() usuario: UsuarioAutenticado,
  ) {
    return this.ventasService.rechazar(id, dto.motivo, usuario);
  }
}
