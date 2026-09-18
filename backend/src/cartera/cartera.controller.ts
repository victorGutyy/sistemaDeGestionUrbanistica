import { Controller, Get } from '@nestjs/common';
import { CarteraService } from './cartera.service.js';

@Controller('cartera')
export class CarteraController {
  constructor(private readonly carteraService: CarteraService) {}

  @Get()
  listarPorCliente() {
    return this.carteraService.listarPorCliente();
  }

  @Get('reporte')
  reportePorProyecto() {
    return this.carteraService.reportePorProyecto();
  }
}
