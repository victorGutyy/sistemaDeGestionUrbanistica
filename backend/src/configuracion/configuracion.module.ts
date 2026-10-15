import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module.js';
import { ConfiguracionController } from './configuracion.controller.js';
import { ConfiguracionService } from './configuracion.service.js';

@Module({
  imports: [StorageModule],
  controllers: [ConfiguracionController],
  providers: [ConfiguracionService],
  exports: [ConfiguracionService],
})
export class ConfiguracionModule {}
