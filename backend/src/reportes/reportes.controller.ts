import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { ConsultaReporteDto, ExportarReporteDto } from './dto/consulta-reporte.dto.js';
import { ReportesService } from './reportes.service.js';

// Reportes (RF-REP-04 a 11). Todos exigen reportes.ver; cada uno respeta el alcance por proyecto del usuario y los
// que muestran datos sensibles exigen además su propio permiso (ver catalogo.ts).
@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  // Qué reportes hay y las opciones para sus filtros.
  @Permiso(PERMISOS.REPORTES_VER)
  @Get()
  catalogo(@CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.reportesService.catalogo(usuario);
  }

  // Antes que ":clave" para que la ruta con "/exportar" no se confunda con un reporte.
  @Permiso(PERMISOS.REPORTES_VER)
  @Get(':clave/exportar')
  async exportar(@Param('clave') clave: string, @Query() filtros: ExportarReporteDto, @CurrentUsuario() usuario: UsuarioAutenticado, @Res() res: Response) {
    const { buffer, contentType, nombreArchivo } = await this.reportesService.exportar(clave, filtros, usuario);
    res.set({ 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="${nombreArchivo}"` });
    res.send(buffer);
  }

  @Permiso(PERMISOS.REPORTES_VER)
  @Get(':clave')
  generar(@Param('clave') clave: string, @Query() filtros: ConsultaReporteDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.reportesService.generar(clave, filtros, usuario);
  }
}
