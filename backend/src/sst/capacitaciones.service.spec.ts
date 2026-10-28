import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { auditoriaDe, auditoriasDe } from '../test-utils/auditoria.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import type { CrearCapacitacionDto } from './dto/capacitaciones.dto.js';
import { CapacitacionesService } from './capacitaciones.service.js';

const HOY = new Date(2026, 5, 10, 9, 0);
const dia = (mes: number, diaDelMes: number, anio = 2026) => new Date(anio, mes - 1, diaDelMes);
const D = (valor: number | string) => new Prisma.Decimal(valor);

const CAPACITACION = {
  id: 'ca-1',
  tema: 'Trabajo seguro en alturas',
  objetivo: 'Reducir el riesgo de caídas',
  dirigidoA: 'Personal de obra',
  modalidad: 'PRESENCIAL',
  horas: D(2),
  fechaProgramada: dia(7, 15),
  fechaEjecucion: null as Date | null,
  responsable: 'Facilitador Inventado',
  correoResponsable: 'facilitador@ejemplo.test',
  ejecutor: 'INTERNO',
  asistentesProgramados: 10,
  estado: 'PROGRAMADA',
  evaluacionEficacia: null as Prisma.Decimal | null,
  avisoProximaEn: null,
  avisoVencidaEn: null,
};

const NUEVA = {
  tema: 'Trabajo seguro en alturas',
  objetivo: 'Reducir el riesgo de caídas',
  dirigidoA: 'Personal de obra',
  modalidad: 'PRESENCIAL' as const,
  horas: 2,
  fechaProgramada: '2026-07-15',
  responsable: 'Facilitador Inventado',
  correoResponsable: 'facilitador@ejemplo.test',
  ejecutor: 'INTERNO' as const,
  asistentesProgramados: 10,
} satisfies CrearCapacitacionDto;

const A = { id: 't-a', nombre: 'Ana Inventada', estado: 'ACTIVO' };
const B = { id: 't-b', nombre: 'Beto Inventado', estado: 'ACTIVO' };

function montar(actual: object | null = CAPACITACION) {
  const tablas = {
    capacitacion: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(actual), create: vi.fn(), update: vi.fn() },
    asistenciaCapacitacion: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn(), createMany: vi.fn(), update: vi.fn(), count: vi.fn().mockResolvedValue(0) },
    trabajador: { findMany: vi.fn().mockResolvedValue([A, B]) },
    registroAuditoria: { create: vi.fn() },
  };
  tablas.capacitacion.create.mockImplementation(({ data }: { data: object }) => Promise.resolve({ id: 'ca-nueva', ...data }));
  tablas.capacitacion.update.mockImplementation(({ data }: { data: object }) => Promise.resolve({ ...CAPACITACION, ...data }));
  tablas.asistenciaCapacitacion.createMany.mockImplementation(({ data }: { data: unknown[] }) => Promise.resolve({ count: data.length }));
  const prisma = { ...tablas, $transaction: vi.fn((accion: (tx: typeof tablas) => unknown) => accion(tablas)) };
  const configuracion = { obtenerEmpresa: vi.fn().mockResolvedValue({ diasAlertaSst: 15 }) };
  return { tablas, servicio: new CapacitacionesService(prisma as unknown as PrismaService, configuracion as unknown as ConfiguracionService) };
}

