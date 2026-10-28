import { Module } from '@nestjs/common';
import { ConfiguracionModule } from '../configuracion/configuracion.module.js';
import { SeguridadSocialModule } from '../seguridad-social/seguridad-social.module.js';
import { SstModule } from '../sst/sst.module.js';
import { AusentismoController } from './ausentismo.controller.js';
import { AusentismoService } from './ausentismo.service.js';
import { CatalogosAusentismoController } from './catalogos-ausentismo.controller.js';
import { CatalogosAusentismoService } from './catalogos-ausentismo.service.js';
import { InformesAusentismoService } from './informes-ausentismo.service.js';
import { RecobrosAusentismoService } from './recobros-ausentismo.service.js';

// Ausentismo (CC-03, fase C): incapacidades y licencias con la liquidación de apoyo. Los catálogos van primero: sus rutas
// fijas (tipos, diagnosticos) deben registrarse antes que las de un ausentismo por identificador.
@Module({
  imports: [ConfiguracionModule, SeguridadSocialModule, SstModule],
  controllers: [CatalogosAusentismoController, AusentismoController],
  providers: [CatalogosAusentismoService, AusentismoService, RecobrosAusentismoService, InformesAusentismoService],
  exports: [CatalogosAusentismoService, AusentismoService, RecobrosAusentismoService, InformesAusentismoService],
})
export class AusentismoModule {}
