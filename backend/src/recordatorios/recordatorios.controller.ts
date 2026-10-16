import { Controller, Post } from '@nestjs/common';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso, SoloAlcanceTotal } from '../auth/roles.decorator.js';
import { RecordatoriosService } from './recordatorios.service.js';

@SoloAlcanceTotal()
@Controller('recordatorios')
export class RecordatoriosController {
  constructor(private readonly recordatoriosService: RecordatoriosService) {}

  // Disparo manual: no hay que esperar a que sea "mañana" de verdad para
  // probar que el envío de correos funciona.
  @Permiso(PERMISOS.RECORDATORIOS_EJECUTAR)
  @Post('ejecutar')
  ejecutar() {
    return this.recordatoriosService.enviarRecordatoriosPendientes();
  }
}
