import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso, SoloAlcanceTotal } from '../auth/roles.decorator.js';
import { CrearPagoNominaDto } from './dto/crear-pago-nomina.dto.js';
import { NominaService } from './nomina.service.js';

@SoloAlcanceTotal()
@Controller('nomina')
export class NominaController {
  constructor(private readonly nominaService: NominaService) {}

  @Permiso(PERMISOS.NOMINA_GESTIONAR)
  @Post('pagos')
  crearPago(@Body() dto: CrearPagoNominaDto) {
    return this.nominaService.crearPago(dto);
  }

  @Permiso(PERMISOS.NOMINA_VER)
  @Get('pagos')
  listarPagos(@Query('trabajadorId') trabajadorId?: string) {
    return this.nominaService.listarPagos(trabajadorId);
  }
}
