import { Injectable } from '@nestjs/common';
import { PERMISOS } from '../auth/permisos.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { CarteraService } from '../cartera/cartera.service.js';
import { ComisionesService } from '../comisiones/comisiones.service.js';
import { FiltroPeriodoDto } from '../finanzas/dto/filtro-periodo.dto.js';
import { FinanzasService } from '../finanzas/finanzas.service.js';
import { combinarPorProyecto } from './resumen.js';
import type { ResumenDashboard } from './resumen-dashboard.js';

@Injectable()
export class DashboardService {
  constructor(
    private readonly finanzasService: FinanzasService,
    private readonly carteraService: CarteraService,
    private readonly comisionesService: ComisionesService,
  ) {}

  async resumen(filtro: FiltroPeriodoDto, usuario: UsuarioAutenticado): Promise<ResumenDashboard> {
    const [finanzas, cartera, comisionesPendientes] = await Promise.all([
      this.finanzasService.consolidado(filtro, usuario),
      this.carteraService.reportePorProyecto(usuario),
      // RF-REP-02: solo para quien puede consultar comisiones.
      usuario.permisos.includes(PERMISOS.COMISIONES_VER) ? this.comisionesService.pendientes(usuario) : Promise.resolve(undefined),
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
      comisionesPendientes,
    };
  }
}
