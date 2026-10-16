import { Controller, Get } from '@nestjs/common';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso } from '../auth/roles.decorator.js';
import { CarteraService } from './cartera.service.js';

@Controller('cartera')
export class CarteraController {
  constructor(private readonly carteraService: CarteraService) {}

  @Permiso(PERMISOS.CARTERA_VER)
  @Get()
  listarPorCliente() {
    return this.carteraService.listarPorCliente();
  }

  @Permiso(PERMISOS.CARTERA_VER)
  @Get('reporte')
  reportePorProyecto() {
    return this.carteraService.reportePorProyecto();
  }
}
