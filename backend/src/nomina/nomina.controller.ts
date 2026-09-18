import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CrearPagoNominaDto } from './dto/crear-pago-nomina.dto.js';
import { NominaService } from './nomina.service.js';

@Controller('nomina')
export class NominaController {
  constructor(private readonly nominaService: NominaService) {}

  @Post('pagos')
  crearPago(@Body() dto: CrearPagoNominaDto) {
    return this.nominaService.crearPago(dto);
  }

  @Get('pagos')
  listarPagos(@Query('trabajadorId') trabajadorId?: string) {
    return this.nominaService.listarPagos(trabajadorId);
  }
}
