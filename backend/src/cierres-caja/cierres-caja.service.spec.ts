import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import type { ConfiguracionService } from '../configuracion/configuracion.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { auditoriaDe, auditoriasDe } from '../test-utils/auditoria.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import { CierresCajaService } from './cierres-caja.service.js';

const D = (v: string) => new Prisma.Decimal(v);
const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const ADMIN = usuarioDePrueba();
const GERENTE = { ...usuarioDePrueba(), id: 'gerente-1', nombre: 'Gerente de Prueba' };

function crearPrismaFalso() {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    $queryRaw: vi.fn().mockResolvedValue([{ ultimo: 1 }]),
    registroAuditoria: { create: vi.fn() },
    cierreCaja: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    cierreCajaHistorial: { create: vi.fn() },
    abono: { findMany: vi.fn().mockResolvedValue([]) },
    movimientoFinanciero: { findMany: vi.fn().mockResolvedValue([]) },
    pagoNomina: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const prisma = {
    // crear y descartar se hacen dentro de una transacción: usan los mismos falsos que la base "normal".
    cierreCaja: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: tx.cierreCaja.create, deleteMany: tx.cierreCaja.deleteMany },
    abono: tx.abono,
    movimientoFinanciero: tx.movimientoFinanciero,
    pagoNomina: tx.pagoNomina,
    $transaction: vi.fn((callback: (txArg: typeof tx) => unknown) => callback(tx)),
  };
  return { prisma, tx };
}

// Hoy es martes 20 de octubre de 2026 (mediodía en Colombia).
const HOY = new Date(Date.UTC(2026, 9, 20, 17, 0, 0));

const CIERRE_CERRADO = { estado: 'CERRADO', numeroTexto: 'CC-000001', desde: dia('2026-10-12'), hasta: dia('2026-10-18'), efectivoContado: D('100000'), diferencia: D('0') };

function cierreBase(extra: Record<string, unknown> = {}) {
  return {
    id: 'c-1',
    numero: null,
    numeroTexto: null,
    tipo: 'SEMANAL',
    desde: dia('2026-10-12'),
    hasta: dia('2026-10-18'),
    estado: 'BORRADOR',
    efectivoInicial: D('100000'),
    efectivoEsperado: null,
    efectivoContado: null,
    diferencia: null,
    explicacionDiferencia: null,
    contenido: null,
    creadoPorId: ADMIN.id,
    ...extra,
  };
}