describe('CapacitacionesService: consulta (RF-SST-18, 19 y 20)', () => {
  it('lista el año con asistentes reales, cobertura y alerta', async () => {
    const m = montar();
    m.tablas.capacitacion.findMany.mockResolvedValue([
      { ...CAPACITACION, id: 'a', estado: 'EJECUTADA', fechaProgramada: dia(3, 1), fechaEjecucion: dia(3, 1), asistentesProgramados: 10, _count: { documentos: 1, asistencias: 8 } },
      { ...CAPACITACION, id: 'b', estado: 'PROGRAMADA', fechaProgramada: dia(6, 20), _count: { documentos: 0, asistencias: 0 } },
      { ...CAPACITACION, id: 'c', estado: 'PROGRAMADA', fechaProgramada: dia(6, 1), _count: { documentos: 0, asistencias: 0 } },
    ]);

    const r = await m.servicio.listar({}, HOY);

    const donde = m.tablas.capacitacion.findMany.mock.calls[0][0].where;
    expect(donde.fechaProgramada).toEqual({ gte: dia(1, 1), lte: dia(12, 31) });
    expect(r.resumen).toEqual({ total: 3, ejecutadas: 1, coberturaEjecutadas: 80 });
    const por = Object.fromEntries(r.capacitaciones.map((c) => [c.id, c]));
    expect(por.a).toMatchObject({ asistentesReales: 8, cobertura: 80, alerta: 'SIN_ALERTA', documentos: 1 });
    expect(por.b).toMatchObject({ alerta: 'PROXIMA', diasRestantes: 10 });
    expect(por.c).toMatchObject({ alerta: 'VENCIDA', diasRestantes: -9 });
  });

  it('cuenta solo las asistencias no anuladas', async () => {
    const m = montar();
    await m.servicio.listar({}, HOY);
    expect(m.tablas.capacitacion.findMany.mock.calls[0][0].include._count.select.asistencias).toEqual({ where: { anulada: false } });
  });

  it('la cobertura de las ejecutadas es null si no había asistentes programados', async () => {
    const m = montar();
    m.tablas.capacitacion.findMany.mockResolvedValue([{ ...CAPACITACION, estado: 'EJECUTADA', fechaEjecucion: dia(3, 1), asistentesProgramados: 0, _count: { documentos: 0, asistencias: 4 } }]);
    expect((await m.servicio.listar({}, HOY)).resumen.coberturaEjecutadas).toBeNull();
  });

  it('buscar trae la asistencia vigente con su cobertura y cuántas están anuladas', async () => {
    const m = montar({ ...CAPACITACION, asistencias: [{ id: 'as-1' }, { id: 'as-2' }, { id: 'as-3' }], documentos: [] });
    m.tablas.asistenciaCapacitacion.count.mockResolvedValue(2);
    const r = await m.servicio.buscar('ca-1', HOY);
    expect(r).toMatchObject({ asistentesReales: 3, cobertura: 30, asistenciasAnuladas: 2, alerta: 'AL_DIA' });
    expect(m.tablas.capacitacion.findUnique.mock.calls[0][0].include.asistencias.where).toEqual({ anulada: false });
  });

  it('buscar una capacitación que no existe da 404', async () => {
    await expect(montar(null).servicio.buscar('x')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CapacitacionesService.crear', () => {
  let m: ReturnType<typeof montar>;
  beforeEach(() => {
    m = montar();
  });

  it('crea la capacitación programada, con quién la creó, y la audita', async () => {
    await m.servicio.crear({ ...NUEVA, evaluacionEficacia: 4.5 }, usuarioDePrueba());
    const datos = m.tablas.capacitacion.create.mock.calls[0][0].data;
    expect(datos).toMatchObject({ estado: 'PROGRAMADA', fechaEjecucion: null, creadaPorId: 'usuario-prueba' });
    expect(datos.horas.toString()).toBe('2');
    expect(datos.evaluacionEficacia.toString()).toBe('4.5');
    expect(datos.fechaProgramada).toEqual(dia(7, 15));
    expect(auditoriaDe(m.tablas.registroAuditoria.create, 'CAPACITACION_CREAR')).toMatchObject({ entidad: 'CAPACITACION', entidadId: 'ca-nueva' });
  });

  it('una capacitación ejecutada exige su fecha de ejecución', async () => {
    await expect(m.servicio.crear({ ...NUEVA, estado: 'EJECUTADA' }, usuarioDePrueba())).rejects.toThrow(/fecha de ejecución/);
    await m.servicio.crear({ ...NUEVA, estado: 'EJECUTADA', fechaEjecucion: '2026-07-16' }, usuarioDePrueba());
    expect(m.tablas.capacitacion.create).toHaveBeenCalledTimes(1);
  });

  it('rechaza una fecha inválida', async () => {
    await expect(m.servicio.crear({ ...NUEVA, fechaProgramada: 'no-es-fecha' }, usuarioDePrueba())).rejects.toBeInstanceOf(BadRequestException);
    expect(auditoriasDe(m.tablas.registroAuditoria.create)).toHaveLength(0);
  });
});

describe('CapacitacionesService.actualizar', () => {
  it('deja en la auditoría solo lo que cambió, con su valor anterior', async () => {
    const m = montar();
    await m.servicio.actualizar('ca-1', { asistentesProgramados: 12, ejecutor: 'ARL' }, usuarioDePrueba());
    const registro = auditoriaDe(m.tablas.registroAuditoria.create, 'CAPACITACION_EDITAR');
    expect(registro.resumen).toMatch(/: ejecutor, asistentes programados$/);
    expect(registro.antes).toEqual({ ejecutor: 'INTERNO', asistentesProgramados: 10 });
    expect(registro.despues).toEqual({ ejecutor: 'ARL', asistentesProgramados: 12 });
  });

  it('enviar los mismos valores no escribe ni audita (las horas se comparan como número)', async () => {
    const m = montar();
    const r = await m.servicio.actualizar('ca-1', { tema: CAPACITACION.tema, horas: 2.0, fechaProgramada: '2026-07-15' }, usuarioDePrueba());
    expect(r).toBe(CAPACITACION);
    expect(m.tablas.capacitacion.update).not.toHaveBeenCalled();
  });

  it('pasar a ejecutada sin fecha de ejecución se rechaza; con fecha se acepta', async () => {
    const m = montar();
    await expect(m.servicio.actualizar('ca-1', { estado: 'EJECUTADA' }, usuarioDePrueba())).rejects.toThrow(/fecha de ejecución/);
    await m.servicio.actualizar('ca-1', { estado: 'EJECUTADA', fechaEjecucion: '2026-07-16', evaluacionEficacia: 4 }, usuarioDePrueba());
    expect(m.tablas.capacitacion.update.mock.calls[0][0].data).toMatchObject({ estado: 'EJECUTADA', fechaEjecucion: dia(7, 16) });
  });

  it('una ya ejecutada conserva su fecha de ejecución al editar otra cosa', async () => {
    const m = montar({ ...CAPACITACION, estado: 'EJECUTADA', fechaEjecucion: dia(7, 16) });
    await m.servicio.actualizar('ca-1', { responsable: 'Otra Persona' }, usuarioDePrueba());
    expect(m.tablas.capacitacion.update.mock.calls[0][0].data).toEqual({ responsable: 'Otra Persona' });
  });

  it('reprogramar (cambiar la fecha programada) vuelve a habilitar los avisos por correo', async () => {
    const m = montar({ ...CAPACITACION, avisoProximaEn: new Date(), avisoVencidaEn: new Date() });
    await m.servicio.actualizar('ca-1', { fechaProgramada: '2026-09-01', estado: 'REPROGRAMADA' }, usuarioDePrueba());
    expect(m.tablas.capacitacion.update.mock.calls[0][0].data).toMatchObject({ fechaProgramada: dia(9, 1), estado: 'REPROGRAMADA', avisoProximaEn: null, avisoVencidaEn: null });
  });

  it('un cambio que no toca la fecha ni reabre no reinicia los avisos', async () => {
    const m = montar({ ...CAPACITACION, avisoProximaEn: new Date() });
    await m.servicio.actualizar('ca-1', { horas: 3 }, usuarioDePrueba());
    expect('avisoProximaEn' in m.tablas.capacitacion.update.mock.calls[0][0].data).toBe(false);
  });

  it('editar una capacitación que no existe da 404', async () => {
    await expect(montar(null).servicio.actualizar('x', { horas: 3 }, usuarioDePrueba())).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CapacitacionesService: asistencia (RF-SST-19)', () => {
  let m: ReturnType<typeof montar>;
  beforeEach(() => {
    m = montar();
  });

  it('registra varios asistentes de una vez con su firma y calificación, y lo audita con los nombres', async () => {
    const r = await m.servicio.registrarAsistentes('ca-1', { asistentes: [{ trabajadorId: 't-a', firmo: true, calificacion: 4.5 }, { trabajadorId: 't-b' }] }, usuarioDePrueba());

    expect(r).toEqual({ registrados: 2, omitidos: 0 });
    const datos = m.tablas.asistenciaCapacitacion.createMany.mock.calls[0][0].data;
    expect(datos).toHaveLength(2);
    expect(datos[0]).toMatchObject({ capacitacionId: 'ca-1', trabajadorId: 't-a', firmo: true, registradaPorId: 'usuario-prueba' });
    expect(datos[0].calificacion.toString()).toBe('4.5');
    expect(datos[1]).toMatchObject({ firmo: false, calificacion: null });
    expect(auditoriaDe(m.tablas.registroAuditoria.create, 'CAPACITACION_ASISTENCIA_REGISTRAR').despues).toMatchObject({ registrados: 2, trabajadores: ['Ana Inventada', 'Beto Inventado'] });
  });

  it('omite a los que ya estaban registrados y lo dice', async () => {
    m.tablas.asistenciaCapacitacion.findMany.mockResolvedValue([{ trabajadorId: 't-a' }]);
    const r = await m.servicio.registrarAsistentes('ca-1', { asistentes: [{ trabajadorId: 't-a' }, { trabajadorId: 't-b' }] }, usuarioDePrueba());
    expect(r).toEqual({ registrados: 1, omitidos: 1 });
    expect(m.tablas.asistenciaCapacitacion.createMany.mock.calls[0][0].data.map((d: { trabajadorId: string }) => d.trabajadorId)).toEqual(['t-b']);
    expect(auditoriaDe(m.tablas.registroAuditoria.create, 'CAPACITACION_ASISTENCIA_REGISTRAR').resumen).toMatch(/1 ya estaban registrados/);
  });

  it('si todos ya estaban registrados no escribe ni audita', async () => {
    m.tablas.asistenciaCapacitacion.findMany.mockResolvedValue([{ trabajadorId: 't-a' }, { trabajadorId: 't-b' }]);
    const r = await m.servicio.registrarAsistentes('ca-1', { asistentes: [{ trabajadorId: 't-a' }, { trabajadorId: 't-b' }] }, usuarioDePrueba());
    expect(r).toEqual({ registrados: 0, omitidos: 2 });
    expect(m.tablas.asistenciaCapacitacion.createMany).not.toHaveBeenCalled();
    expect(auditoriasDe(m.tablas.registroAuditoria.create)).toHaveLength(0);
  });

  it('rechaza un trabajador repetido en la lista, uno que no existe y uno retirado', async () => {
    await expect(m.servicio.registrarAsistentes('ca-1', { asistentes: [{ trabajadorId: 't-a' }, { trabajadorId: 't-a' }] }, usuarioDePrueba())).rejects.toThrow(/repetido/);
    m.tablas.trabajador.findMany.mockResolvedValue([A]);
    await expect(m.servicio.registrarAsistentes('ca-1', { asistentes: [{ trabajadorId: 't-a' }, { trabajadorId: 't-b' }] }, usuarioDePrueba())).rejects.toBeInstanceOf(NotFoundException);
    m.tablas.trabajador.findMany.mockResolvedValue([A, { ...B, estado: 'INACTIVO' }]);
    await expect(m.servicio.registrarAsistentes('ca-1', { asistentes: [{ trabajadorId: 't-a' }, { trabajadorId: 't-b' }] }, usuarioDePrueba())).rejects.toThrow(/Beto Inventado/);
    expect(m.tablas.asistenciaCapacitacion.createMany).not.toHaveBeenCalled();
  });

  it('una capacitación cancelada no admite asistentes, y una que no existe da 404', async () => {
    m.tablas.capacitacion.findUnique.mockResolvedValue({ ...CAPACITACION, estado: 'CANCELADA' });
    await expect(m.servicio.registrarAsistentes('ca-1', { asistentes: [{ trabajadorId: 't-a' }] }, usuarioDePrueba())).rejects.toThrow(/cancelada/);
    m.tablas.capacitacion.findUnique.mockResolvedValue(null);
    await expect(m.servicio.registrarAsistentes('x', { asistentes: [{ trabajadorId: 't-a' }] }, usuarioDePrueba())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('si otra persona registró al mismo trabajador al mismo tiempo, la base lo impide y se responde con conflicto', async () => {
    m.tablas.trabajador.findMany.mockResolvedValue([A]);
    m.tablas.asistenciaCapacitacion.createMany.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));
    await expect(m.servicio.registrarAsistentes('ca-1', { asistentes: [{ trabajadorId: 't-a' }] }, usuarioDePrueba())).rejects.toBeInstanceOf(ConflictException);
  });

  const ASISTENCIA = { id: 'as-1', capacitacionId: 'ca-1', trabajadorId: 't-a', firmo: false, calificacion: null as Prisma.Decimal | null, anulada: false, trabajador: { id: 't-a', nombre: 'Ana Inventada', documento: '1', cargo: 'Oficial' } };

  it('editar la firma y la calificación deja lo anterior y lo nuevo en la auditoría', async () => {
    m.tablas.asistenciaCapacitacion.findFirst.mockResolvedValue(ASISTENCIA);
    m.tablas.asistenciaCapacitacion.update.mockImplementation(({ data }: { data: object }) => Promise.resolve({ ...ASISTENCIA, ...data }));
    await m.servicio.actualizarAsistencia('ca-1', 'as-1', { firmo: true, calificacion: 4.5 }, usuarioDePrueba());
    const registro = auditoriaDe(m.tablas.registroAuditoria.create, 'CAPACITACION_ASISTENCIA_EDITAR');
    expect(registro.resumen).toMatch(/Ana Inventada \(firma, calificación\)/);
    expect(registro.antes).toEqual({ firmo: false, calificacion: null });
    expect(registro.despues).toMatchObject({ firmo: true, calificacion: '4.5' });
  });

  it('la calificación se borra con null; repetir el mismo valor no escribe', async () => {
    m.tablas.asistenciaCapacitacion.findFirst.mockResolvedValue({ ...ASISTENCIA, calificacion: D(4) });
    m.tablas.asistenciaCapacitacion.update.mockImplementation(({ data }: { data: object }) => Promise.resolve({ ...ASISTENCIA, ...data }));
    await m.servicio.actualizarAsistencia('ca-1', 'as-1', { calificacion: null }, usuarioDePrueba());
    expect(m.tablas.asistenciaCapacitacion.update.mock.calls[0][0].data).toEqual({ calificacion: null });

    m.tablas.asistenciaCapacitacion.update.mockClear();
    await m.servicio.actualizarAsistencia('ca-1', 'as-1', { calificacion: 4.0 }, usuarioDePrueba());
    expect(m.tablas.asistenciaCapacitacion.update).not.toHaveBeenCalled();
  });

  it('la asistencia debe ser de la capacitación de la ruta, y una anulada no se edita', async () => {
    m.tablas.asistenciaCapacitacion.findFirst.mockResolvedValue(null);
    await expect(m.servicio.actualizarAsistencia('ca-1', 'as-de-otra', { firmo: true }, usuarioDePrueba())).rejects.toBeInstanceOf(NotFoundException);
    expect(m.tablas.asistenciaCapacitacion.findFirst.mock.calls[0][0].where).toEqual({ id: 'as-de-otra', capacitacionId: 'ca-1' });
    m.tablas.asistenciaCapacitacion.findFirst.mockResolvedValue({ ...ASISTENCIA, anulada: true });
    await expect(m.servicio.actualizarAsistencia('ca-1', 'as-1', { firmo: true }, usuarioDePrueba())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('anular deja quién, cuándo y por qué, y lo audita; no se anula dos veces', async () => {
    m.tablas.asistenciaCapacitacion.findFirst.mockResolvedValue(ASISTENCIA);
    m.tablas.asistenciaCapacitacion.update.mockImplementation(({ data }: { data: object }) => Promise.resolve({ ...ASISTENCIA, ...data }));
    await m.servicio.anularAsistencia('ca-1', 'as-1', { motivo: '  No asistió ' }, usuarioDePrueba());
    const datos = m.tablas.asistenciaCapacitacion.update.mock.calls[0][0].data;
    expect(datos).toMatchObject({ anulada: true, anuladaPorId: 'usuario-prueba', motivoAnulacion: 'No asistió' });
    expect(datos.anuladaEn).toBeInstanceOf(Date);
    expect(auditoriaDe(m.tablas.registroAuditoria.create, 'CAPACITACION_ASISTENCIA_ANULAR').resumen).toMatch(/Ana Inventada: No asistió/);

    m.tablas.asistenciaCapacitacion.findFirst.mockResolvedValue({ ...ASISTENCIA, anulada: true });
    await expect(m.servicio.anularAsistencia('ca-1', 'as-1', { motivo: 'Otro motivo' }, usuarioDePrueba())).rejects.toBeInstanceOf(ConflictException);
  });
});
