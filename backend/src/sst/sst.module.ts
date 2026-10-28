import { Module } from '@nestjs/common';
import { ConfiguracionModule } from '../configuracion/configuracion.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { CapacitacionesController } from './capacitaciones.controller.js';
import { CapacitacionesService } from './capacitaciones.service.js';
import { DocumentosSstService } from './documentos-sst.service.js';
import { EppController } from './epp.controller.js';
import { EppService } from './epp.service.js';
import { PlanTrabajoController } from './plan-trabajo.controller.js';
import { PlanTrabajoService } from './plan-trabajo.service.js';

// Gestión SST (CC-03, fase B): elementos de protección personal, plan de trabajo anual y capacitaciones.
@Module({
  imports: [ConfiguracionModule, StorageModule],
  controllers: [EppController, PlanTrabajoController, CapacitacionesController],
  providers: [EppService, PlanTrabajoService, CapacitacionesService, DocumentosSstService],
  exports: [EppService, PlanTrabajoService, CapacitacionesService, DocumentosSstService],
})
export class SstModule {}
