import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { auditoriaDe } from '../test-utils/auditoria.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import { VerificacionService } from './verificacion.service.js';
import { diasDeEspera, esperaEnAlerta, medioRequiereVerificacion } from './verificacion.js';

const D = (valor: string) => new Prisma.Decimal(valor);
const haceDias = (dias: number) => {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - dias);
  return fecha;
};

describe('reglas de verificación (RF-REC-10)', () => {
  it('manda la configuración del medio, y sin configuración solo el efectivo se salta la verificación', () => {
    expect(medioRequiereVerificacion('TRANSFERENCIA', { requiereVerificacion: false })).toBe(false);
    expect(medioRequiereVerificacion('EFECTIVO', { requiereVerificacion: true })).toBe(true);
    expect(medioRequiereVerificacion('EFECTIVO', null)).toBe(false);
    for (const medio of ['TRANSFERENCIA', 'CONSIGNACION', 'NEQUI', 'DAVIPLATA'] as const) {
      expect(medioRequiereVerificacion(medio, null)).toBe(true);
    }
  });

  it('cuenta los días de espera y marca la alerta desde el umbral configurado', () => {
    const hoy = new Date(2026, 9, 21);
    expect(diasDeEspera(new Date(2026, 9, 21), hoy)).toBe(0);
    expect(diasDeEspera(new Date(2026, 9, 16), hoy)).toBe(5);
    expect(diasDeEspera(new Date(2026, 9, 25), hoy)).toBe(0);
    expect(esperaEnAlerta(2, 3)).toBe(false);
    expect(esperaEnAlerta(3, 3)).toBe(true);
    expect(esperaEnAlerta(0, 0)).toBe(true);
  });
});

