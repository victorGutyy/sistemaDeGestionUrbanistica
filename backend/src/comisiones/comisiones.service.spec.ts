import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { crearMovimientoEnTx } from '../finanzas/crear-movimiento-tx.js';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoComision, MedioPago } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { auditoriaDe, auditoriasDe } from '../test-utils/auditoria.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import { ComisionesService } from './comisiones.service.js';

// El egreso del pago lo crea crearMovimientoEnTx (probado en crear-movimiento-tx.spec.ts): aquí solo se comprueba
// que se invoque con lo correcto y dentro de la misma transacción.
vi.mock('../finanzas/crear-movimiento-tx.js', () => ({ crearMovimientoEnTx: vi.fn() }));

const D = (valor: string) => new Prisma.Decimal(valor);
const GERENTE = { ...usuarioDePrueba(), id: 'gerente-1' };
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n');
const hoy = () => {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
};

const COMISION = {
  id: 'com-1',
  ventaId: 'venta-1',
  vendedorId: 'vend-1',
  tipoVendedor: 'ASESOR_INMOBILIARIO',
  valor: D('1000000'),
  estado: EstadoComision.PENDIENTE,
  movimientoId: null,
  vendedor: { id: 'vend-1', nombre: 'Luis Gómez', documento: '555', tipo: 'ASESOR_INMOBILIARIO' },
  venta: { id: 'venta-1', lote: { id: 'lote-1', numero: 'L-1', proyectoId: 'p-1' } },
};

function crearPrismaFalso() {
  const tx = {
    comision: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), aggregate: vi.fn() },
    categoriaGasto: { findUnique: vi.fn().mockResolvedValue({ id: 'cat-comisiones', activa: true }), create: vi.fn(), update: vi.fn() },
    movimientoFinanciero: { findUniqueOrThrow: vi.fn(), updateMany: vi.fn() },
    cuentaBancaria: { findUnique: vi.fn() },
    registroAuditoria: { create: vi.fn() },
    $queryRaw: vi.fn(),
  };
  type Tx = typeof tx;
  const prisma = { ...tx, $transaction: vi.fn((callback: (txArg: Tx) => unknown) => callback(tx)) };
  return { prisma, tx };
}

