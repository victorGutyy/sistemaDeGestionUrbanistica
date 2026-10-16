import { Module } from '@nestjs/common';
import { ConfiguracionModule } from '../configuracion/configuracion.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { CierresCajaController } from './cierres-caja.controller.js';
import { CierresCajaService } from './cierres-caja.service.js';

@Module({
  imports: [ConfiguracionModule, StorageModule],
  controllers: [CierresCajaController],
  providers: [CierresCajaService],
})
export class CierresCajaModule {}
