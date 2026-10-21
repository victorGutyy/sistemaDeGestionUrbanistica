import { Module } from '@nestjs/common';
import { ConfiguracionModule } from '../configuracion/configuracion.module.js';
import { NotificacionesModule } from '../notificaciones/notificaciones.module.js';
import { RecordatoriosController } from './recordatorios.controller.js';
import { RecordatoriosService } from './recordatorios.service.js';

@Module({
  imports: [NotificacionesModule, ConfiguracionModule],
  controllers: [RecordatoriosController],
  providers: [RecordatoriosService],
})
export class RecordatoriosModule {}
