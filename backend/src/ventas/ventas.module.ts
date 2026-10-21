import { Module } from '@nestjs/common';
import { ConfiguracionModule } from '../configuracion/configuracion.module.js';
import { NotificacionesModule } from '../notificaciones/notificaciones.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { VentasController } from './ventas.controller.js';
import { VentasService } from './ventas.service.js';

@Module({
  imports: [ConfiguracionModule, StorageModule, NotificacionesModule],
  controllers: [VentasController],
  providers: [VentasService],
})
export class VentasModule {}