describe('CierresCajaService', () => {
  let prisma: ReturnType<typeof crearPrismaFalso>['prisma'];
  let tx: ReturnType<typeof crearPrismaFalso>['tx'];
  let service: CierresCajaService;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(HOY);
    ({ prisma, tx } = crearPrismaFalso());
    service = new CierresCajaService(prisma as unknown as PrismaService, {} as ConfiguracionService, {} as StorageService);
    // obtener() al final de cada operación
    prisma.cierreCaja.findUnique.mockResolvedValue({ ...cierreBase(), historial: [], creadoPor: { nombre: 'A' }, cerradoPor: null, resueltoPor: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('crear (RF-CAJ-01)', () => {
    it('el primer cierre exige el día de inicio y el efectivo que hay en la caja', async () => {
      prisma.cierreCaja.findFirst.mockResolvedValue(null);
      await expect(service.crear({ tipo: 'SEMANAL' }, ADMIN)).rejects.toThrow(/desde qué día/);
      await expect(service.crear({ tipo: 'SEMANAL', desde: '2026-10-12' }, ADMIN)).rejects.toThrow(/efectivo que hay en la caja/);
      expect(prisma.cierreCaja.create).not.toHaveBeenCalled();
    });

    it('el primer cierre calcula su fin según el tipo y guarda quién lo creó y con cuánto efectivo empieza', async () => {
      prisma.cierreCaja.findFirst.mockResolvedValue(null);
      prisma.cierreCaja.create.mockResolvedValue({ id: 'c-1' });

      await service.crear({ tipo: 'SEMANAL', desde: '2026-10-12', efectivoInicial: '250000' }, ADMIN);

      const { data } = prisma.cierreCaja.create.mock.calls[0][0];
      expect(data).toMatchObject({ tipo: 'SEMANAL', creadoPorId: ADMIN.id });
      expect(data.desde.toISOString()).toBe('2026-10-12T00:00:00.000Z');
      expect(data.hasta.toISOString()).toBe('2026-10-18T00:00:00.000Z');
      expect(data.efectivoInicial.toString()).toBe('250000');
      expect(auditoriaDe(tx.registroAuditoria.create, 'CIERRE_CREAR')).toMatchObject({ entidad: 'CIERRE_CAJA', usuarioId: ADMIN.id, despues: { tipo: 'SEMANAL', desde: '2026-10-12', hasta: '2026-10-18' } });
    });

    it('no se puede cerrar un período que todavía no termina', async () => {
      prisma.cierreCaja.findFirst.mockResolvedValue(null);
      // La semana del 19 al 25 termina el domingo 25; hoy es martes 20.
      await expect(service.crear({ tipo: 'SEMANAL', desde: '2026-10-19', efectivoInicial: '0' }, ADMIN)).rejects.toThrow(/todavía no se puede cerrar/);
      // Pero el cierre diario de hoy sí se puede.
      prisma.cierreCaja.create.mockResolvedValue({ id: 'c-1' });
      await expect(service.crear({ tipo: 'DIARIO', desde: '2026-10-20', efectivoInicial: '0' }, ADMIN)).resolves.toBeDefined();
    });

    it('los siguientes empiezan el día después del anterior y heredan su efectivo contado, sin elegir fecha', async () => {
      prisma.cierreCaja.findFirst.mockResolvedValue({ estado: 'APROBADO', hasta: dia('2026-10-11'), desde: dia('2026-10-05'), numeroTexto: 'CC-000001', efectivoContado: D('420000') });
      prisma.cierreCaja.create.mockResolvedValue({ id: 'c-2' });

      await service.crear({ tipo: 'SEMANAL' }, ADMIN);

      const { data } = prisma.cierreCaja.create.mock.calls[0][0];
      expect(data.desde.toISOString()).toBe('2026-10-12T00:00:00.000Z');
      expect(data.hasta.toISOString()).toBe('2026-10-18T00:00:00.000Z');
      expect(data.efectivoInicial.toString()).toBe('420000');

      await expect(service.crear({ tipo: 'SEMANAL', desde: '2026-10-01' }, ADMIN)).rejects.toBeInstanceOf(BadRequestException);
    });

    it.each([
      ['BORRADOR', null, /termina o descarta/],
      ['CERRADO', 'CC-000001', /debe aprobarse/],
      ['DEVUELTO', 'CC-000001', /devolvió/],
    ])('no se crea otro cierre mientras el anterior está %s: la cadena de efectivo va en orden', async (estado, numeroTexto, mensaje) => {
      prisma.cierreCaja.findFirst.mockResolvedValue({ estado, numeroTexto, desde: dia('2026-10-05'), hasta: dia('2026-10-11'), efectivoContado: null });
      await expect(service.crear({ tipo: 'SEMANAL' }, ADMIN)).rejects.toThrow(mensaje);
      expect(prisma.cierreCaja.create).not.toHaveBeenCalled();
    });

    it('si la base detecta un solape (dos personas a la vez) responde conflicto', async () => {
      prisma.cierreCaja.findFirst.mockResolvedValue(null);
      prisma.cierreCaja.create.mockRejectedValue(new Error('conflicting key value violates exclusion constraint "CierreCaja_sin_solape"'));
      await expect(service.crear({ tipo: 'DIARIO', desde: '2026-10-19', efectivoInicial: '0' }, ADMIN)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('proximo', () => {
    it('sin cierres previos pide el día y el efectivo iniciales', async () => {
      prisma.cierreCaja.findFirst.mockResolvedValue(null);
      expect(await service.proximo('SEMANAL')).toMatchObject({ esPrimero: true, puedeCrear: true });
    });

    it('con un cierre aprobado propone el período siguiente y su efectivo inicial', async () => {
      prisma.cierreCaja.findFirst.mockResolvedValue({ estado: 'APROBADO', hasta: dia('2026-10-11'), desde: dia('2026-10-05'), numeroTexto: 'CC-000001', efectivoContado: D('420000') });
      expect(await service.proximo('SEMANAL')).toEqual({ esPrimero: false, puedeCrear: true, motivo: null, desde: '2026-10-12', hasta: '2026-10-18', efectivoInicial: '420000' });
    });

    it('avisa por qué no se puede crear (cierre pendiente o período sin terminar)', async () => {
      prisma.cierreCaja.findFirst.mockResolvedValue({ estado: 'CERRADO', hasta: dia('2026-10-11'), desde: dia('2026-10-05'), numeroTexto: 'CC-000001', efectivoContado: D('1') });
      expect((await service.proximo('SEMANAL')).puedeCrear).toBe(false);

      prisma.cierreCaja.findFirst.mockResolvedValue({ estado: 'APROBADO', hasta: dia('2026-10-18'), desde: dia('2026-10-12'), numeroTexto: 'CC-000002', efectivoContado: D('1') });
      const futuro = await service.proximo('SEMANAL');
      expect(futuro).toMatchObject({ puedeCrear: false, desde: '2026-10-19', hasta: '2026-10-25' });
      expect(futuro.motivo).toMatch(/todavía no se puede cerrar/);
    });
  });

  describe('cerrar (RF-CAJ-03 y 04)', () => {
    beforeEach(() => {
      tx.cierreCaja.findUnique.mockResolvedValue(cierreBase());
      tx.$queryRaw.mockResolvedValue([{ ultimo: 4 }]);
    });

    it('toma el bloqueo exclusivo antes de calcular, para que lo congelado sea exactamente lo calculado', async () => {
      const orden: string[] = [];
      tx.$executeRaw.mockImplementation(() => {
        orden.push('bloqueo');
        return Promise.resolve(0);
      });
      tx.abono.findMany.mockImplementation(() => {
        orden.push('lectura');
        return Promise.resolve([]);
      });
      await service.cerrar('c-1', { efectivoContado: '100000' }, ADMIN);
      expect(orden[0]).toBe('bloqueo');
      expect(orden).toContain('lectura');
    });

    it('con lo contado igual a lo esperado cierra, asigna el número y guarda la fotografía', async () => {
      await service.cerrar('c-1', { efectivoContado: '100000' }, ADMIN);

      const { data } = tx.cierreCaja.update.mock.calls[0][0];
      expect(data).toMatchObject({ estado: 'CERRADO', numero: 4, numeroTexto: 'CC-000004', cerradoPorId: ADMIN.id, explicacionDiferencia: null });
      expect(data.efectivoEsperado.toString()).toBe('100000');
      expect(data.efectivoContado.toString()).toBe('100000');
      expect(data.diferencia.toString()).toBe('0');
      expect(data.contenido).toMatchObject({ desde: '2026-10-12', hasta: '2026-10-18', efectivo: { esperado: '100000' } });
      expect(tx.cierreCajaHistorial.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ cierreId: 'c-1', estadoAnterior: 'BORRADOR', estadoNuevo: 'CERRADO', usuarioId: ADMIN.id }),
      });
      const auditado = auditoriaDe(tx.registroAuditoria.create, 'CIERRE_CERRAR');
      expect(auditado).toMatchObject({ entidad: 'CIERRE_CAJA', entidadId: 'c-1', usuarioId: ADMIN.id, antes: { estado: 'BORRADOR' } });
      expect(auditado.despues).toMatchObject({ estado: 'CERRADO', numero: 'CC-000004', efectivoEsperado: '100000', efectivoContado: '100000', diferencia: '0' });
    });

    it('con diferencia exige explicarla y guarda la diferencia (contado − esperado)', async () => {
      await expect(service.cerrar('c-1', { efectivoContado: '90000' }, ADMIN)).rejects.toMatchObject({ response: { codigo: 'DIFERENCIA_SIN_EXPLICACION' } });
      await expect(service.cerrar('c-1', { efectivoContado: '90000', explicacionDiferencia: 'ok' }, ADMIN)).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.cierreCaja.update).not.toHaveBeenCalled();
      expect(tx.$queryRaw).not.toHaveBeenCalled(); // no gasta número

      await service.cerrar('c-1', { efectivoContado: '90000', explicacionDiferencia: 'Se pagó un taxi sin recibo' }, ADMIN);
      const { data } = tx.cierreCaja.update.mock.calls[0][0];
      expect(data.diferencia.toString()).toBe('-10000');
      expect(data.explicacionDiferencia).toBe('Se pagó un taxi sin recibo');
    });

    it('un cierre devuelto se vuelve a cerrar conservando su número y limpiando la decisión anterior', async () => {
      tx.cierreCaja.findUnique.mockResolvedValue(cierreBase({ estado: 'DEVUELTO', numero: 2, numeroTexto: 'CC-000002' }));
      await service.cerrar('c-1', { efectivoContado: '100000' }, ADMIN);

      const { data } = tx.cierreCaja.update.mock.calls[0][0];
      expect(data).toMatchObject({ numero: 2, numeroTexto: 'CC-000002', resueltoPorId: null, resueltoEn: null, observacionGerente: null });
      expect(tx.$queryRaw).not.toHaveBeenCalled();
      expect(tx.cierreCajaHistorial.create.mock.calls[0][0].data).toMatchObject({ estadoAnterior: 'DEVUELTO', estadoNuevo: 'CERRADO' });
    });

    it.each(['CERRADO', 'APROBADO'])('un cierre %s no se vuelve a cerrar', async (estado) => {
      tx.cierreCaja.findUnique.mockResolvedValue(cierreBase({ estado }));
      await expect(service.cerrar('c-1', { efectivoContado: '100000' }, ADMIN)).rejects.toBeInstanceOf(ConflictException);
      expect(tx.cierreCaja.update).not.toHaveBeenCalled();
    });

    it('un cierre que no existe responde 404', async () => {
      tx.cierreCaja.findUnique.mockResolvedValue(null);
      await expect(service.cerrar('x', { efectivoContado: '0' }, ADMIN)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('el efectivo esperado sale de los movimientos reales del período', async () => {
      tx.abono.findMany.mockResolvedValue([
        { id: 'a1', fecha: new Date(2026, 9, 13), valor: D('500000'), medioPago: 'EFECTIVO', cuentaDestino: null, estado: 'ACTIVO', anuladoEn: null, recibo: { numeroTexto: 'RC-000001' }, venta: { cliente: { nombre: 'C' }, lote: { numero: 'L-1', proyecto: { nombre: 'P' } } } },
      ]);
      tx.movimientoFinanciero.findMany.mockResolvedValue([
        { id: 'g1', tipo: 'GASTO', fecha: new Date(2026, 9, 14), valor: D('150000'), medioPago: 'EFECTIVO', cuenta: null, estado: 'ACTIVO', anuladoEn: null, descripcion: 'Cemento', categoriaGasto: { nombre: 'Materiales' }, categoriaIngreso: null, proyecto: null },
      ]);

      await service.cerrar('c-1', { efectivoContado: '450000' }, ADMIN);

      // 100.000 + 500.000 − 150.000 = 450.000
      expect(tx.cierreCaja.update.mock.calls[0][0].data.efectivoEsperado.toString()).toBe('450000');
    });
  });

  describe('aprobar y devolver (RF-CAJ-04)', () => {
    it('el gerente aprueba un cierre cerrado y queda en el historial', async () => {
      tx.cierreCaja.findUnique.mockResolvedValue(CIERRE_CERRADO);
      tx.cierreCaja.updateMany.mockResolvedValue({ count: 1 });

      await service.aprobar('c-1', { observacion: ' Todo en orden ' }, GERENTE);

      expect(tx.cierreCaja.updateMany).toHaveBeenCalledWith({
        where: { id: 'c-1', estado: 'CERRADO' },
        data: expect.objectContaining({ estado: 'APROBADO', resueltoPorId: GERENTE.id, observacionGerente: 'Todo en orden' }),
      });
      expect(tx.cierreCajaHistorial.create.mock.calls[0][0].data).toMatchObject({ estadoAnterior: 'CERRADO', estadoNuevo: 'APROBADO', usuarioId: GERENTE.id });
      expect(auditoriaDe(tx.registroAuditoria.create, 'CIERRE_APROBAR')).toMatchObject({ entidadId: 'c-1', usuarioId: GERENTE.id, antes: { estado: 'CERRADO' }, despues: { estado: 'APROBADO' } });
    });

    it('devolver guarda la observación del gerente', async () => {
      tx.cierreCaja.findUnique.mockResolvedValue(CIERRE_CERRADO);
      tx.cierreCaja.updateMany.mockResolvedValue({ count: 1 });

      await service.devolver('c-1', { observacion: 'Falta el soporte del taxi' }, GERENTE);

      expect(tx.cierreCaja.updateMany.mock.calls[0][0].data).toMatchObject({ estado: 'DEVUELTO', observacionGerente: 'Falta el soporte del taxi' });
      expect(auditoriaDe(tx.registroAuditoria.create, 'CIERRE_DEVOLVER')).toMatchObject({ despues: { estado: 'DEVUELTO', observacion: 'Falta el soporte del taxi' } });
    });

    it('solo se resuelve un cierre cerrado: si otra persona ya decidió, no se pisa su decisión', async () => {
      tx.cierreCaja.findUnique.mockResolvedValue({ estado: 'APROBADO' });
      tx.cierreCaja.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.aprobar('c-1', {}, GERENTE)).rejects.toBeInstanceOf(ConflictException);
      await expect(service.devolver('c-1', { observacion: 'Otra vez' }, GERENTE)).rejects.toBeInstanceOf(ConflictException);
      expect(tx.cierreCajaHistorial.create).not.toHaveBeenCalled();
    });

    it('una decisión que no se pudo tomar (otra persona ya decidió) no deja nada en la auditoría', async () => {
      tx.cierreCaja.findUnique.mockResolvedValue(CIERRE_CERRADO);
      tx.cierreCaja.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.aprobar('c-1', {}, GERENTE)).rejects.toBeInstanceOf(ConflictException);
      expect(auditoriasDe(tx.registroAuditoria.create)).toEqual([]);
    });

    it('un cierre que no existe responde 404', async () => {
      tx.cierreCaja.findUnique.mockResolvedValue(null);
      await expect(service.aprobar('x', {}, GERENTE)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('descartar', () => {
    it('solo descarta borradores', async () => {
      prisma.cierreCaja.findUnique.mockResolvedValue({ id: 'c-1', estado: 'BORRADOR', tipo: 'SEMANAL', desde: dia('2026-10-12'), hasta: dia('2026-10-18'), efectivoInicial: D('0') });
      prisma.cierreCaja.deleteMany.mockResolvedValue({ count: 1 });
      await expect(service.descartar('c-1', ADMIN)).resolves.toEqual({ descartado: true });
      expect(prisma.cierreCaja.deleteMany).toHaveBeenCalledWith({ where: { id: 'c-1', estado: 'BORRADOR' } });
      expect(auditoriaDe(tx.registroAuditoria.create, 'CIERRE_DESCARTAR')).toMatchObject({ entidadId: 'c-1', usuarioId: ADMIN.id, antes: { estado: 'BORRADOR', tipo: 'SEMANAL' } });

      prisma.cierreCaja.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.descartar('c-1', ADMIN)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('obtener', () => {
    it('un borrador se calcula en vivo y un cierre cerrado entrega su fotografía congelada', async () => {
      const foto = { desde: '2026-10-12', hasta: '2026-10-18', totales: { neto: '777' }, efectivo: { esperado: '100000' } };
      prisma.cierreCaja.findUnique.mockResolvedValue({ ...cierreBase({ estado: 'CERRADO', contenido: foto, numero: 1, numeroTexto: 'CC-000001' }), historial: [], creadoPor: { nombre: 'A' }, cerradoPor: null, resueltoPor: null });
      const cerrado = await service.obtener('c-1');
      expect(cerrado).toMatchObject({ enVivo: false, resumen: foto, desde: '2026-10-12', hasta: '2026-10-18' });
      expect(prisma.abono.findMany).not.toHaveBeenCalled();
      expect('contenido' in cerrado).toBe(false);

      prisma.cierreCaja.findUnique.mockResolvedValue({ ...cierreBase(), historial: [], creadoPor: { nombre: 'A' }, cerradoPor: null, resueltoPor: null });
      const borrador = await service.obtener('c-1');
      expect(borrador.enVivo).toBe(true);
      expect(prisma.abono.findMany).toHaveBeenCalled();
    });

    it('un cierre que no existe responde 404', async () => {
      prisma.cierreCaja.findUnique.mockResolvedValue(null);
      await expect(service.obtener('x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
