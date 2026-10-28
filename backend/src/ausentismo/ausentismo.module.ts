import { Module } from '@nestjs/common';
import { CatalogosAusentismoController } from './catalogos-ausentismo.controller.js';
import { CatalogosAusentismoService } from './catalogos-ausentismo.service.js';

// Ausentismo (CC-03, fase C): incapacidades y licencias con la liquidación de apoyo. Por ahora, los catálogos de tipos y de
// diagnósticos CIE-10; el registro y la liquidación se suman en los pasos siguientes.
@Module({
  controllers: [CatalogosAusentismoController],
  providers: [CatalogosAusentismoService],
  exports: [CatalogosAusentismoService],
})
export class AusentismoModule {}
