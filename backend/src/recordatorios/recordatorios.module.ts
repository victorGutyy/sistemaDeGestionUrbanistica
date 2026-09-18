import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module.js';
import { RecordatoriosController } from './recordatorios.controller.js';
import { RecordatoriosService } from './recordatorios.service.js';

@Module({
  imports: [EmailModule],
  controllers: [RecordatoriosController],
  providers: [RecordatoriosService],
})
export class RecordatoriosModule {}
