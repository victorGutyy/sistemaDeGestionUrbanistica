import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AuditoriaService } from './auditoria.service.js';

function crearPrismaFalso() {
  return {
    registroAuditoria: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    usuario: { findMany: vi.fn().mockResolvedValue([{ id: 'u-1', nombre: 'Ana', email: 'ana@ejemplo.test' }]) },
  };
}

describe('AuditoriaService.listar (RF-AUD-02)', () => {
  let prisma: ReturnType<typeof crearPrismaFalso>;
  let service: AuditoriaService;

  beforeEach(() => {
    prisma = crearPrismaFalso();
    service = new AuditoriaService(prisma as unknown as PrismaService);
  });

  const filtroUsado = () => prisma.registroAuditoria.findMany.mock.calls[0][0];

  it('sin filtros lista lo más reciente primero, de 50 en 50', async () => {
    prisma.registroAuditoria.count.mockResolvedValue(120);
    const resultado = await service.listar({});

    expect(filtroUsado()).toMatchObject({ where: {}, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: 0, take: 50 });
    expect(resultado).toMatchObject({ total: 120, pagina: 1, limite: 50, paginas: 3 });
  });

  it('pagina: la segunda página salta los primeros registros', async () => {
    await service.listar({ pagina: 3, limite: 20 });
    expect(filtroUsado()).toMatchObject({ skip: 40, take: 20 });
  });

  it('filtra por usuario, tipo de registro y acción', async () => {
    await service.listar({ usuarioId: 'u-1', entidad: 'ABONO', accion: 'ABONO_ANULAR' });
    expect(filtroUsado().where).toMatchObject({ usuarioId: 'u-1', entidad: 'ABONO', accion: 'ABONO_ANULAR' });
  });

  it('filtra por fecha con días de Colombia: desde el comienzo del primero hasta antes del día siguiente al último', async () => {
    await service.listar({ desde: '2026-10-12', hasta: '2026-10-18' });

    const { createdAt } = filtroUsado().where;
    expect(createdAt.gte).toEqual(new Date(2026, 9, 12));
    expect(createdAt.lt).toEqual(new Date(2026, 9, 19));
  });

  it('un solo extremo de fecha también funciona', async () => {
    await service.listar({ desde: '2026-10-12' });
    expect(filtroUsado().where.createdAt).toEqual({ gte: new Date(2026, 9, 12) });
    await service.listar({ hasta: '2026-10-12' });
    expect(prisma.registroAuditoria.findMany.mock.calls[1][0].where.createdAt).toEqual({ lt: new Date(2026, 9, 13) });
  });

  it('busca dentro del resumen sin distinguir mayúsculas y ya no usa espacios sobrantes', async () => {
    await service.listar({ buscar: '  RC-000020 ' });
    expect(filtroUsado().where.resumen).toEqual({ contains: 'RC-000020', mode: 'insensitive' });
  });

  it('una búsqueda vacía no filtra', async () => {
    await service.listar({ buscar: '   ' });
    expect(filtroUsado().where.resumen).toBeUndefined();
  });

  it('nunca hay menos de una página, aunque no haya registros', async () => {
    expect((await service.listar({})).paginas).toBe(1);
  });
});

describe('AuditoriaService.catalogo', () => {
  it('entrega los tipos de registro, las acciones con su texto y los usuarios para armar los filtros', async () => {
    const prisma = crearPrismaFalso();
    const catalogo = await new AuditoriaService(prisma as unknown as PrismaService).catalogo();

    expect(catalogo.entidades).toContainEqual({ valor: 'CIERRE_CAJA', etiqueta: 'Cierre de caja' });
    expect(catalogo.acciones).toContainEqual({ valor: 'ABONO_ANULAR', etiqueta: 'Anuló un abono' });
    expect(catalogo.usuarios).toEqual([{ id: 'u-1', nombre: 'Ana', email: 'ana@ejemplo.test' }]);
  });
});
