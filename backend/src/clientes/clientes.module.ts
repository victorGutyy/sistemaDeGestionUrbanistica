import { Module } from '@nestjs/common';
import { ConfiguracionModule } from '../configuracion/configuracion.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { ClientesController } from './clientes.controller.js';
import { ClientesService } from './clientes.service.js';

@Module({
  imports: [ConfiguracionModule, StorageModule],
  controllers: [ClientesController],
  providers: [ClientesService],
  exports: [ClientesService],
})
export class ClientesModule {}
