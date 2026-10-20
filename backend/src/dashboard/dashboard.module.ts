import { Module } from '@nestjs/common';
import { CarteraModule } from '../cartera/cartera.module.js';
import { ComisionesModule } from '../comisiones/comisiones.module.js';
import { ConfiguracionModule } from '../configuracion/configuracion.module.js';
import { FinanzasModule } from '../finanzas/finanzas.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [FinanzasModule, CarteraModule, ConfiguracionModule, ComisionesModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
