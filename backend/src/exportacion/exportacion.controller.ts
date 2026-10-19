import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso, SoloAlcanceTotal } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { ExportacionService } from './exportacion.service.js';

// La exportación incluye los datos de toda la empresa: solo la hace el gerente.
@SoloAlcanceTotal()
@Controller('exportacion')
export class ExportacionController {
  constructor(private readonly exportacionService: ExportacionService) {}

  @Permiso(PERMISOS.EXPORTACION_COMPLETA)
  @Get('completa')
  async completa(@CurrentUsuario() usuario: UsuarioAutenticado, @Res() res: Response) {
    await this.exportacionService.exportar(res, usuario);
  }
}
