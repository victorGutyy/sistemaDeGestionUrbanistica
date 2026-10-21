import { Module } from '@nestjs/common';
import { ConfiguracionModule } from '../configuracion/configuracion.module.js';
import { EmailModule } from '../email/email.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { NotificacionesController } from './notificaciones.controller.js';
import { NotificacionesService } from './notificaciones.service.js';

@Module({
  imports: [EmailModule, ConfiguracionModule, StorageModule],
  controllers: [NotificacionesController],
  providers: [NotificacionesService],
  exports: [NotificacionesService],
})
export class NotificacionesModule {}
