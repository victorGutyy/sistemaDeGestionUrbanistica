import { Module } from '@nestjs/common';
import { ConfiguracionModule } from '../configuracion/configuracion.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { FinanzasController } from './finanzas.controller.js';
import { FinanzasService } from './finanzas.service.js';

@Module({
  imports: [StorageModule, ConfiguracionModule],
  controllers: [FinanzasController],
  providers: [FinanzasService],
  exports: [FinanzasService],
})
export class FinanzasModule {}
