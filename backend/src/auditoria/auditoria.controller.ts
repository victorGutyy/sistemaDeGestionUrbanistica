import { Controller, Get, Query } from '@nestjs/common';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso, SoloAlcanceTotal } from '../auth/roles.decorator.js';
import { AuditoriaService } from './auditoria.service.js';
import { ListarAuditoriaQueryDto } from './dto/listar-auditoria-query.dto.js';

// La auditoría es de toda la empresa y solo la consulta el gerente. No hay rutas para crear, editar ni borrar:
// los registros los escriben los propios servicios, dentro de la transacción de cada acción.
@SoloAlcanceTotal()
@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly auditoriaService: AuditoriaService) {}

  @Permiso(PERMISOS.AUDITORIA_VER)
  @Get()
  listar(@Query() filtro: ListarAuditoriaQueryDto) {
    return this.auditoriaService.listar(filtro);
  }

  @Permiso(PERMISOS.AUDITORIA_VER)
  @Get('catalogo')
  catalogo() {
    return this.auditoriaService.catalogo();
  }
}
