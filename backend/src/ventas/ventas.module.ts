import { Module } from '@nestjs/common';
import { ConfiguracionModule } from '../configuracion/configuracion.module.js';
import { NotificacionesModule } from '../notificaciones/notificaciones.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { AjustarPlanController } from './ajustar-plan.controller.js';
import { AjustarPlanService } from './ajustar-plan.service.js';
import { VentasController } from './ventas.controller.js';
import { VentasService } from './ventas.service.js';

@Module({
  imports: [ConfiguracionModule, StorageModule, NotificacionesModule],
  controllers: [VentasController, AjustarPlanController],
  providers: [VentasService, AjustarPlanService],
})
export class VentasModule {}
