import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CarteraService } from '../cartera/cartera.service.js';
import type { ComisionesService } from '../comisiones/comisiones.service.js';
import type { FinanzasService } from '../finanzas/finanzas.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import { DashboardService } from './dashboard.service.js';

const D = (valor: number) => new Prisma.Decimal(valor);
const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';

const FINANZAS = {
  ingresosPorVentas: D(10_000_000),
  ingresosGenerales: D(1_000_000),
  gastos: D(4_000_000),
  totalIngresos: D(11_000_000),
  cajaNeta: D(7_000_000),
  porProyecto: [
    { proyectoId: P1, nombre: 'Proyecto Uno', ingresosPorVentas: D(6_000_000), ingresosGenerales: D(0), gastos: D(1_000_000), totalIngresos: D(6_000_000), cajaNeta: D(5_000_000) },
    { proyectoId: P2, nombre: 'Proyecto Dos', ingresosPorVentas: D(4_000_000), ingresosGenerales: D(1_000_000), gastos: D(1_000_000), totalIngresos: D(5_000_000), cajaNeta: D(4_000_000) },
  ],
};
const CARTERA = {
  moraConfigurada: true,
  diasAlerta: 5,
  consolidado: { saldoVencido: D(3_000_000), interesMora: D(60_000), saldoPorVencer: D(9_000_000), saldoProximoAVencer: D(2_000_000) },
  porProyecto: [
    { proyectoId: P1, nombre: 'Proyecto Uno', saldoVencido: D(1_000_000), interesMora: D(20_000), saldoPorVencer: D(4_000_000), saldoProximoAVencer: D(500_000) },
    { proyectoId: P2, nombre: 'Proyecto Dos', saldoVencido: D(2_000_000), interesMora: D(40_000), saldoPorVencer: D(5_000_000), saldoProximoAVencer: D(1_500_000) },
  ],
};

describe('DashboardService.resumen (RF-REP-01 y 02)', () => {
  let prisma: { lote: { groupBy: ReturnType<typeof vi.fn> }; cierreCaja: { count: ReturnType<typeof vi.fn> }; proyecto: { findUnique: ReturnType<typeof vi.fn> } };
  let comisiones: { pendientes: ReturnType<typeof vi.fn> };
  let service: DashboardService;

  const GERENTE = { ...usuarioDePrueba(), permisos: ['dashboard.ver', 'comisiones.ver', 'caja.ver'] };

  beforeEach(() => {
    prisma = {
      lote: { groupBy: vi.fn().mockResolvedValue([{ estado: 'VENDIDO', _count: { _all: 7 } }, { estado: 'DISPONIBLE', _count: { _all: 3 } }]) },
      cierreCaja: { count: vi.fn().mockResolvedValue(2) },
      proyecto: { findUnique: vi.fn().mockResolvedValue({ id: P1, nombre: 'Proyecto Uno' }) },
    };
    comisiones = { pendientes: vi.fn().mockResolvedValue({ cantidad: 4, valor: D(3_000_000) }) };
    service = new DashboardService(
      { consolidado: vi.fn().mockResolvedValue(FINANZAS) } as unknown as FinanzasService,
      { reportePorProyecto: vi.fn().mockResolvedValue(CARTERA) } as unknown as CarteraService,
      comisiones as unknown as ComisionesService,
      prisma as unknown as PrismaService,
    );
  });

  it('sin proyecto muestra el consolidado de todos, los lotes por estado (con ceros) y las alertas', async () => {
    const resumen = await service.resumen({}, GERENTE);
    expect(resumen.proyecto).toBeNull();
    expect(resumen.finanzas.cajaNeta.toString()).toBe('7000000');
    expect(resumen.cartera).toMatchObject({ diasAlerta: 5 });
    expect(resumen.cartera.saldoProximoAVencer.toString()).toBe('2000000');
    expect(resumen.lotesPorEstado).toEqual({ DISPONIBLE: 3, SEPARADO: 0, VENDIDO: 7, ESCRITURADO: 0, DESISTIDO: 0 });
    expect(resumen.porProyecto).toHaveLength(2);
    expect(resumen.comisionesPendientes?.cantidad).toBe(4);
    expect(resumen.cierresPorAprobar).toBe(2);
  });

  it('con un proyecto elegido todo el panel es de ese proyecto', async () => {
    const resumen = await service.resumen({ proyectoId: P1 }, GERENTE);
    expect(resumen.proyecto).toEqual({ id: P1, nombre: 'Proyecto Uno' });
    expect(resumen.finanzas).toMatchObject({ gastos: D(1_000_000), cajaNeta: D(5_000_000) });
    expect(resumen.finanzas.totalIngresos.toString()).toBe('6000000');
    expect(resumen.cartera.saldoVencido.toString()).toBe('1000000');
    expect(resumen.cartera.saldoProximoAVencer.toString()).toBe('500000');
    expect(resumen.porProyecto.map((fila) => fila.nombre)).toEqual(['Proyecto Uno']);
    expect(prisma.lote.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ proyectoId: P1 }) }));
    expect(comisiones.pendientes).toHaveBeenCalledWith(GERENTE, P1);
  });

  it('un proyecto fuera del alcance responde 404', async () => {
    await expect(service.resumen({ proyectoId: P2 }, { ...usuarioDePrueba([P1]), permisos: ['dashboard.ver'] })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('las comisiones y los cierres por aprobar solo se muestran a quien tiene el permiso y el alcance', async () => {
    const sinPermisos = await service.resumen({}, { ...usuarioDePrueba(), permisos: ['dashboard.ver'] });
    expect(sinPermisos.comisionesPendientes).toBeUndefined();
    expect(sinPermisos.cierresPorAprobar).toBeUndefined();

    const restringido = await service.resumen({}, { ...usuarioDePrueba([P1]), permisos: ['dashboard.ver', 'caja.ver'] });
    expect(restringido.cierresPorAprobar).toBeUndefined();
    expect(prisma.cierreCaja.count).toHaveBeenCalledTimes(0);
  });

  it('un proyecto sin movimientos sale en ceros', async () => {
    const resumen = await service.resumen({ proyectoId: P1 }, GERENTE);
    expect(resumen.finanzas.ingresosGenerales.toString()).toBe('0');
    // Un proyecto que no está en ninguna de las dos listas:
    service = new DashboardService(
      { consolidado: vi.fn().mockResolvedValue({ ...FINANZAS, porProyecto: [] }) } as unknown as FinanzasService,
      { reportePorProyecto: vi.fn().mockResolvedValue({ ...CARTERA, porProyecto: [] }) } as unknown as CarteraService,
      comisiones as unknown as ComisionesService,
      prisma as unknown as PrismaService,
    );
    const vacio = await service.resumen({ proyectoId: P1 }, GERENTE);
    expect(vacio.finanzas.cajaNeta.toString()).toBe('0');
    expect(vacio.cartera.saldoVencido.toString()).toBe('0');
    expect(vacio.porProyecto).toEqual([]);
  });
});
