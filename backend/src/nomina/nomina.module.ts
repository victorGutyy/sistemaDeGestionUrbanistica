import { Module } from '@nestjs/common';
import { NominaController } from './nomina.controller.js';
import { NominaService } from './nomina.service.js';

@Module({
  controllers: [NominaController],
  providers: [NominaService],
})
export class NominaModule {}
