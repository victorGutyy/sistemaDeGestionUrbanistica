import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso, SoloAlcanceTotal } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { CrearPagoNominaDto } from './dto/crear-pago-nomina.dto.js';
import { LiquidarQuincenaDto } from './dto/liquidar-quincena.dto.js';
import { NominaService } from './nomina.service.js';

@SoloAlcanceTotal()
@Controller('nomina')
export class NominaController {
  constructor(private readonly nominaService: NominaService) {}

  @Permiso(PERMISOS.NOMINA_GESTIONAR)
  @Post('pagos')
  crearPago(@Body() dto: CrearPagoNominaDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.nominaService.crearPago(dto, usuario);
  }

  // CC-05: una obra y una quincena, un pago por trabajador, todo o nada.
  @Permiso(PERMISOS.NOMINA_GESTIONAR)
  @Post('liquidaciones')
  liquidarQuincena(@Body() dto: LiquidarQuincenaDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.nominaService.liquidarQuincena(dto, usuario);
  }

  @Permiso(PERMISOS.NOMINA_VER)
  @Get('pagos')
  listarPagos(
    @Query('trabajadorId') trabajadorId?: string,
    @Query('proyectoId') proyectoId?: string,
    @Query('periodoInicio') periodoInicio?: string,
    @Query('periodoFin') periodoFin?: string,
  ) {
    return this.nominaService.listarPagos({ trabajadorId, proyectoId, periodoInicio, periodoFin });
  }
}
