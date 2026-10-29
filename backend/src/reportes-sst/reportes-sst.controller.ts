import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso, SoloAlcanceTotal } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { ConsultaReporteSstDto, ExportarReporteSstDto } from './dto/consulta-reporte-sst.dto.js';
import { ReportesSstService } from './reportes-sst.service.js';

// Reportes de seguridad y salud en el trabajo (RF-SST-22). Los usa quien usa el módulo (sst.ver): gerente, administrador y
// contratista SST. Lo que cada rol ve de adentro lo decide el servidor (los valores del ausentismo solo con sst.valores_ver;
// el diagnóstico nunca sale). Son datos de la empresa, no de un proyecto: no es para usuarios con alcance restringido.
@SoloAlcanceTotal()
@Controller('sst/reportes')
export class ReportesSstController {
  constructor(private readonly reportesService: ReportesSstService) {}

  // Qué reportes hay y las opciones para sus filtros.
  @Permiso(PERMISOS.SST_VER)
  @Get()
  catalogo() {
    return this.reportesService.catalogo();
  }

  // Antes que ":clave" para que la ruta con "/exportar" no se confunda con un reporte.
  @Permiso(PERMISOS.SST_VER)
  @Get(':clave/exportar')
  async exportar(@Param('clave') clave: string, @Query() filtros: ExportarReporteSstDto, @CurrentUsuario() usuario: UsuarioAutenticado, @Res() res: Response) {
    const { buffer, contentType, nombreArchivo } = await this.reportesService.exportar(clave, filtros, usuario);
    res.set({ 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="${nombreArchivo}"` });
    res.send(buffer);
  }

  @Permiso(PERMISOS.SST_VER)
  @Get(':clave')
  generar(@Param('clave') clave: string, @Query() filtros: ConsultaReporteSstDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.reportesService.generar(clave, filtros, usuario);
  }
}
