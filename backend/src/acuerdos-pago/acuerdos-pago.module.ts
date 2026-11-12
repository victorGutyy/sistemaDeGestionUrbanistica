import { Module } from '@nestjs/common';
import { AcuerdosPagoController } from './acuerdos-pago.controller.js';
import { AcuerdosPagoService } from './acuerdos-pago.service.js';

@Module({
  controllers: [AcuerdosPagoController],
  providers: [AcuerdosPagoService],
  exports: [AcuerdosPagoService],
})
export class AcuerdosPagoModule {}
