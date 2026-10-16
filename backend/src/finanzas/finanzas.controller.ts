import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { CrearMovimientoDto } from './dto/crear-movimiento.dto.js';
import { FiltroPeriodoDto } from './dto/filtro-periodo.dto.js';
import { ListarMovimientosQueryDto } from './dto/listar-movimientos-query.dto.js';
import { FinanzasService } from './finanzas.service.js';

@Controller('finanzas')
export class FinanzasController {
  constructor(private readonly finanzasService: FinanzasService) {}

  @Permiso(PERMISOS.FINANZAS_REGISTRAR)
  @Post('movimientos')
  crear(@Body() dto: CrearMovimientoDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.finanzasService.crear(dto, usuario);
  }

  @Permiso(PERMISOS.FINANZAS_VER)
  @Get('movimientos')
  listar(@Query() filtro: ListarMovimientosQueryDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.finanzasService.listar(filtro, usuario);
  }

  @Permiso(PERMISOS.FINANZAS_VER)
  @Get('consolidado')
  consolidado(@Query() filtro: FiltroPeriodoDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.finanzasService.consolidado(filtro, usuario);
  }
}
