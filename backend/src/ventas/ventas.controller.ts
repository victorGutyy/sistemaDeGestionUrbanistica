import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { CrearVentaDto } from './dto/crear-venta.dto.js';
import { VentasService } from './ventas.service.js';

@Controller('ventas')
export class VentasController {
  constructor(private readonly ventasService: VentasService) {}

  @Permiso(PERMISOS.VENTAS_CREAR)
  @Post()
  crear(@Body() dto: CrearVentaDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.ventasService.crear(dto, usuario);
  }

  @Permiso(PERMISOS.VENTAS_VER)
  @Get()
  listar(@CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.ventasService.listar(usuario);
  }

  @Permiso(PERMISOS.VENTAS_VER)
  @Get(':id')
  buscarPorId(@Param('id') id: string, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.ventasService.buscarPorId(id, usuario);
  }
}