describe('ComisionesService', () => {
  let prisma: ReturnType<typeof crearPrismaFalso>['prisma'];
  let tx: ReturnType<typeof crearPrismaFalso>['tx'];
  let storage: { guardar: ReturnType<typeof vi.fn>; leer: ReturnType<typeof vi.fn> };
  let service: ComisionesService;

  const DTO = { fecha: hoy(), medioPago: MedioPago.EFECTIVO, motivoSinSoporte: 'Pago en efectivo sin recibo del vendedor' };

  beforeEach(() => {
    ({ prisma, tx } = crearPrismaFalso());
    storage = { guardar: vi.fn().mockResolvedValue({ rutaRelativa: 'finanzas/soporte.pdf' }), leer: vi.fn() };
    vi.mocked(crearMovimientoEnTx).mockReset();
    vi.mocked(crearMovimientoEnTx).mockResolvedValue({ id: 'mov-1' } as never);
    const configuracion = { exigirMedioPagoActivo: vi.fn().mockResolvedValue(undefined), obtenerEmpresa: vi.fn() };
    service = new ComisionesService(prisma as unknown as PrismaService, storage as unknown as StorageService, configuracion as unknown as ConfiguracionService);

    // Lo primero que ve pagar() (fuera de la transacción) y lo que ve dentro, con la fila bloqueada.
    tx.comision.findFirst.mockResolvedValue({ id: 'com-1', estado: EstadoComision.PENDIENTE });
    tx.comision.findUnique.mockResolvedValue(COMISION);
    tx.comision.update.mockResolvedValue({ ...COMISION, estado: EstadoComision.PAGADA });
  });

  describe('pagar (RF-COM-02 y RF-COM-03)', () => {
    it('crea el egreso en la categoría Comisiones del proyecto de la venta y marca la comisión pagada, todo en la misma transacción', async () => {
      await service.pagar('com-1', DTO, GERENTE);

      expect(crearMovimientoEnTx).toHaveBeenCalledTimes(1);
      const [txUsada, datos] = vi.mocked(crearMovimientoEnTx).mock.calls[0];
      expect(txUsada).toBe(tx);
      expect(datos).toMatchObject({
        tipo: 'GASTO',
        proyectoId: 'p-1',
        categoriaId: 'cat-comisiones',
        medioPago: MedioPago.EFECTIVO,
        terceroNombre: 'Luis Gómez',
        terceroDocumento: '555',
        origen: 'COMISION',
        motivoSinSoporte: DTO.motivoSinSoporte,
      });
      expect(datos.valor.toString()).toBe('1000000');
      expect(datos.descripcion).toBe('Comisión de venta · Lote L-1 · Luis Gómez');

      expect(tx.comision.update).toHaveBeenCalledWith({
        where: { id: 'com-1' },
        data: expect.objectContaining({ estado: EstadoComision.PAGADA, movimientoId: 'mov-1', pagadaPorId: GERENTE.id }),
      });
      expect(auditoriaDe(tx.registroAuditoria.create, 'COMISION_PAGAR')).toMatchObject({
        entidad: 'COMISION',
        entidadId: 'com-1',
        usuarioId: GERENTE.id,
        antes: { estado: 'PENDIENTE' },
        despues: { estado: 'PAGADA', movimientoId: 'mov-1' },
      });
    });

    it('bloquea la fila antes de pagar, para que un pago simultáneo espere y no duplique el egreso', async () => {
      await service.pagar('com-1', DTO, GERENTE);
      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('si otra persona la pagó mientras tanto, responde conflicto sin crear un segundo egreso', async () => {
      tx.comision.findUnique.mockResolvedValue({ ...COMISION, estado: EstadoComision.PAGADA, movimientoId: 'mov-0' });
      await expect(service.pagar('com-1', DTO, GERENTE)).rejects.toBeInstanceOf(ConflictException);
      expect(crearMovimientoEnTx).not.toHaveBeenCalled();
      expect(tx.comision.update).not.toHaveBeenCalled();
    });

    it('una comisión ya pagada o anulada no se paga', async () => {
      for (const estado of [EstadoComision.PAGADA, EstadoComision.ANULADA]) {
        tx.comision.findFirst.mockResolvedValue({ id: 'com-1', estado });
        await expect(service.pagar('com-1', DTO, GERENTE)).rejects.toBeInstanceOf(ConflictException);
      }
      expect(crearMovimientoEnTx).not.toHaveBeenCalled();
    });

    it('si el egreso no se puede crear (por ejemplo, un día de caja ya cerrado), la comisión no queda pagada', async () => {
      vi.mocked(crearMovimientoEnTx).mockRejectedValue(new ConflictException('El día ya está en un cierre de caja'));
      await expect(service.pagar('com-1', DTO, GERENTE)).rejects.toBeInstanceOf(ConflictException);
      expect(tx.comision.update).not.toHaveBeenCalled();
      expect(auditoriasDe(tx.registroAuditoria.create)).toEqual([]);
    });

    it('una comisión fuera del alcance del usuario responde 404', async () => {
      tx.comision.findFirst.mockResolvedValue(null);
      await expect(service.pagar('com-1', DTO, usuarioDePrueba(['p-otro']))).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.comision.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'com-1', AND: [{ venta: { lote: { proyectoId: { in: ['p-otro'] } } } }] } }));
    });

    it('exige el soporte del pago o el motivo de por qué no lo hay', async () => {
      await expect(service.pagar('com-1', { fecha: hoy(), medioPago: MedioPago.EFECTIVO }, GERENTE)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.pagar('com-1', { ...DTO, motivoSinSoporte: '   ' }, GERENTE)).rejects.toBeInstanceOf(BadRequestException);
      expect(crearMovimientoEnTx).not.toHaveBeenCalled();
    });

    it('un pago que no es en efectivo exige la cuenta de donde salió el dinero', async () => {
      await expect(service.pagar('com-1', { ...DTO, medioPago: MedioPago.TRANSFERENCIA }, GERENTE)).rejects.toBeInstanceOf(BadRequestException);
      expect(crearMovimientoEnTx).not.toHaveBeenCalled();
    });

    it('no admite una fecha de pago futura', async () => {
      const manana = new Date();
      manana.setDate(manana.getDate() + 2);
      const fecha = `${manana.getFullYear()}-${String(manana.getMonth() + 1).padStart(2, '0')}-${String(manana.getDate()).padStart(2, '0')}`;
      await expect(service.pagar('com-1', { ...DTO, fecha }, GERENTE)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('guarda el soporte con el tipo real del archivo y lo liga al egreso; uno inválido se rechaza antes de guardar nada', async () => {
      const archivo = (buffer: Buffer) => ({ buffer, originalname: 'x.pdf', mimetype: 'application/pdf' }) as Express.Multer.File;

      await expect(service.pagar('com-1', { fecha: hoy(), medioPago: MedioPago.EFECTIVO }, GERENTE, archivo(Buffer.from('no es un pdf')))).rejects.toBeInstanceOf(BadRequestException);
      expect(storage.guardar).not.toHaveBeenCalled();

      await service.pagar('com-1', { fecha: hoy(), medioPago: MedioPago.EFECTIVO }, GERENTE, archivo(PDF));
      expect(storage.guardar).toHaveBeenCalledWith('finanzas', 'soporte.pdf', PDF);
      expect(vi.mocked(crearMovimientoEnTx).mock.calls[0][1]).toMatchObject({ soporteRuta: 'finanzas/soporte.pdf' });
    });
  });

  describe('anular (RF-COM-02)', () => {
    it('una pendiente se marca anulada con su motivo, sin tocar ningún egreso', async () => {
      tx.comision.update.mockResolvedValue({ ...COMISION, estado: EstadoComision.ANULADA });
      await service.anular('com-1', { motivo: 'La venta se cayó antes de pagar' }, GERENTE);

      expect(tx.comision.update).toHaveBeenCalledWith({
        where: { id: 'com-1' },
        data: expect.objectContaining({ estado: EstadoComision.ANULADA, anuladaPorId: GERENTE.id, motivoAnulacion: 'La venta se cayó antes de pagar' }),
      });
      expect(tx.movimientoFinanciero.updateMany).not.toHaveBeenCalled();
      expect(auditoriaDe(tx.registroAuditoria.create, 'COMISION_ANULAR')).toMatchObject({ entidadId: 'com-1', antes: { estado: 'PENDIENTE' }, despues: { estado: 'ANULADA' } });
    });

    it('una pagada anula también su egreso, en la misma transacción, y deja las dos acciones en la auditoría', async () => {
      tx.comision.findUnique.mockResolvedValue({ ...COMISION, estado: EstadoComision.PAGADA, movimientoId: 'mov-1' });
      tx.movimientoFinanciero.findUniqueOrThrow.mockResolvedValue({ id: 'mov-1', valor: D('1000000'), descripcion: 'Comisión de venta', fecha: new Date(2026, 9, 1) });
      tx.movimientoFinanciero.updateMany.mockResolvedValue({ count: 1 });
      tx.comision.update.mockResolvedValue({ ...COMISION, estado: EstadoComision.ANULADA });

      await service.anular('com-1', { motivo: 'El vendedor devolvió el dinero' }, GERENTE);

      expect(tx.movimientoFinanciero.updateMany).toHaveBeenCalledWith({
        where: { id: 'mov-1', estado: 'ACTIVO' },
        data: expect.objectContaining({ estado: 'ANULADO', anuladoPorId: GERENTE.id, motivoAnulacion: 'Anulación de la comisión: El vendedor devolvió el dinero' }),
      });
      const acciones = auditoriasDe(tx.registroAuditoria.create).map((registro) => registro.accion);
      expect(acciones).toEqual(['MOVIMIENTO_ANULAR', 'COMISION_ANULAR']);
    });

    it('si el egreso de una pagada ya estaba anulado, no se anula nada y responde conflicto', async () => {
      tx.comision.findUnique.mockResolvedValue({ ...COMISION, estado: EstadoComision.PAGADA, movimientoId: 'mov-1' });
      tx.movimientoFinanciero.findUniqueOrThrow.mockResolvedValue({ id: 'mov-1', valor: D('1000000'), descripcion: 'x', fecha: new Date() });
      tx.movimientoFinanciero.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.anular('com-1', { motivo: 'Motivo de prueba' }, GERENTE)).rejects.toBeInstanceOf(ConflictException);
      expect(tx.comision.update).not.toHaveBeenCalled();
    });

    it('una comisión ya anulada no se anula otra vez', async () => {
      tx.comision.findUnique.mockResolvedValue({ ...COMISION, estado: EstadoComision.ANULADA });
      await expect(service.anular('com-1', { motivo: 'Motivo de prueba' }, GERENTE)).rejects.toBeInstanceOf(ConflictException);
      expect(tx.comision.update).not.toHaveBeenCalled();
    });

    it('una comisión fuera del alcance responde 404 y no anula nada', async () => {
      tx.comision.findFirst.mockResolvedValue(null);
      await expect(service.anular('com-1', { motivo: 'Motivo de prueba' }, usuarioDePrueba(['p-otro']))).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('listar y pendientes (RF-REP-08 y RF-REP-02)', () => {
    const FILAS = [
      { ...COMISION, id: 'c1', estado: EstadoComision.PENDIENTE, valor: D('1000000'), movimiento: null },
      { ...COMISION, id: 'c2', estado: EstadoComision.PENDIENTE, valor: D('500000'), movimiento: null },
      { ...COMISION, id: 'c3', estado: EstadoComision.PAGADA, valor: D('1000000'), movimiento: { id: 'm', soporteRuta: 'x.pdf', fecha: new Date() } },
    ];

    it('devuelve las comisiones con los totales por estado y sin exponer la ruta del soporte', async () => {
      tx.comision.findMany.mockResolvedValue(FILAS);
      const { comisiones, totales } = await service.listar({}, GERENTE);

      expect(totales.PENDIENTE.cantidad).toBe(2);
      expect(totales.PENDIENTE.valor.toString()).toBe('1500000');
      expect(totales.PAGADA).toMatchObject({ cantidad: 1 });
      expect(totales.ANULADA).toMatchObject({ cantidad: 0 });
      expect(comisiones[2].movimiento).toMatchObject({ tieneSoporte: true });
      expect(comisiones[2].movimiento).not.toHaveProperty('soporteRuta');
    });

    it('filtra por vendedor, estado, proyecto y fechas, y siempre por el alcance del usuario', async () => {
      tx.comision.findMany.mockResolvedValue([]);
      await service.listar({ vendedorId: 'vend-1', estado: EstadoComision.PAGADA, proyectoId: 'p-1', desde: '2026-10-01', hasta: '2026-10-31', fechaPor: 'pago' }, usuarioDePrueba(['p-1']));

      const { where } = tx.comision.findMany.mock.calls[0][0];
      expect(where).toMatchObject({ vendedorId: 'vend-1', estado: EstadoComision.PAGADA });
      expect(JSON.stringify(where)).toContain('"proyectoId":{"in":["p-1"]}');
      expect(JSON.stringify(where)).toContain('"movimiento":{"fecha"');
    });

    it('por defecto el rango de fechas es el de la venta', async () => {
      tx.comision.findMany.mockResolvedValue([]);
      await service.listar({ desde: '2026-10-01' }, GERENTE);
      expect(JSON.stringify(tx.comision.findMany.mock.calls[0][0].where)).toContain('"venta":{"fechaVenta"');
    });

    it('cuenta y suma las pendientes para el tablero', async () => {
      tx.comision.aggregate.mockResolvedValue({ _count: 2, _sum: { valor: D('1500000') } });
      const pendientes = await service.pendientes(GERENTE);
      expect(pendientes.cantidad).toBe(2);
      expect(pendientes.valor.toString()).toBe('1500000');
      expect(tx.comision.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ estado: EstadoComision.PENDIENTE }) }));
    });

    it('sin pendientes devuelve cero, no nulo', async () => {
      tx.comision.aggregate.mockResolvedValue({ _count: 0, _sum: { valor: null } });
      expect((await service.pendientes(GERENTE)).valor.toString()).toBe('0');
    });
  });
});
