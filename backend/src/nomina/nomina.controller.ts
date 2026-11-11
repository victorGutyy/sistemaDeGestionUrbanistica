import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso, SoloAlcanceTotal } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { ActualizarCargoNominaDto, CrearCargoNominaDto } from './dto/cargo-nomina.dto.js';
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

  // Cargos de nómina (CC-05): los ven y los administran quienes llevan la nómina (gerente y administrador).
  // Sin `?todos=true` solo salen los activos; la pantalla de administración pide todos.
  @Permiso(PERMISOS.NOMINA_VER)
  @Get('cargos')
  listarCargos(@Query('todos') todos?: string) {
    return this.nominaService.listarCargos(todos === 'true');
  }

  @Permiso(PERMISOS.NOMINA_GESTIONAR)
  @Post('cargos')
  crearCargo(@Body() dto: CrearCargoNominaDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.nominaService.crearCargo(dto, usuario);
  }

  @Permiso(PERMISOS.NOMINA_GESTIONAR)
  @Patch('cargos/:id')
  actualizarCargo(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActualizarCargoNominaDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.nominaService.actualizarCargo(id, dto, usuario);
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
