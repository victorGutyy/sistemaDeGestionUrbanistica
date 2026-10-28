import { Module } from '@nestjs/common';
import { SeguridadSocialModule } from '../seguridad-social/seguridad-social.module.js';
import { SstModule } from '../sst/sst.module.js';
import { AusentismoController } from './ausentismo.controller.js';
import { AusentismoService } from './ausentismo.service.js';
import { CatalogosAusentismoController } from './catalogos-ausentismo.controller.js';
import { CatalogosAusentismoService } from './catalogos-ausentismo.service.js';

// Ausentismo (CC-03, fase C): incapacidades y licencias con la liquidación de apoyo. Los catálogos van primero: sus rutas
// fijas (tipos, diagnosticos) deben registrarse antes que las de un ausentismo por identificador.
@Module({
  imports: [SeguridadSocialModule, SstModule],
  controllers: [CatalogosAusentismoController, AusentismoController],
  providers: [CatalogosAusentismoService, AusentismoService],
  exports: [CatalogosAusentismoService, AusentismoService],
})
export class AusentismoModule {}
