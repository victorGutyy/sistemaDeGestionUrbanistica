import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoLote, EstadoProyecto, TipoProyecto } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { auditoriaDe, auditoriasDe } from '../test-utils/auditoria.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import { aplicarAccionLote } from './aplicar-accion.js';
import { LotesService } from './lotes.service.js';

const USUARIO = usuarioDePrueba();
const D = (valor: string) => new Prisma.Decimal(valor);
const PROYECTO = { id: 'p-1', nombre: 'Proyecto Test', tipo: TipoProyecto.LOTES, estado: EstadoProyecto.ACTIVO, areaTotal: D('10000') };
const LOTE = { id: 'lote-1', numero: 'L-1', estado: EstadoLote.DISPONIBLE, area: D('500'), linderos: null, valorPorM2: null, valorVenta: D('80000000'), proyecto: PROYECTO };

function crearPrismaFalso() {
  const prisma = {
    proyecto: { findUnique: vi.fn() },
    manzana: { findFirst: vi.fn() },
    lote: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'lote-1' }),
      aggregate: vi.fn().mockResolvedValue({ _sum: { area: null } }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    loteHistorial: { create: vi.fn() },
    registroAuditoria: { create: vi.fn() },
    separacion: { create: vi.fn(), updateMany: vi.fn() },
    cliente: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation((accion: (tx: typeof prisma) => unknown) => accion(prisma));
  return prisma;
}

