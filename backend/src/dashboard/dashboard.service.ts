import { Injectable } from '@nestjs/common';
import { exigirProyecto, filtroLote, tieneAlcanceTotal } from '../auth/alcance.js';
import { PERMISOS } from '../auth/permisos.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { CarteraService } from '../cartera/cartera.service.js';
import { ComisionesService } from '../comisiones/comisiones.service.js';
import { VerificacionService } from '../abonos/verificacion.service.js';
import { FinanzasService } from '../finanzas/finanzas.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoCierre, EstadoLote } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FiltroPanelDto } from './dto/filtro-panel.dto.js';
import { combinarPorProyecto } from './resumen.js';
import type { ResumenDashboard } from './resumen-dashboard.js';

const CERO = () => new Prisma.Decimal(0);

@Injectable()
export class DashboardService {
  constructor(
    private readonly finanzasService: FinanzasService,
    private readonly carteraService: CarteraService,
    private readonly comisionesService: ComisionesService,
    private readonly prisma: PrismaService,
    private readonly verificacionService: VerificacionService,
  ) {}

  async resumen(filtro: FiltroPanelDto, usuario: UsuarioAutenticado): Promise<ResumenDashboard> {
    const proyectoId = filtro.proyectoId;
    if (proyectoId) {
      exigirProyecto(usuario, proyectoId, `No existe el proyecto ${proyectoId}`);
    }

    const [finanzas, cartera, comisionesPendientes, lotes, cierresPorAprobar, proyecto, consignacionesPorVerificar] = await Promise.all([
      this.finanzasService.consolidado(filtro, usuario),
      this.carteraService.reportePorProyecto(usuario),
      // RF-REP-02: solo para quien puede consultar comisiones.
      usuario.permisos.includes(PERMISOS.COMISIONES_VER) ? this.comisionesService.pendientes(usuario, proyectoId) : Promise.resolve(undefined),
      this.prisma.lote.groupBy({ by: ['estado'], where: { AND: [filtroLote(usuario)], proyectoId }, _count: { _all: true } }),
      // Los cierres de caja son de toda la empresa: solo los ve quien tiene la caja y alcance total.
      usuario.permisos.includes(PERMISOS.CAJA_VER) && tieneAlcanceTotal(usuario)
        ? this.prisma.cierreCaja.count({ where: { estado: EstadoCierre.CERRADO } })
        : Promise.resolve(undefined),
      proyectoId ? this.prisma.proyecto.findUnique({ where: { id: proyectoId }, select: { id: true, nombre: true } }) : Promise.resolve(null),
      // RF-NOT-07 y RF-REP-02: solo para quien puede verificar abonos.
      usuario.permisos.includes(PERMISOS.ABONOS_VERIFICAR) ? this.verificacionService.resumenPorVerificar(usuario, proyectoId) : Promise.resolve(undefined),
    ]);

    const porProyecto = combinarPorProyecto(finanzas.porProyecto, cartera.porProyecto);
    // Con un proyecto elegido, el panel muestra solo su fila (la nómina, que es de toda la empresa, queda fuera).
    const fila = proyectoId ? porProyecto.find((candidata) => candidata.proyectoId === proyectoId) : undefined;
    const lotesPorEstado = Object.fromEntries(Object.values(EstadoLote).map((estado) => [estado, 0])) as Record<EstadoLote, number>;
    for (const grupo of lotes) lotesPorEstado[grupo.estado] = grupo._count._all;

    return {
      periodo: { desde: filtro.desde ?? null, hasta: filtro.hasta ?? null },
      proyecto,
      finanzas: proyectoId
        ? {
            ingresosPorVentas: fila?.ingresosPorVentas ?? CERO(),
            ingresosGenerales: fila?.ingresosGenerales ?? CERO(),
            gastos: fila?.gastos ?? CERO(),
            totalIngresos: (fila?.ingresosPorVentas ?? CERO()).plus(fila?.ingresosGenerales ?? CERO()),
            cajaNeta: fila?.cajaNeta ?? CERO(),
          }
        : {
            ingresosPorVentas: finanzas.ingresosPorVentas,
            ingresosGenerales: finanzas.ingresosGenerales,
            gastos: finanzas.gastos,
            totalIngresos: finanzas.totalIngresos,
            cajaNeta: finanzas.cajaNeta,
          },
      cartera: proyectoId
        ? {
            saldoVencido: fila?.saldoVencido ?? CERO(),
            interesMora: fila?.interesMora ?? CERO(),
            saldoPorVencer: fila?.saldoPorVencer ?? CERO(),
            saldoProximoAVencer: fila?.saldoProximoAVencer ?? CERO(),
            diasAlerta: cartera.diasAlerta,
          }
        : { ...cartera.consolidado, diasAlerta: cartera.diasAlerta },
      lotesPorEstado,
      porProyecto: proyectoId ? (fila ? [fila] : []) : porProyecto,
      comisionesPendientes,
      cierresPorAprobar,
      consignacionesPorVerificar,
    };
  }
}
