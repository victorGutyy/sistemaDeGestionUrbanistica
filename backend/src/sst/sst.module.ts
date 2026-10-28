import { Module } from '@nestjs/common';
import { ConfiguracionModule } from '../configuracion/configuracion.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { DocumentosSstService } from './documentos-sst.service.js';
import { EppController } from './epp.controller.js';
import { EppService } from './epp.service.js';

// Gestión SST (CC-03, fase B): elementos de protección personal, plan de trabajo anual y capacitaciones.
@Module({
  imports: [ConfiguracionModule, StorageModule],
  controllers: [EppController],
  providers: [EppService, DocumentosSstService],
  exports: [EppService, DocumentosSstService],
})
export class SstModule {}
