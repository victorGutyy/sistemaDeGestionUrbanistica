import { Module } from '@nestjs/common';
import { ConfiguracionModule } from '../configuracion/configuracion.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { AbonosController, RecibosController } from './abonos.controller.js';
import { AbonosService } from './abonos.service.js';

@Module({
  imports: [StorageModule, ConfiguracionModule],
  controllers: [AbonosController, RecibosController],
  providers: [AbonosService],
})
export class AbonosModule {}
