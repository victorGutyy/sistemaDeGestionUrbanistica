import { Module } from '@nestjs/common';
import { ConfiguracionModule } from '../configuracion/configuracion.module.js';
import { VentasController } from './ventas.controller.js';
import { VentasService } from './ventas.service.js';

@Module({
  imports: [ConfiguracionModule],
  controllers: [VentasController],
  providers: [VentasService],
})
export class VentasModule {}