describe('VerificacionService', () => {
  const abono = (extra: Record<string, unknown> = {}) => ({
    id: 'abono-1',
    estado: 'ACTIVO',
    verificacion: 'POR_VERIFICAR',
    valor: D('500000'),
    recibo: { numeroTexto: 'RC-000010' },
    venta: { cliente: { nombre: 'Ana Pérez' }, lote: { numero: 'L-3' } },
    ...extra,
  });

  function crear() {
    const tx = {
      abono: { findMany: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      registroAuditoria: { create: vi.fn() },
    };
    const prisma = {
      abono: { findMany: vi.fn().mockResolvedValue([]), aggregate: vi.fn() },
      $transaction: vi.fn((callback: (t: typeof tx) => unknown) => callback(tx)),
    };
    const configuracion = { obtenerEmpresa: vi.fn().mockResolvedValue({ diasAlertaVerificacion: 3 }) };
    const service = new VerificacionService(prisma as unknown as PrismaService, configuracion as unknown as ConfiguracionService);
    return { service, tx, prisma, configuracion };
  }

  describe('verificar', () => {
    it('verifica el abono con quién y cuándo, y deja la auditoría con el antes y el después', async () => {
      const { service, tx } = crear();
      tx.abono.findMany.mockResolvedValue([abono()]);
      const usuario = usuarioDePrueba();

      const resultado = await service.verificar(['abono-1'], '  Mov. 8841 del extracto ', usuario);

      expect(resultado).toEqual({ verificados: 1, recibos: ['RC-000010'] });
      expect(tx.abono.updateMany).toHaveBeenCalledWith({
        where: { id: 'abono-1', verificacion: 'POR_VERIFICAR', estado: 'ACTIVO' },
        data: { verificacion: 'VERIFICADO', verificadoPorId: usuario.id, verificadoEn: expect.any(Date), notaVerificacion: 'Mov. 8841 del extracto' },
      });
      const auditoria = auditoriaDe(tx.registroAuditoria.create, 'ABONO_VERIFICAR');
      expect(auditoria).toMatchObject({ entidad: 'ABONO', entidadId: 'abono-1', usuarioId: usuario.id });
      expect(auditoria.antes).toEqual({ verificacion: 'POR_VERIFICAR' });
      expect(auditoria.despues).toEqual({ verificacion: 'VERIFICADO', nota: 'Mov. 8841 del extracto' });
    });

    it('sin nota guarda null, y los ids repetidos se cuentan una vez', async () => {
      const { service, tx } = crear();
      tx.abono.findMany.mockResolvedValue([abono()]);

      await service.verificar(['abono-1', 'abono-1'], undefined, usuarioDePrueba());

      expect(tx.abono.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { in: ['abono-1'] } }) }));
      expect(tx.abono.updateMany).toHaveBeenCalledTimes(1);
      expect(tx.abono.updateMany.mock.calls[0][0].data.notaVerificacion).toBeNull();
    });

    it('respeta el alcance: un abono de un proyecto ajeno es como si no existiera', async () => {
      const { service, tx } = crear();
      tx.abono.findMany.mockResolvedValue([]);

      await expect(service.verificar(['abono-x'], undefined, usuarioDePrueba(['proyecto-1']))).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.abono.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ venta: { lote: { proyectoId: { in: ['proyecto-1'] } } } }) }));
      expect(tx.abono.updateMany).not.toHaveBeenCalled();
    });

    it.each([
      ['anulado', { estado: 'ANULADO' }, /anulado/],
      ['ya verificado', { verificacion: 'VERIFICADO' }, /ya fue verificado/],
      ['de un medio que no requiere verificación', { verificacion: 'NO_REQUIERE' }, /no requiere verificación/],
    ])('no verifica un abono %s', async (_nombre, cambios, mensaje) => {
      const { service, tx } = crear();
      tx.abono.findMany.mockResolvedValue([abono(cambios)]);

      await expect(service.verificar(['abono-1'], undefined, usuarioDePrueba())).rejects.toThrow(mensaje);
      expect(tx.abono.updateMany).not.toHaveBeenCalled();
    });

    it('todo o nada: si un abono del lote no se puede verificar, no se verifica ninguno', async () => {
      const { service, tx } = crear();
      tx.abono.findMany.mockResolvedValue([abono({ id: 'a-1' }), abono({ id: 'a-2', verificacion: 'VERIFICADO' })]);

      await expect(service.verificar(['a-1', 'a-2'], undefined, usuarioDePrueba())).rejects.toBeInstanceOf(ConflictException);
      expect(tx.abono.updateMany).not.toHaveBeenCalled();
      expect(tx.registroAuditoria.create).not.toHaveBeenCalled();
    });

    it('si otra persona lo verificó o lo anuló un instante antes, falla en vez de pisarlo', async () => {
      const { service, tx } = crear();
      tx.abono.findMany.mockResolvedValue([abono()]);
      tx.abono.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.verificar(['abono-1'], undefined, usuarioDePrueba())).rejects.toThrow(/cambió mientras se verificaba/);
      expect(tx.registroAuditoria.create).not.toHaveBeenCalled();
    });
  });

  describe('listarPorVerificar', () => {
    it('trae los más antiguos primero, con los días de espera y la alerta', async () => {
      const { service, prisma } = crear();
      const fila = (id: string, dias: number) => ({
        id,
        createdAt: haceDias(dias),
        fecha: haceDias(dias),
        valor: D('1000000'),
        medioPago: 'TRANSFERENCIA',
        referencia: `T-${id}`,
        comprobanteUrl: id === 'a-1' ? 'ruta/soporte.pdf' : null,
        recibo: { numeroTexto: `RC-${id}` },
        cuentaDestino: { id: 'c-1', banco: 'Bancolombia', alias: 'Ahorros' },
        registradoPor: { nombre: 'Ana Admin' },
        venta: { id: 'v-1', cliente: { id: 'cl-1', nombre: 'Cliente Uno' }, lote: { numero: 'L-1', proyecto: { id: 'p-1', nombre: 'Proyecto Uno' } } },
      });
      prisma.abono.findMany.mockResolvedValue([fila('a-1', 5), fila('a-2', 1)]);
      prisma.abono.aggregate.mockResolvedValue({ _count: { _all: 2 }, _sum: { valor: D('2000000') }, _min: { createdAt: haceDias(5) } });

      const lista = await service.listarPorVerificar({}, usuarioDePrueba());

      expect(prisma.abono.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: [{ createdAt: 'asc' }] }));
      expect(lista).toMatchObject({ total: 2, masAntiguaDias: 5, diasAlerta: 3 });
      expect(lista.valorTotal.toString()).toBe('2000000');
      expect(lista.abonos.map((a) => [a.id, a.diasEspera, a.enAlerta, a.conSoporte])).toEqual([
        ['a-1', 5, true, true],
        ['a-2', 1, false, false],
      ]);
    });

    it('siempre filtra por abonos vigentes por verificar y por el alcance, y aplica los filtros pedidos', async () => {
      const { service, prisma } = crear();
      prisma.abono.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { valor: null }, _min: { createdAt: null } });

      const lista = await service.listarPorVerificar({ cuentaId: 'c-1', proyectoId: 'p-1', desde: '2026-10-01', hasta: '2026-10-20' }, usuarioDePrueba(['p-1', 'p-2']));

      const donde = prisma.abono.findMany.mock.calls[0][0].where as Record<string, unknown>;
      expect(donde).toMatchObject({ estado: 'ACTIVO', verificacion: 'POR_VERIFICAR', cuentaDestinoId: 'c-1' });
      expect(donde.AND).toEqual([{ venta: { lote: { proyectoId: { in: ['p-1', 'p-2'] } } } }, { venta: { lote: { proyectoId: 'p-1' } } }]);
      expect(donde.fecha).toEqual({ gte: expect.any(Date), lte: expect.any(Date) });
      expect(lista).toMatchObject({ total: 0, masAntiguaDias: 0 });
      expect(lista.valorTotal.toString()).toBe('0');
    });
  });

  describe('resumenPorVerificar (panel)', () => {
    it('da la cantidad, el valor y la antigüedad, y se pone en alerta al pasar el umbral', async () => {
      const { service, prisma } = crear();
      prisma.abono.aggregate.mockResolvedValue({ _count: { _all: 4 }, _sum: { valor: D('3000000') }, _min: { createdAt: haceDias(4) } });

      const resumen = await service.resumenPorVerificar(usuarioDePrueba());

      expect(resumen).toMatchObject({ cantidad: 4, masAntiguaDias: 4, enAlerta: true });
      expect(resumen.valor.toString()).toBe('3000000');
    });

    it('sin pendientes no hay alerta, aunque el umbral sea 0', async () => {
      const { service, prisma, configuracion } = crear();
      configuracion.obtenerEmpresa.mockResolvedValue({ diasAlertaVerificacion: 0 });
      prisma.abono.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { valor: null }, _min: { createdAt: null } });

      expect(await service.resumenPorVerificar(usuarioDePrueba())).toMatchObject({ cantidad: 0, masAntiguaDias: 0, enAlerta: false });
    });

    it('con proyecto elegido lo pide al filtro', async () => {
      const { service, prisma } = crear();
      prisma.abono.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { valor: null }, _min: { createdAt: null } });

      await service.resumenPorVerificar(usuarioDePrueba(), 'p-1');

      const donde = prisma.abono.aggregate.mock.calls[0][0].where as { AND: unknown[] };
      expect(donde.AND).toContainEqual({ venta: { lote: { proyectoId: 'p-1' } } });
    });
  });
});
