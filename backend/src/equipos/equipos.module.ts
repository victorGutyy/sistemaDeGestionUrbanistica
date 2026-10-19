import { Module } from '@nestjs/common';
import { EquiposController } from './equipos.controller.js';
import { EquiposService } from './equipos.service.js';

@Module({
  controllers: [EquiposController],
  providers: [EquiposService],
})
export class EquiposModule {}
