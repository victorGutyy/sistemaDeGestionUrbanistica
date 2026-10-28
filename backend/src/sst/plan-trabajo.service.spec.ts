import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { auditoriaDe, auditoriasDe } from '../test-utils/auditoria.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import type { CrearActividadPlanDto } from './dto/plan.dto.js';
import { PlanTrabajoService } from './plan-trabajo.service.js';

const HOY = new Date(2026, 5, 10, 9, 0);
const dia = (mes: number, diaDelMes: number, anio = 2026) => new Date(anio, mes - 1, diaDelMes);

const ACTIVIDAD = {
  id: 'ac-1',
  anio: 2026,
  ciclo: 'PLANEAR',
  estandar: 'Recursos',
  actividad: 'Definir el presupuesto del SG-SST',
  meta: 'Presupuesto aprobado',
  responsable: 'Responsable Inventado',
  correoResponsable: 'responsable@ejemplo.test',
  fechaInicio: dia(2, 1),
  fechaFin: dia(2, 28),
  recursos: null as string | null,
  presupuesto: null as Prisma.Decimal | null,
  estado: 'PROGRAMADA',
  porcentajeAvance: 0,
  avisoProximaEn: null,
  avisoVencidaEn: null,
  creadaPorId: 'usuario-prueba',
  createdAt: new Date(2026, 0, 1),
};

const NUEVA = {
  anio: 2026,
  ciclo: 'PLANEAR' as const,
  estandar: 'Recursos',
  actividad: 'Definir el presupuesto del SG-SST',
  meta: 'Presupuesto aprobado',
  responsable: 'Responsable Inventado',
  correoResponsable: 'responsable@ejemplo.test',
  fechaInicio: '2026-02-01',
  fechaFin: '2026-02-28',
} satisfies CrearActividadPlanDto;

function montar(actual: object | null = ACTIVIDAD) {
  const tablas = {
    actividadPlan: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(actual), create: vi.fn(), update: vi.fn(), createMany: vi.fn(), count: vi.fn().mockResolvedValue(0) },
    registroAuditoria: { create: vi.fn() },
  };
  tablas.actividadPlan.create.mockImplementation(({ data }: { data: object }) => Promise.resolve({ id: 'ac-nueva', ...data }));
  tablas.actividadPlan.update.mockImplementation(({ data }: { data: object }) => Promise.resolve({ ...ACTIVIDAD, ...data }));
  tablas.actividadPlan.createMany.mockImplementation(({ data }: { data: unknown[] }) => Promise.resolve({ count: data.length }));
  const prisma = { ...tablas, $transaction: vi.fn((accion: (tx: typeof tablas) => unknown) => accion(tablas)) };
  const configuracion = { obtenerEmpresa: vi.fn().mockResolvedValue({ diasAlertaSst: 15 }) };
  return { tablas, servicio: new PlanTrabajoService(prisma as unknown as PrismaService, configuracion as unknown as ConfiguracionService) };
}

