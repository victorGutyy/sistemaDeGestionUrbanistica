import { Controller, Post } from '@nestjs/common';
import { RecordatoriosService } from './recordatorios.service.js';

@Controller('recordatorios')
export class RecordatoriosController {
  constructor(private readonly recordatoriosService: RecordatoriosService) {}

  // Disparo manual: no hay que esperar a que sea "mañana" de verdad para
  // probar que el envío de correos funciona.
  @Post('ejecutar')
  ejecutar() {
    return this.recordatoriosService.enviarRecordatoriosPendientes();
  }
}
