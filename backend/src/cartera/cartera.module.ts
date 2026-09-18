import { Module } from '@nestjs/common';
import { CarteraController } from './cartera.controller.js';
import { CarteraService } from './cartera.service.js';

@Module({
  controllers: [CarteraController],
  providers: [CarteraService],
})
export class CarteraModule {}
