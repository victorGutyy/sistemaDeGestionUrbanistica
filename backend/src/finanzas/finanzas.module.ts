import { Module } from '@nestjs/common';
import { FinanzasController } from './finanzas.controller.js';
import { FinanzasService } from './finanzas.service.js';

@Module({
  controllers: [FinanzasController],
  providers: [FinanzasService],
})
export class FinanzasModule {}
