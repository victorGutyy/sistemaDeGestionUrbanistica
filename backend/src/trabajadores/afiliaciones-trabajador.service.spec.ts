import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { auditoriaDe, auditoriasDe } from '../test-utils/auditoria.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import { AfiliacionesTrabajadorService } from './afiliaciones-trabajador.service.js';

const TRABAJADOR = { id: 't-1', nombre: 'Persona Inventada', fechaIngreso: new Date(2026, 0, 1) };
const EPS_A = { id: 'eps-a', tipo: 'EPS', nombre: 'Salud Inventada A', activa: true };
const EPS_B = { id: 'eps-b', tipo: 'EPS', nombre: 'Salud Inventada B', activa: true };
const ARL_A = { id: 'arl-a', tipo: 'ARL', nombre: 'Riesgos Inventados', activa: true };
const CLASE_3 = { id: 'clase-3', clase: 3, tasa: '2.436', activa: true };

function montar() {
  const tablas = {
    trabajador: { findUnique: vi.fn().mockResolvedValue(TRABAJADOR) },
    entidadSS: { findUnique: vi.fn() },
    claseRiesgoArl: { findUnique: vi.fn() },
    afiliacionTrabajador: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    registroAuditoria: { create: vi.fn() },
  };
  tablas.afiliacionTrabajador.create.mockImplementation(({ data }: { data: object }) => Promise.resolve({ id: 'af-nueva', ...data }));
  tablas.afiliacionTrabajador.update.mockImplementation(({ data }: { data: object }) => Promise.resolve({ id: 'af-1', ...data }));
  const prisma = { ...tablas, $transaction: vi.fn((accion: (tx: typeof tablas) => unknown) => accion(tablas)) };
  return { tablas, servicio: new AfiliacionesTrabajadorService(prisma as unknown as PrismaService) };
}

