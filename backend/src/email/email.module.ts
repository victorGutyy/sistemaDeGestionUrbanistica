import { Module } from '@nestjs/common';
import { ConfiguracionModule } from '../configuracion/configuracion.module.js';
import { CorreoController } from './correo.controller.js';
import { CorreoService } from './correo.service.js';
import { EmailService } from './email.service.js';

@Module({
  imports: [ConfiguracionModule],
  controllers: [CorreoController],
  providers: [EmailService, CorreoService],
  exports: [EmailService],
})
export class EmailModule {}
