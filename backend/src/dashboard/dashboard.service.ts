import { Injectable } from '@nestjs/common';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { CarteraService } from '../cartera/cartera.service.js';
import { FiltroPeriodoDto } from '../finanzas/dto/filtro-periodo.dto.js';
import { FinanzasService } from '../finanzas/finanzas.service.js';
import { combinarPorProyecto } from './resumen.js';
import type { ResumenDashboard } from './resumen-dashboard.js';

@Injectable()
export class DashboardService {
  constructor(
    private readonly finanzasService: FinanzasService,
    private readonly carteraService: CarteraService,
  ) {}

  async resumen(filtro: FiltroPeriodoDto, usuario: UsuarioAutenticado): Promise<ResumenDashboard> {
    const [finanzas, cartera] = await Promise.all([
      this.finanzasService.consolidado(filtro, usuario),
      this.carteraService.reportePorProyecto(usuario),
    ]);

    return {
      periodo: { desde: filtro.desde ?? null, hasta: filtro.hasta ?? null },
      finanzas: {
        ingresosPorVentas: finanzas.ingresosPorVentas,
        ingresosGenerales: finanzas.ingresosGenerales,
        gastos: finanzas.gastos,
        totalIngresos: finanzas.totalIngresos,
        cajaNeta: finanzas.cajaNeta,
      },
      cartera: cartera.consolidado,
      porProyecto: combinarPorProyecto(finanzas.porProyecto, cartera.porProyecto),
    };
  }
}
