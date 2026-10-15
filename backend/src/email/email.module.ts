import { Module } from '@nestjs/common';
import { ConfiguracionModule } from '../configuracion/configuracion.module.js';
import { EmailService } from './email.service.js';

@Module({
  imports: [ConfiguracionModule],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
