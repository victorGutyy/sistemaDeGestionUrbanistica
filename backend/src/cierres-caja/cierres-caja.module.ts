import { Module } from '@nestjs/common';
import { CierresCajaController } from './cierres-caja.controller.js';
import { CierresCajaService } from './cierres-caja.service.js';

@Module({
  controllers: [CierresCajaController],
  providers: [CierresCajaService],
})
export class CierresCajaModule {}
