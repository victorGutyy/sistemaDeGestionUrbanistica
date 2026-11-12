import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { AcuerdosPagoService } from './acuerdos-pago.service.js';
import { CrearAcuerdoPagoDto, FinalizarAcuerdoPagoDto } from './dto/acuerdo-pago.dto.js';

// Acuerdos de pago de una venta (CC-07): se pausan los avisos y no se causa interés de mora mientras estén vigentes.
@Controller('ventas/:ventaId/acuerdos')
export class AcuerdosPagoController {
  constructor(private readonly acuerdos: AcuerdosPagoService) {}

  @Permiso(PERMISOS.VENTAS_VER)
  @Get()
  listar(@Param('ventaId', ParseUUIDPipe) ventaId: string, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.acuerdos.listar(ventaId, usuario);
  }

  @Permiso(PERMISOS.ACUERDOS_GESTIONAR)
  @Post()
  crear(@Param('ventaId', ParseUUIDPipe) ventaId: string, @Body() dto: CrearAcuerdoPagoDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.acuerdos.crear(ventaId, dto, usuario);
  }

  @Permiso(PERMISOS.ACUERDOS_GESTIONAR)
  @Post(':acuerdoId/finalizar')
  finalizar(
    @Param('ventaId', ParseUUIDPipe) ventaId: string,
    @Param('acuerdoId', ParseUUIDPipe) acuerdoId: string,
    @Body() dto: FinalizarAcuerdoPagoDto,
    @CurrentUsuario() usuario: UsuarioAutenticado,
  ) {
    return this.acuerdos.finalizar(ventaId, acuerdoId, dto, usuario);
  }
}
