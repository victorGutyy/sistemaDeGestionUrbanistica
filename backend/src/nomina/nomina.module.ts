import { Module } from '@nestjs/common';
import { ConfiguracionModule } from '../configuracion/configuracion.module.js';
import { NominaController } from './nomina.controller.js';
import { NominaService } from './nomina.service.js';

@Module({
  imports: [ConfiguracionModule],
  controllers: [NominaController],
  providers: [NominaService],
})
export class NominaModule {}
