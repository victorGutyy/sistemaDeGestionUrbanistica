import { Module } from '@nestjs/common';
import { TrabajadoresController } from './trabajadores.controller.js';
import { TrabajadoresService } from './trabajadores.service.js';

@Module({
  controllers: [TrabajadoresController],
  providers: [TrabajadoresService],
  exports: [TrabajadoresService],
})
export class TrabajadoresModule {}
