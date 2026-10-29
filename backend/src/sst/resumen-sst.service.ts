import { Injectable } from '@nestjs/common';
import { EstadoRecobro } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CapacitacionesService } from './capacitaciones.service.js';
import { EppService } from './epp.service.js';
import { PlanTrabajoService } from './plan-trabajo.service.js';

// Lo que pide atención en la gestión SST, para el panel (RF-SST-14, 16 y 20): EPP vencidos o por reponer, actividades del plan
// y capacitaciones del año en curso que están próximas o vencidas, más los recobros de incapacidades que faltan por radicar
// (RF-SST-09; solo el número, sin valores). Reutiliza los mismos cálculos de cada pantalla, así lo que
// dice el panel coincide con lo que se ve al entrar a cada una.
@Injectable()
export class ResumenSstService {
  constructor(
    private readonly epp: EppService,
    private readonly plan: PlanTrabajoService,
    private readonly capacitaciones: CapacitacionesService,
    private readonly prisma: PrismaService,
  ) {}

  async obtener(hoy = new Date()) {
    const [epp, plan, capacitaciones, recobrosPendientes] = await Promise.all([
      this.epp.reposiciones({}, hoy),
      this.plan.listar({}, hoy),
      this.capacitaciones.listar({}, hoy),
      // Los de ausentismos anulados no cuentan: ya no hay nada que cobrar.
      this.prisma.recobroAusentismo.count({ where: { estado: EstadoRecobro.PENDIENTE, ausentismo: { anulada: false } } }),
    ]);

    const resumen = {
      epp: { vencidos: epp.resumen.vencidos, porReponer: epp.resumen.porReponer },
      plan: {
        anio: plan.anio,
        vencidas: plan.actividades.filter((a) => a.alerta === 'VENCIDA').length,
        proximas: plan.actividades.filter((a) => a.alerta === 'PROXIMA').length,
        avancePromedio: plan.resumen.avancePromedio,
        cumplimiento: plan.resumen.cumplimiento,
      },
      capacitaciones: {
        anio: capacitaciones.anio,
        vencidas: capacitaciones.capacitaciones.filter((c) => c.alerta === 'VENCIDA').length,
        proximas: capacitaciones.capacitaciones.filter((c) => c.alerta === 'PROXIMA').length,
        coberturaEjecutadas: capacitaciones.resumen.coberturaEjecutadas,
      },
      // Sin plazo que vigilar: es una cola de trabajo, por eso no entra en totalAlertas.
      recobros: { pendientes: recobrosPendientes },
    };

    return {
      ...resumen,
      diasAlerta: epp.diasAlerta,
      // Todo lo que pide atención, sumado: lo que se muestra como número grande en el panel.
      totalAlertas: resumen.epp.vencidos + resumen.epp.porReponer + resumen.plan.vencidas + resumen.plan.proximas + resumen.capacitaciones.vencidas + resumen.capacitaciones.proximas,
    };
  }
}
