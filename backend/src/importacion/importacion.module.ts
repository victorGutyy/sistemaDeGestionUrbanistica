import { Module } from '@nestjs/common';
import { ConfiguracionModule } from '../configuracion/configuracion.module.js';
import { ImportacionController } from './importacion.controller.js';
import { ImportacionService } from './importacion.service.js';

@Module({
  imports: [ConfiguracionModule],
  controllers: [ImportacionController],
  providers: [ImportacionService],
})
export class ImportacionModule {}
