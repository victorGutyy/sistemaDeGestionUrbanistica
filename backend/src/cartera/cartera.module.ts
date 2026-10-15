import { Module } from '@nestjs/common';
import { ConfiguracionModule } from '../configuracion/configuracion.module.js';
import { CarteraController } from './cartera.controller.js';
import { CarteraService } from './cartera.service.js';

@Module({
  imports: [ConfiguracionModule],
  controllers: [CarteraController],
  providers: [CarteraService],
  exports: [CarteraService],
})
export class CarteraModule {}
