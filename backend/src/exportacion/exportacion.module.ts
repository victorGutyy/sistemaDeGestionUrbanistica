import { Module } from '@nestjs/common';
import { ConfiguracionModule } from '../configuracion/configuracion.module.js';
import { ExportacionController } from './exportacion.controller.js';
import { ExportacionService } from './exportacion.service.js';

@Module({
  imports: [ConfiguracionModule],
  controllers: [ExportacionController],
  providers: [ExportacionService],
})
export class ExportacionModule {}
