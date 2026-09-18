import { Module } from '@nestjs/common';
import { VentasController } from './ventas.controller.js';
import { VentasService } from './ventas.service.js';

@Module({
  controllers: [VentasController],
  providers: [VentasService],
})
export class VentasModule {}
