import { Module } from '@nestjs/common';
import { ConfiguracionModule } from '../configuracion/configuracion.module.js';
import { NotificacionesModule } from '../notificaciones/notificaciones.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { AbonosController, RecibosController } from './abonos.controller.js';
import { AbonosService } from './abonos.service.js';
import { VerificacionController } from './verificacion.controller.js';
import { VerificacionService } from './verificacion.service.js';

@Module({
  imports: [StorageModule, ConfiguracionModule, NotificacionesModule],
  controllers: [AbonosController, RecibosController, VerificacionController],
  providers: [AbonosService, VerificacionService],
  exports: [VerificacionService],
})
export class AbonosModule {}