describe('PlanTrabajoService: consulta (RF-SST-15 y 16)', () => {
  it('lista el año con su cronograma, su alerta y el resumen de cumplimiento', async () => {
    const m = montar();
    m.tablas.actividadPlan.findMany.mockResolvedValue([
      { ...ACTIVIDAD, id: 'a', fechaInicio: dia(2, 1), fechaFin: dia(3, 15), estado: 'EJECUTADA', porcentajeAvance: 100 },
      { ...ACTIVIDAD, id: 'b', fechaInicio: dia(5, 1), fechaFin: dia(6, 1), estado: 'EN_EJECUCION', porcentajeAvance: 40 },
      { ...ACTIVIDAD, id: 'c', fechaInicio: dia(6, 1), fechaFin: dia(6, 20), estado: 'PROGRAMADA' },
      { ...ACTIVIDAD, id: 'd', fechaInicio: dia(9, 1), fechaFin: dia(9, 30), estado: 'PROGRAMADA' },
    ]);

    const r = await m.servicio.listar({}, HOY);

    expect(m.tablas.actividadPlan.findMany.mock.calls[0][0].where).toEqual({ anio: 2026 });
    expect(r.anio).toBe(2026);
    expect(r.resumen).toMatchObject({ total: 4, cumplimiento: 25 });
    const por = Object.fromEntries(r.actividades.map((a) => [a.id, a]));
    expect(por.a).toMatchObject({ alerta: 'SIN_ALERTA' });
    expect(por.a.meses.map((x, i) => (x ? i + 1 : 0)).filter(Boolean)).toEqual([2, 3]);
    expect(por.b).toMatchObject({ alerta: 'VENCIDA', diasRestantes: -9 });
    expect(por.c).toMatchObject({ alerta: 'PROXIMA', diasRestantes: 10 });
    expect(por.d).toMatchObject({ alerta: 'AL_DIA' });
  });

  it('puede pedir otro año y filtrar por estado sin alterar el resumen del año', async () => {
    const m = montar();
    m.tablas.actividadPlan.findMany.mockResolvedValue([
      { ...ACTIVIDAD, id: 'a', estado: 'EJECUTADA', porcentajeAvance: 100 },
      { ...ACTIVIDAD, id: 'b', estado: 'PROGRAMADA' },
    ]);
    const r = await m.servicio.listar({ anio: '2027', estado: 'PROGRAMADA' }, HOY);
    expect(m.tablas.actividadPlan.findMany.mock.calls[0][0].where).toEqual({ anio: 2027 });
    expect(r.actividades.map((a) => a.id)).toEqual(['b']);
    expect(r.resumen.total).toBe(2);
  });

  it('usa la anticipación configurada, no un número fijo', async () => {
    const m = montar();
    m.tablas.actividadPlan.findMany.mockResolvedValue([{ ...ACTIVIDAD, fechaInicio: dia(6, 1), fechaFin: dia(6, 20) }]);
    const configuracion = { obtenerEmpresa: vi.fn().mockResolvedValue({ diasAlertaSst: 5 }) };
    const servicio = new PlanTrabajoService({ ...m.tablas } as unknown as PrismaService, configuracion as unknown as ConfiguracionService);
    expect((await servicio.listar({}, HOY)).actividades[0].alerta).toBe('AL_DIA');
  });

  it('buscar una actividad que no existe da 404', async () => {
    await expect(montar(null).servicio.buscar('x')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('PlanTrabajoService.crear', () => {
  let m: ReturnType<typeof montar>;
  beforeEach(() => {
    m = montar();
  });

  it('crea la actividad programada y sin avance, con quién la creó, y la audita', async () => {
    await m.servicio.crear({ ...NUEVA, recursos: ' Horas del contratista ', presupuesto: '500000' }, usuarioDePrueba());

    const datos = m.tablas.actividadPlan.create.mock.calls[0][0].data;
    expect(datos).toMatchObject({ anio: 2026, estado: 'PROGRAMADA', porcentajeAvance: 0, recursos: 'Horas del contratista', creadaPorId: 'usuario-prueba' });
    expect(datos.presupuesto.toString()).toBe('500000');
    expect(datos.fechaInicio).toEqual(dia(2, 1));
    expect(auditoriaDe(m.tablas.registroAuditoria.create, 'ACTIVIDAD_SST_CREAR')).toMatchObject({ entidad: 'ACTIVIDAD_SST', entidadId: 'ac-nueva' });
  });

  it('una actividad ejecutada queda siempre en 100 %, aunque se envíe otro avance', async () => {
    await m.servicio.crear({ ...NUEVA, estado: 'EJECUTADA', porcentajeAvance: 60 }, usuarioDePrueba());
    expect(m.tablas.actividadPlan.create.mock.calls[0][0].data).toMatchObject({ estado: 'EJECUTADA', porcentajeAvance: 100 });
  });

  it('sin presupuesto ni recursos quedan vacíos', async () => {
    await m.servicio.crear(NUEVA, usuarioDePrueba());
    expect(m.tablas.actividadPlan.create.mock.calls[0][0].data).toMatchObject({ presupuesto: null, recursos: null });
  });

  it('rechaza una fecha de fin anterior a la de inicio', async () => {
    await expect(m.servicio.crear({ ...NUEVA, fechaFin: '2026-01-15' }, usuarioDePrueba())).rejects.toThrow(/anterior/);
  });

  it('rechaza fechas fuera del año del plan (el cronograma es de ese año)', async () => {
    await expect(m.servicio.crear({ ...NUEVA, fechaFin: '2027-01-05' }, usuarioDePrueba())).rejects.toThrow(/dentro de 2026/);
    await expect(m.servicio.crear({ ...NUEVA, fechaInicio: '2025-12-20' }, usuarioDePrueba())).rejects.toThrow(/dentro de 2026/);
    expect(m.tablas.actividadPlan.create).not.toHaveBeenCalled();
  });

  it('rechaza una fecha inválida y no deja nada en la auditoría', async () => {
    await expect(m.servicio.crear({ ...NUEVA, fechaInicio: 'no-es-fecha' }, usuarioDePrueba())).rejects.toBeInstanceOf(BadRequestException);
    expect(auditoriasDe(m.tablas.registroAuditoria.create)).toHaveLength(0);
  });
});

describe('PlanTrabajoService.actualizar', () => {
  it('deja en la auditoría solo lo que cambió, con su valor anterior', async () => {
    const m = montar();
    await m.servicio.actualizar('ac-1', { responsable: 'Otra Persona', porcentajeAvance: 30, estado: 'EN_EJECUCION' }, usuarioDePrueba());

    const registro = auditoriaDe(m.tablas.registroAuditoria.create, 'ACTIVIDAD_SST_EDITAR');
    expect(registro.resumen).toMatch(/: responsable, estado, avance$/);
    expect(registro.antes).toEqual({ responsable: 'Responsable Inventado', estado: 'PROGRAMADA', porcentajeAvance: 0 });
    expect(registro.despues).toEqual({ responsable: 'Otra Persona', estado: 'EN_EJECUCION', porcentajeAvance: 30 });
  });

  it('enviar los mismos valores no escribe ni audita', async () => {
    const m = montar();
    const r = await m.servicio.actualizar('ac-1', { ciclo: 'PLANEAR', actividad: ACTIVIDAD.actividad, fechaInicio: '2026-02-01', porcentajeAvance: 0 }, usuarioDePrueba());
    expect(r).toBe(ACTIVIDAD);
    expect(m.tablas.actividadPlan.update).not.toHaveBeenCalled();
    expect(auditoriasDe(m.tablas.registroAuditoria.create)).toHaveLength(0);
  });

  it('pasar a ejecutada fija el avance en 100', async () => {
    const m = montar();
    await m.servicio.actualizar('ac-1', { estado: 'EJECUTADA' }, usuarioDePrueba());
    expect(m.tablas.actividadPlan.update.mock.calls[0][0].data).toMatchObject({ estado: 'EJECUTADA', porcentajeAvance: 100 });
  });

  it('cambiar la fecha de fin vuelve a habilitar los avisos por correo', async () => {
    const m = montar({ ...ACTIVIDAD, avisoProximaEn: new Date(), avisoVencidaEn: new Date() });
    await m.servicio.actualizar('ac-1', { fechaFin: '2026-03-31' }, usuarioDePrueba());
    expect(m.tablas.actividadPlan.update.mock.calls[0][0].data).toMatchObject({ fechaFin: dia(3, 31), avisoProximaEn: null, avisoVencidaEn: null });
  });

  it('reabrir una actividad ejecutada o cancelada también vuelve a habilitar los avisos', async () => {
    const m = montar({ ...ACTIVIDAD, estado: 'EJECUTADA', porcentajeAvance: 100, avisoVencidaEn: new Date() });
    await m.servicio.actualizar('ac-1', { estado: 'EN_EJECUCION', porcentajeAvance: 70 }, usuarioDePrueba());
    expect(m.tablas.actividadPlan.update.mock.calls[0][0].data).toMatchObject({ estado: 'EN_EJECUCION', avisoProximaEn: null, avisoVencidaEn: null });
  });

  it('un cambio que no toca fechas ni reabre no reinicia los avisos', async () => {
    const m = montar({ ...ACTIVIDAD, avisoProximaEn: new Date() });
    await m.servicio.actualizar('ac-1', { responsable: 'Otra Persona' }, usuarioDePrueba());
    expect('avisoProximaEn' in m.tablas.actividadPlan.update.mock.calls[0][0].data).toBe(false);
  });

  it('un texto vacío en presupuesto lo borra; en recursos también', async () => {
    const m = montar({ ...ACTIVIDAD, presupuesto: new Prisma.Decimal('500000'), recursos: 'Algo' });
    await m.servicio.actualizar('ac-1', { presupuesto: '', recursos: '  ' }, usuarioDePrueba());
    expect(m.tablas.actividadPlan.update.mock.calls[0][0].data).toEqual({ presupuesto: null, recursos: null });
  });

  it('el presupuesto se compara como número: 500000.00 es lo mismo que 500000', async () => {
    const m = montar({ ...ACTIVIDAD, presupuesto: new Prisma.Decimal('500000') });
    await m.servicio.actualizar('ac-1', { presupuesto: '500000.00' }, usuarioDePrueba());
    expect(m.tablas.actividadPlan.update).not.toHaveBeenCalled();
  });

  it('valida las fechas junto con las que ya tenía y dentro de su año', async () => {
    const m = montar();
    await expect(m.servicio.actualizar('ac-1', { fechaFin: '2026-01-10' }, usuarioDePrueba())).rejects.toThrow(/anterior/);
    await expect(m.servicio.actualizar('ac-1', { fechaFin: '2027-02-10' }, usuarioDePrueba())).rejects.toThrow(/dentro de 2026/);
    expect(m.tablas.actividadPlan.update).not.toHaveBeenCalled();
  });

  it('editar una actividad que no existe da 404', async () => {
    await expect(montar(null).servicio.actualizar('x', { meta: 'Otra meta' }, usuarioDePrueba())).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('PlanTrabajoService.copiarAnio (RF-SST-17)', () => {
  const origen = [
    { ...ACTIVIDAD, id: 'a', fechaInicio: dia(2, 1), fechaFin: dia(2, 28), estado: 'EJECUTADA', porcentajeAvance: 100, presupuesto: new Prisma.Decimal('500000') },
    { ...ACTIVIDAD, id: 'b', fechaInicio: dia(5, 1), fechaFin: dia(5, 31), estado: 'CANCELADA' },
    { ...ACTIVIDAD, id: 'c', fechaInicio: dia(8, 1), fechaFin: dia(8, 31), estado: 'EN_EJECUCION', porcentajeAvance: 50 },
  ];

  it('copia las actividades no canceladas al año siguiente como borrador, y lo audita', async () => {
    const m = montar();
    m.tablas.actividadPlan.findMany.mockResolvedValue(origen);

    const r = await m.servicio.copiarAnio({ anioOrigen: 2026, anioDestino: 2027 }, usuarioDePrueba());

    expect(r).toEqual({ anioOrigen: 2026, anioDestino: 2027, copiadas: 2, canceladasOmitidas: 1 });
    const copiadas = m.tablas.actividadPlan.createMany.mock.calls[0][0].data;
    expect(copiadas).toHaveLength(2);
    expect(copiadas[0]).toMatchObject({ anio: 2027, estado: 'PROGRAMADA', porcentajeAvance: 0, fechaInicio: dia(2, 1, 2027), fechaFin: dia(2, 28, 2027), creadaPorId: 'usuario-prueba' });
    expect(copiadas[0].presupuesto.toString()).toBe('500000');
    expect(copiadas[1]).toMatchObject({ fechaInicio: dia(8, 1, 2027), estado: 'PROGRAMADA' });
    expect(auditoriaDe(m.tablas.registroAuditoria.create, 'ACTIVIDAD_SST_COPIAR_PLAN').despues).toMatchObject({ copiadas: 2, canceladasOmitidas: 1 });
  });

  it('no copia sobre un año que ya tiene actividades', async () => {
    const m = montar();
    m.tablas.actividadPlan.findMany.mockResolvedValue(origen);
    m.tablas.actividadPlan.count.mockResolvedValue(3);
    await expect(m.servicio.copiarAnio({ anioOrigen: 2026, anioDestino: 2027 }, usuarioDePrueba())).rejects.toBeInstanceOf(ConflictException);
    expect(m.tablas.actividadPlan.createMany).not.toHaveBeenCalled();
  });

  it('rechaza copiar al mismo año y copiar un plan vacío o solo de canceladas', async () => {
    const m = montar();
    await expect(m.servicio.copiarAnio({ anioOrigen: 2026, anioDestino: 2026 }, usuarioDePrueba())).rejects.toBeInstanceOf(BadRequestException);
    await expect(m.servicio.copiarAnio({ anioOrigen: 2026, anioDestino: 2027 }, usuarioDePrueba())).rejects.toThrow(/no tiene actividades para copiar/);
    m.tablas.actividadPlan.findMany.mockResolvedValue([origen[1]]);
    await expect(m.servicio.copiarAnio({ anioOrigen: 2026, anioDestino: 2027 }, usuarioDePrueba())).rejects.toThrow(/no tiene actividades para copiar/);
  });
});
