import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { FiltroPeriodoDto } from '../finanzas/dto/filtro-periodo.dto.js';
import { DashboardService } from './dashboard.service.js';
import { ExportarDashboardDto } from './dto/exportar-dashboard.dto.js';
import { generarExcelResumen } from './generar-excel.js';
import { generarPdfResumen } from './generar-pdf.js';

@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly configuracion: ConfiguracionService,
  ) {}

  @Get()
  resumen(@Query() filtro: FiltroPeriodoDto) {
    return this.dashboardService.resumen(filtro);
  }

  @Get('exportar')
  async exportar(@Query() query: ExportarDashboardDto, @Res() res: Response) {
    const [resumen, empresa] = await Promise.all([
      this.dashboardService.resumen(query),
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
