import { Module } from '@nestjs/common';
import { AusentismoModule } from '../ausentismo/ausentismo.module.js';
import { ConfiguracionModule } from '../configuracion/configuracion.module.js';
import { ImportacionSstController } from '../importacion-sst/importacion-sst.controller.js';
import { ImportacionSstService } from '../importacion-sst/importacion-sst.service.js';
import { SstModule } from '../sst/sst.module.js';
import { TrabajadoresModule } from '../trabajadores/trabajadores.module.js';
import { ImportacionController } from './importacion.controller.js';
import { ImportacionService } from './importacion.service.js';

// Las cargas desde Excel: la de ventas (proyectos, lotes, clientes, ventas y abonos) y la de seguridad y salud en el trabajo
// (trabajadores, ausentismos, entregas de EPP y asistencias). El controlador de SST va primero: sus rutas fijas
// ("importacion/sst/...") deben registrarse antes que las de una importación de ventas por identificador (":id").
@Module({
  imports: [ConfiguracionModule, TrabajadoresModule, AusentismoModule, SstModule],
  controllers: [ImportacionSstController, ImportacionController],
  providers: [ImportacionService, ImportacionSstService],
})
export class ImportacionModule {}
