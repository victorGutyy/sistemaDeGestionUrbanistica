import { Module } from '@nestjs/common';
import { AusentismoModule } from '../ausentismo/ausentismo.module.js';
import { ConfiguracionModule } from '../configuracion/configuracion.module.js';
import { SstModule } from '../sst/sst.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { ReportesSstController } from './reportes-sst.controller.js';
import { ReportesSstService } from './reportes-sst.service.js';

// Reportes de seguridad y salud en el trabajo (CC-03, fase D). Junta lo del ausentismo y lo de la gestión SST con el motor
// común de reportes (pantalla, PDF y Excel).
@Module({
  imports: [ConfiguracionModule, StorageModule, SstModule, AusentismoModule],
  controllers: [ReportesSstController],
  providers: [ReportesSstService],
})
export class ReportesSstModule {}
