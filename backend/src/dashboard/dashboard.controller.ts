import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUsuario } from '../auth/current-usuario.decorator.js';
import { PERMISOS } from '../auth/permisos.js';
import { Permiso } from '../auth/roles.decorator.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { DashboardService } from './dashboard.service.js';
import { ExportarDashboardDto } from './dto/exportar-dashboard.dto.js';
import { FiltroPanelDto } from './dto/filtro-panel.dto.js';
import { generarExcelResumen } from './generar-excel.js';
import { generarPdfResumen } from './generar-pdf.js';

@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly configuracion: ConfiguracionService,
  ) {}

  @Permiso(PERMISOS.DASHBOARD_VER)
  @Get()
  resumen(@Query() filtro: FiltroPanelDto, @CurrentUsuario() usuario: UsuarioAutenticado) {
    return this.dashboardService.resumen(filtro, usuario);
  }

  @Permiso(PERMISOS.DASHBOARD_VER)
  @Get('exportar')
  async exportar(@Query() query: ExportarDashboardDto, @CurrentUsuario() usuario: UsuarioAutenticado, @Res() res: Response) {
    const [resumen, empresa] = await Promise.all([
      this.dashboardService.resumen(query, usuario),
      this.configuracion.obtenerEmpresa(),
    ]);

    if (query.formato === 'excel') {
      const buffer = await generarExcelResumen(resumen, empresa);
      res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="reporte-general.xlsx"',
      });
      res.send(buffer);
      return;
    }

    const buffer = await generarPdfResumen(resumen, empresa);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="reporte-general.pdf"',
    });
    res.send(buffer);
  }
}