describe('auditoría de lotes (RF-AUD-01)', () => {
  let prisma: ReturnType<typeof crearPrismaFalso>;
  let service: LotesService;

  beforeEach(() => {
    prisma = crearPrismaFalso();
    service = new LotesService(prisma as unknown as PrismaService);
    prisma.lote.findFirst.mockResolvedValue(LOTE);
  });

  it('crear un lote deja quién lo creó y con qué datos', async () => {
    prisma.proyecto.findUnique.mockResolvedValue(PROYECTO);
    prisma.lote.findFirst.mockResolvedValue(null);
    prisma.lote.create.mockResolvedValue({ ...LOTE, id: 'lote-nuevo', numero: 'L-9' });

    await service.crear({ proyectoId: 'p-1', numero: 'L-9', area: '500', valorVenta: '80000000' }, USUARIO);

    const registro = auditoriaDe(prisma.registroAuditoria.create, 'LOTE_CREAR');
    expect(registro).toMatchObject({ entidad: 'LOTE', entidadId: 'lote-nuevo', usuarioId: USUARIO.id, usuarioNombre: USUARIO.nombre, usuarioEmail: USUARIO.email });
    expect(registro.resumen).toContain('L-9');
    expect(registro.antes).toBeUndefined();
    expect(registro.despues).toMatchObject({ numero: 'L-9', valorVenta: expect.anything() });
  });

  it('cambiar el precio deja el valor anterior, el nuevo y el motivo (RF-PRY-07)', async () => {
    prisma.lote.update.mockResolvedValue({ ...LOTE, valorVenta: D('90000000') });

    await service.actualizar('lote-1', { valorVenta: '90000000', motivo: 'Ajuste de lista' }, USUARIO);

    const registro = auditoriaDe(prisma.registroAuditoria.create, 'LOTE_CAMBIAR_PRECIO');
    expect(registro).toMatchObject({ entidad: 'LOTE', entidadId: 'lote-1', antes: { valorVenta: '80000000' }, despues: { valorVenta: '90000000', motivo: 'Ajuste de lista' } });
    // Solo cambió el precio: no hay un registro de edición de datos.
    expect(auditoriasDe(prisma.registroAuditoria.create).map((r) => r.accion)).toEqual(['LOTE_CAMBIAR_PRECIO']);
  });

  it('editar otros datos del lote deja el antes y el después, aparte del precio', async () => {
    prisma.lote.update.mockResolvedValue({ ...LOTE, linderos: 'Norte: vía principal' });

    await service.actualizar('lote-1', { linderos: 'Norte: vía principal' }, USUARIO);

    const registro = auditoriaDe(prisma.registroAuditoria.create, 'LOTE_EDITAR');
    expect(registro.antes).toMatchObject({ linderos: null });
    expect(registro.despues).toMatchObject({ linderos: 'Norte: vía principal' });
  });

  it('una edición que no cambia nada no genera ruido en la auditoría', async () => {
    prisma.lote.update.mockResolvedValue(LOTE);
    await service.actualizar('lote-1', { area: '500.00' }, USUARIO);
    expect(prisma.registroAuditoria.create).not.toHaveBeenCalled();
  });

  it('separar deja el cambio de estado con quién lo separó, cuánto dejó y hasta cuándo', async () => {
    await service.separar('lote-1', { nombreInteresado: 'Ana Pérez', valor: '5000000', motivo: 'Dejó consignación' }, USUARIO);

    const registro = auditoriaDe(prisma.registroAuditoria.create, 'LOTE_CAMBIAR_ESTADO');
    expect(registro.antes).toEqual({ estado: 'DISPONIBLE' });
    expect(registro.despues).toMatchObject({
      estado: 'SEPARADO',
      accion: 'SEPARAR',
      motivo: 'Dejó consignación',
      separacion: { nombreInteresado: 'Ana Pérez', valor: '5000000' },
    });
    expect(registro.resumen).toContain('L-1');
  });

  it('liberar y escriturar también dejan su cambio de estado', async () => {
    prisma.lote.findFirst.mockResolvedValue({ ...LOTE, estado: EstadoLote.SEPARADO });
    await service.liberar('lote-1', { motivo: 'No pagó' }, USUARIO);
    expect(auditoriaDe(prisma.registroAuditoria.create, 'LOTE_CAMBIAR_ESTADO').despues).toMatchObject({ estado: 'DISPONIBLE', accion: 'LIBERAR' });

    prisma.registroAuditoria.create.mockClear();
    prisma.lote.findFirst.mockResolvedValue({ ...LOTE, estado: EstadoLote.VENDIDO });
    await service.escriturar('lote-1', { numero: '1234', notaria: 'Notaría 1', fecha: '2026-10-16' }, USUARIO);
    expect(auditoriaDe(prisma.registroAuditoria.create, 'LOTE_CAMBIAR_ESTADO').despues).toMatchObject({ estado: 'ESCRITURADO', accion: 'ESCRITURAR', escritura: { numero: '1234' } });
  });

  it('si el registro de auditoría falla, la acción no se guarda (todo ocurre en una sola transacción)', async () => {
    prisma.lote.update.mockResolvedValue({ ...LOTE, valorVenta: D('90000000') });
    prisma.registroAuditoria.create.mockRejectedValue(new Error('auditoría caída'));

    await expect(service.actualizar('lote-1', { valorVenta: '90000000' }, USUARIO)).rejects.toThrow('auditoría caída');
    // La acción y su auditoría viajan en la MISMA transacción: al fallar una, la base revierte las dos.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('aplicarAccionLote: la auditoría sale del único punto que cambia el estado', () => {
  it('no deja nada si la transición es inválida o si otra persona cambió el lote al mismo tiempo', async () => {
    const tx = { lote: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) }, loteHistorial: { create: vi.fn() }, registroAuditoria: { create: vi.fn() } };
    await expect(aplicarAccionLote(tx as never, { id: 'l', numero: 'L-1', estado: EstadoLote.DISPONIBLE }, 'VENDER', USUARIO)).rejects.toThrow();
    await expect(aplicarAccionLote(tx as never, { id: 'l', numero: 'L-1', estado: EstadoLote.ESCRITURADO }, 'VENDER', USUARIO)).rejects.toThrow();
    expect(tx.registroAuditoria.create).not.toHaveBeenCalled();
  });
});
