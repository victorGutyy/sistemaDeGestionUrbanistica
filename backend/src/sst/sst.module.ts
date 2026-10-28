import { Module } from '@nestjs/common';
import { ConfiguracionModule } from '../configuracion/configuracion.module.js';
import { EmailModule } from '../email/email.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { AvisosSstService } from './avisos-sst.service.js';
import { CapacitacionesController } from './capacitaciones.controller.js';
import { CapacitacionesService } from './capacitaciones.service.js';
import { DocumentosSstService } from './documentos-sst.service.js';
import { EppController } from './epp.controller.js';
import { EppService } from './epp.service.js';
import { PlanTrabajoController } from './plan-trabajo.controller.js';
import { PlanTrabajoService } from './plan-trabajo.service.js';
import { ResumenSstService } from './resumen-sst.service.js';
import { SstController } from './sst.controller.js';

// Gestión SST (CC-03, fase B): elementos de protección personal, plan de trabajo anual, capacitaciones, y los avisos por
// correo y el resumen para el panel.
@Module({
  imports: [ConfiguracionModule, StorageModule, EmailModule],
  controllers: [SstController, EppController, PlanTrabajoController, CapacitacionesController],
  providers: [EppService, PlanTrabajoService, CapacitacionesService, DocumentosSstService, ResumenSstService, AvisosSstService],
  exports: [EppService, PlanTrabajoService, CapacitacionesService, DocumentosSstService, ResumenSstService, AvisosSstService],
})
export class SstModule {}
