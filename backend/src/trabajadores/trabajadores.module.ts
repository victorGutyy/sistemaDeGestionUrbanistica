import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module.js';
import { AfiliacionesTrabajadorService } from './afiliaciones-trabajador.service.js';
import { DocumentosTrabajadorService } from './documentos-trabajador.service.js';
import { TrabajadoresController } from './trabajadores.controller.js';
import { TrabajadoresService } from './trabajadores.service.js';

@Module({
  imports: [StorageModule],
  controllers: [TrabajadoresController],
  providers: [TrabajadoresService, AfiliacionesTrabajadorService, DocumentosTrabajadorService],
  exports: [TrabajadoresService],
})
export class TrabajadoresModule {}