describe('AfiliacionesTrabajadorService.registrar (RF-PER-04)', () => {
  let m: ReturnType<typeof montar>;
  beforeEach(() => {
    m = montar();
    m.tablas.entidadSS.findUnique.mockResolvedValue(EPS_A);
  });

  it('afilia a una EPS cuando no hay otra vigente y lo audita', async () => {
    await m.servicio.registrar('t-1', { tipo: 'EPS', entidadId: 'eps-a', fechaInicio: '2026-02-01' }, usuarioDePrueba());

    expect(m.tablas.afiliacionTrabajador.update).not.toHaveBeenCalled();
    expect(m.tablas.afiliacionTrabajador.create.mock.calls[0][0].data).toMatchObject({ trabajadorId: 't-1', tipo: 'EPS', entidadId: 'eps-a', claseRiesgoId: null, registradaPorId: 'usuario-prueba' });
    const registro = auditoriaDe(m.tablas.registroAuditoria.create, 'TRABAJADOR_AFILIACION_REGISTRAR');
    expect(registro).toMatchObject({ entidad: 'TRABAJADOR', entidadId: 't-1' });
    expect(registro.resumen).toMatch(/Afilió a Persona Inventada a EPS Salud Inventada A$/);
  });

  it('cambiar de EPS cierra la vigente el día anterior y abre la nueva, todo en una transacción', async () => {
    m.tablas.afiliacionTrabajador.findFirst.mockResolvedValue({ id: 'af-1', entidadId: 'eps-a', claseRiesgoId: null, fechaInicio: new Date(2026, 1, 1) });
    m.tablas.entidadSS.findUnique.mockResolvedValue(EPS_B);

    await m.servicio.registrar('t-1', { tipo: 'EPS', entidadId: 'eps-b', fechaInicio: '2026-07-01' }, usuarioDePrueba());

    expect(m.tablas.afiliacionTrabajador.update).toHaveBeenCalledWith({ where: { id: 'af-1' }, data: { fechaFin: new Date(2026, 5, 30) } });
    expect(m.tablas.afiliacionTrabajador.create).toHaveBeenCalledTimes(1);
    const registro = auditoriaDe(m.tablas.registroAuditoria.create, 'TRABAJADOR_AFILIACION_REGISTRAR');
    expect(registro.resumen).toMatch(/cerró la afiliación anterior/);
    expect(registro.antes).toMatchObject({ afiliacionAnteriorId: 'af-1', entidadId: 'eps-a' });
  });

  it('registrar la misma entidad otra vez se rechaza sin tocar nada', async () => {
    m.tablas.afiliacionTrabajador.findFirst.mockResolvedValue({ id: 'af-1', entidadId: 'eps-a', claseRiesgoId: null, fechaInicio: new Date(2026, 1, 1) });
    await expect(m.servicio.registrar('t-1', { tipo: 'EPS', entidadId: 'eps-a', fechaInicio: '2026-07-01' }, usuarioDePrueba())).rejects.toBeInstanceOf(ConflictException);
    expect(m.tablas.afiliacionTrabajador.create).not.toHaveBeenCalled();
    expect(auditoriasDe(m.tablas.registroAuditoria.create)).toHaveLength(0);
  });

  it('la entidad debe ser del tipo de la afiliación', async () => {
    await expect(m.servicio.registrar('t-1', { tipo: 'AFP', entidadId: 'eps-a', fechaInicio: '2026-02-01' }, usuarioDePrueba())).rejects.toThrow(/no es fondo de pensión/);
  });

  it('una entidad desactivada no se puede elegir', async () => {
    m.tablas.entidadSS.findUnique.mockResolvedValue({ ...EPS_A, activa: false });
    await expect(m.servicio.registrar('t-1', { tipo: 'EPS', entidadId: 'eps-a', fechaInicio: '2026-02-01' }, usuarioDePrueba())).rejects.toThrow(/desactivada/);
  });

  it('una entidad que no existe da 404', async () => {
    m.tablas.entidadSS.findUnique.mockResolvedValue(null);
    await expect(m.servicio.registrar('t-1', { tipo: 'EPS', entidadId: 'x', fechaInicio: '2026-02-01' }, usuarioDePrueba())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('no puede empezar antes del ingreso del trabajador', async () => {
    await expect(m.servicio.registrar('t-1', { tipo: 'EPS', entidadId: 'eps-a', fechaInicio: '2025-12-31' }, usuarioDePrueba())).rejects.toThrow(/fecha de ingreso/);
  });

  it('la ARL exige clase de riesgo y la guarda; las demás entidades no la admiten', async () => {
    m.tablas.entidadSS.findUnique.mockResolvedValue(ARL_A);
    await expect(m.servicio.registrar('t-1', { tipo: 'ARL', entidadId: 'arl-a', fechaInicio: '2026-02-01' }, usuarioDePrueba())).rejects.toThrow(/clase de riesgo/);

    m.tablas.claseRiesgoArl.findUnique.mockResolvedValue(CLASE_3);
    await m.servicio.registrar('t-1', { tipo: 'ARL', entidadId: 'arl-a', claseRiesgoId: 'clase-3', fechaInicio: '2026-02-01' }, usuarioDePrueba());
    expect(m.tablas.afiliacionTrabajador.create.mock.calls[0][0].data.claseRiesgoId).toBe('clase-3');
    expect(auditoriaDe(m.tablas.registroAuditoria.create, 'TRABAJADOR_AFILIACION_REGISTRAR').resumen).toMatch(/clase de riesgo 3/);

    m.tablas.entidadSS.findUnique.mockResolvedValue(EPS_A);
    await expect(m.servicio.registrar('t-1', { tipo: 'EPS', entidadId: 'eps-a', claseRiesgoId: 'clase-3', fechaInicio: '2026-02-01' }, usuarioDePrueba())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('una clase de riesgo desactivada no se puede elegir', async () => {
    m.tablas.entidadSS.findUnique.mockResolvedValue(ARL_A);
    m.tablas.claseRiesgoArl.findUnique.mockResolvedValue({ ...CLASE_3, activa: false });
    await expect(m.servicio.registrar('t-1', { tipo: 'ARL', entidadId: 'arl-a', claseRiesgoId: 'clase-3', fechaInicio: '2026-02-01' }, usuarioDePrueba())).rejects.toThrow(/desactivada/);
  });

  it('si otra persona registró la misma afiliación al mismo tiempo, la base lo impide y se responde con conflicto', async () => {
    m.tablas.afiliacionTrabajador.create.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));
    await expect(m.servicio.registrar('t-1', { tipo: 'EPS', entidadId: 'eps-a', fechaInicio: '2026-02-01' }, usuarioDePrueba())).rejects.toBeInstanceOf(ConflictException);
  });

  it('un trabajador que no existe da 404', async () => {
    m.tablas.trabajador.findUnique.mockResolvedValue(null);
    await expect(m.servicio.registrar('x', { tipo: 'EPS', entidadId: 'eps-a', fechaInicio: '2026-02-01' }, usuarioDePrueba())).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AfiliacionesTrabajadorService.cerrar', () => {
  const VIGENTE = { id: 'af-1', trabajadorId: 't-1', tipo: 'EPS', fechaInicio: new Date(2026, 1, 1), fechaFin: null, entidad: { nombre: 'Salud Inventada A' } };

  it('cierra una afiliación vigente con su fecha de fin y lo audita', async () => {
    const m = montar();
    m.tablas.afiliacionTrabajador.findFirst.mockResolvedValue(VIGENTE);
    await m.servicio.cerrar('t-1', 'af-1', { fechaFin: '2026-08-31' }, usuarioDePrueba());
    expect(m.tablas.afiliacionTrabajador.update.mock.calls[0][0].data).toEqual({ fechaFin: new Date(2026, 7, 31) });
    expect(auditoriaDe(m.tablas.registroAuditoria.create, 'TRABAJADOR_AFILIACION_CERRAR').despues).toMatchObject({ afiliacionId: 'af-1' });
  });

  it('no cierra una afiliación ya cerrada, ni con una fecha anterior al inicio, ni de otro trabajador', async () => {
    const m = montar();
    m.tablas.afiliacionTrabajador.findFirst.mockResolvedValue({ ...VIGENTE, fechaFin: new Date(2026, 5, 1) });
    await expect(m.servicio.cerrar('t-1', 'af-1', { fechaFin: '2026-08-31' }, usuarioDePrueba())).rejects.toBeInstanceOf(ConflictException);

    m.tablas.afiliacionTrabajador.findFirst.mockResolvedValue(VIGENTE);
    await expect(m.servicio.cerrar('t-1', 'af-1', { fechaFin: '2026-01-15' }, usuarioDePrueba())).rejects.toBeInstanceOf(BadRequestException);

    m.tablas.afiliacionTrabajador.findFirst.mockResolvedValue(null);
    await expect(m.servicio.cerrar('t-1', 'af-ajena', { fechaFin: '2026-08-31' }, usuarioDePrueba())).rejects.toBeInstanceOf(NotFoundException);
    expect(m.tablas.afiliacionTrabajador.findFirst.mock.calls[2][0].where).toEqual({ id: 'af-ajena', trabajadorId: 't-1' });
  });
});
