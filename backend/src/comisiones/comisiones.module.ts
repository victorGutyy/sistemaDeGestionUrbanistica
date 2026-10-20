import { Module } from '@nestjs/common';
import { ConfiguracionModule } from '../configuracion/configuracion.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { ComisionesController } from './comisiones.controller.js';
import { ComisionesService } from './comisiones.service.js';

@Module({
  imports: [StorageModule, ConfiguracionModule],
  controllers: [ComisionesController],
  providers: [ComisionesService],
  exports: [ComisionesService],
})
export class ComisionesModule {}
