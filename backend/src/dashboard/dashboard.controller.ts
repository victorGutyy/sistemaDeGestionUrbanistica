import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { FiltroPeriodoDto } from '../finanzas/dto/filtro-periodo.dto.js';
import { DashboardService } from './dashboard.service.js';
import { ExportarDashboardDto } from './dto/exportar-dashboard.dto.js';
import { generarExcelResumen } from './generar-excel.js';
import { generarPdfResumen } from './generar-pdf.js';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  resumen(@Query() filtro: FiltroPeriodoDto) {
    return this.dashboardService.resumen(filtro);
  }

  @Get('exportar')
  async exportar(@Query() query: ExportarDashboardDto, @Res() res: Response) {
    const resumen = await this.dashboardService.resumen(query);

    if (query.formato === 'excel') {
      const buffer = await generarExcelResumen(resumen);
      res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="reporte-general.xlsx"',
      });
      res.send(buffer);
      return;
    }

    const buffer = await generarPdfResumen(resumen);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="reporte-general.pdf"',
    });
    res.send(buffer);
  }
}
