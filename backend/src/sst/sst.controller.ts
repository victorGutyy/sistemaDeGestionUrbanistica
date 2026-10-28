import { Controller, Get, Post, Query } from '@nestjs/common';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso, SoloAlcanceTotal } from '../auth/roles.decorator.js';
import { AvisosSstService } from './avisos-sst.service.js';
import { ListarAvisosSstQueryDto } from './dto/avisos.dto.js';
import { ResumenSstService } from './resumen-sst.service.js';

// Lo transversal de la gestión SST: el resumen de alertas para el panel y los avisos por correo. Ver: sst.ver. Enviar los
// avisos ahora mismo: sst.gestionar. Son datos de la empresa, no de un proyecto: no es para usuarios con alcance restringido.
@SoloAlcanceTotal()
@Controller('sst')
export class SstController {
  constructor(
    private readonly resumenService: ResumenSstService,
    private readonly avisosService: AvisosSstService,
  ) {}

  @Permiso(PERMISOS.SST_VER)
  @Get('resumen')
  resumen() {
    return this.resumenService.obtener();
  }

  // Historial de avisos por correo (cada intento, con su resultado).
  @Permiso(PERMISOS.SST_VER)
  @Get('avisos')
  listarAvisos(@Query() filtro: ListarAvisosSstQueryDto) {
    return this.avisosService.listarAvisos(filtro);
  }

  // Corre ahora el mismo proceso de las 8:10: cada aviso respeta sus propias reglas para no repetirse.
  @Permiso(PERMISOS.SST_GESTIONAR)
  @Post('avisos/ejecutar')
  ejecutarAvisos() {
    return this.avisosService.enviarPendientes();
  }
}
