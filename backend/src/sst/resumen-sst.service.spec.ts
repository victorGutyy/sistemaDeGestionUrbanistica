import { describe, expect, it, vi } from 'vitest';
import type { CapacitacionesService } from './capacitaciones.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { EppService } from './epp.service.js';
import type { PlanTrabajoService } from './plan-trabajo.service.js';
import { ResumenSstService } from './resumen-sst.service.js';

function montar() {
  const epp = { reposiciones: vi.fn().mockResolvedValue({ diasAlerta: 15, resumen: { vencidos: 2, porReponer: 1, vigentes: 9 } }) };
  const plan = {
    listar: vi.fn().mockResolvedValue({
      anio: 2026,
      resumen: { avancePromedio: 62.5, cumplimiento: 40 },
      actividades: [{ alerta: 'VENCIDA' }, { alerta: 'VENCIDA' }, { alerta: 'PROXIMA' }, { alerta: 'AL_DIA' }, { alerta: 'SIN_ALERTA' }],
    }),
  };
  const capacitaciones = {
    listar: vi.fn().mockResolvedValue({
      anio: 2026,
      resumen: { total: 3, ejecutadas: 1, coberturaEjecutadas: 80 },
      capacitaciones: [{ alerta: 'PROXIMA' }, { alerta: 'PROXIMA' }, { alerta: 'SIN_ALERTA' }],
    }),
  };
  const recobroAusentismo = { count: vi.fn().mockResolvedValue(4) };
  const servicio = new ResumenSstService(
    epp as unknown as EppService,
    plan as unknown as PlanTrabajoService,
    capacitaciones as unknown as CapacitacionesService,
    { recobroAusentismo } as unknown as PrismaService,
  );
  return { epp, plan, capacitaciones, recobroAusentismo, servicio };
}

describe('ResumenSstService (panel)', () => {
  it('junta lo que pide atención de EPP, plan y capacitaciones, y suma el total', async () => {
    const r = await montar().servicio.obtener(new Date(2026, 5, 10));
    expect(r).toEqual({
      epp: { vencidos: 2, porReponer: 1 },
      plan: { anio: 2026, vencidas: 2, proximas: 1, avancePromedio: 62.5, cumplimiento: 40 },
      capacitaciones: { anio: 2026, vencidas: 0, proximas: 2, coberturaEjecutadas: 80 },
      recobros: { pendientes: 4 },
      diasAlerta: 15,
      // Los recobros por radicar no suman: no tienen plazo.
      totalAlertas: 2 + 1 + 2 + 1 + 0 + 2,
    });
  });

  it('cuenta solo los recobros pendientes de ausentismos vigentes', async () => {
    const m = montar();
    await m.servicio.obtener();
    expect(m.recobroAusentismo.count).toHaveBeenCalledWith({ where: { estado: 'PENDIENTE', ausentismo: { anulada: false } } });
  });

  it('usa los mismos cálculos de cada pantalla, con la misma fecha de referencia', async () => {
    const m = montar();
    const hoy = new Date(2026, 5, 10);
    await m.servicio.obtener(hoy);
    expect(m.epp.reposiciones).toHaveBeenCalledWith({}, hoy);
    expect(m.plan.listar).toHaveBeenCalledWith({}, hoy);
    expect(m.capacitaciones.listar).toHaveBeenCalledWith({}, hoy);
  });

  it('sin nada pendiente el total es cero', async () => {
    const m = montar();
    m.epp.reposiciones.mockResolvedValue({ diasAlerta: 15, resumen: { vencidos: 0, porReponer: 0, vigentes: 4 } });
    m.plan.listar.mockResolvedValue({ anio: 2026, resumen: { avancePromedio: 0, cumplimiento: 0 }, actividades: [] });
    m.capacitaciones.listar.mockResolvedValue({ anio: 2026, resumen: { total: 0, ejecutadas: 0, coberturaEjecutadas: null }, capacitaciones: [] });
    expect((await m.servicio.obtener()).totalAlertas).toBe(0);
  });
});
