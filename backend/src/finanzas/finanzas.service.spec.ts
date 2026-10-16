import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { MedioPago, TipoMovimiento } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import { FinanzasService } from './finanzas.service.js';

const D = (v: string) => new Prisma.Decimal(v);
const PDF = Buffer.from('%PDF-1.4 contenido');
const USUARIO = usuarioDePrueba();

function crearPrismaFalso() {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    cierreCaja: { findFirst: vi.fn().mockResolvedValue(null) },
    categoriaGasto: { findUnique: vi.fn().mockResolvedValue({ id: 'cat-gasto', nombre: 'Materiales', activa: true }) },
    categoriaIngreso: { findUnique: vi.fn().mockResolvedValue({ id: 'cat-ingreso', nombre: 'Otros servicios', activa: true }) },
    movimientoFinanciero: { create: vi.fn().mockResolvedValue({ id: 'm-1' }) },
  };
  const prisma = {
    proyecto: { findUnique: vi.fn().mockResolvedValue({ id: 'p-1', nombre: 'Proyecto de prueba', tipo: 'LOTES' }) },
    cuentaBancaria: { findUnique: vi.fn() },
    movimientoFinanciero: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() },
    venta: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn((callback: (txArg: typeof tx) => unknown) => callback(tx)),
  };
  return { prisma, tx };
}

const DTO = {
  tipo: TipoMovimiento.GASTO,
  fecha: '2026-10-01',
  valor: '250000',
  descripcion: 'Cemento para la obra',
  proyectoId: 'p-1',
  categoriaId: 'cat-gasto',
  medioPago: MedioPago.EFECTIVO,
} as const;

describe('FinanzasService.crear (RF-EGR-01, 02, 03 y 09)', () => {
  let prisma: ReturnType<typeof crearPrismaFalso>['prisma'];
  let tx: ReturnType<typeof crearPrismaFalso>['tx'];
  let storage: { guardar: ReturnType<typeof vi.fn>; leer: ReturnType<typeof vi.fn> };
  let configuracion: { exigirMedioPagoActivo: ReturnType<typeof vi.fn> };
  let service: FinanzasService;

  beforeEach(() => {
    ({ prisma, tx } = crearPrismaFalso());
    storage = { guardar: vi.fn().mockResolvedValue({ rutaRelativa: 'finanzas/soporte.pdf' }), leer: vi.fn() };
    configuracion = { exigirMedioPagoActivo: vi.fn().mockResolvedValue(undefined) };
    service = new FinanzasService(prisma as unknown as PrismaService, storage as unknown as StorageService, configuracion as unknown as ConfiguracionService);
    // obtener() devuelve el movimiento recién creado.
    prisma.movimientoFinanciero.findFirst.mockResolvedValue({ id: 'm-1', soporteRuta: null, categoriaGasto: { id: 'cat-gasto', nombre: 'Materiales' }, categoriaIngreso: null });
  });

  it('un egreso sin soporte ni motivo se rechaza antes de guardar nada', async () => {
    await expect(service.crear({ ...DTO }, USUARIO)).rejects.toThrow(/soporte/);
    expect(storage.guardar).not.toHaveBeenCalled();
    expect(tx.movimientoFinanciero.create).not.toHaveBeenCalled();
  });

  it('un egreso con motivo se guarda; con soporte, el archivo se guarda con el nombre que fija el servidor', async () => {
    await service.crear({ ...DTO, motivoSinSoporte: 'No entregaron factura' }, USUARIO);
    expect(tx.movimientoFinanciero.create.mock.calls[0][0].data).toMatchObject({ motivoSinSoporte: 'No entregaron factura', registradoPorId: USUARIO.id });

    await service.crear({ ...DTO }, USUARIO, { originalname: '../../raro.exe', mimetype: 'application/pdf', buffer: PDF } as Express.Multer.File);
    expect(storage.guardar).toHaveBeenCalledWith('finanzas', 'soporte.pdf', PDF);
    expect(tx.movimientoFinanciero.create.mock.calls[1][0].data).toMatchObject({ soporteRuta: 'finanzas/soporte.pdf' });
  });

  it('un soporte que no es PDF ni imagen se rechaza aunque el navegador diga que sí lo es', async () => {
    await expect(
      service.crear({ ...DTO }, USUARIO, { originalname: 'x.pdf', mimetype: 'application/pdf', buffer: Buffer.from('MZ ejecutable') } as Express.Multer.File),
    ).rejects.toThrow(/imagen \(JPG\/PNG\) o un PDF/);
    expect(storage.guardar).not.toHaveBeenCalled();
  });

  it('un ingreso no necesita soporte', async () => {
    await expect(service.crear({ ...DTO, tipo: TipoMovimiento.INGRESO, categoriaId: 'cat-ingreso' }, USUARIO)).resolves.toBeDefined();
    expect(tx.movimientoFinanciero.create.mock.calls[0][0].data).toMatchObject({ tipo: 'INGRESO', categoriaIngresoId: 'cat-ingreso' });
  });

  it('un pago que no es en efectivo exige la cuenta; el mensaje del egreso dice "de donde salió"', async () => {
    await expect(
      service.crear({ ...DTO, medioPago: MedioPago.TRANSFERENCIA, motivoSinSoporte: 'x' }, USUARIO),
    ).rejects.toThrow(/de donde salió el dinero/);
    await expect(
      service.crear({ ...DTO, tipo: TipoMovimiento.INGRESO, categoriaId: 'cat-ingreso', medioPago: MedioPago.TRANSFERENCIA }, USUARIO),
    ).rejects.toThrow(/donde entró el dinero/);
  });

  it('respeta los medios de pago que el gerente tiene deshabilitados', async () => {
    configuracion.exigirMedioPagoActivo.mockRejectedValue(new BadRequestException('Medio no habilitado'));
    await expect(service.crear({ ...DTO, motivoSinSoporte: 'x' }, USUARIO)).rejects.toThrow(/no habilitado/);
    expect(tx.movimientoFinanciero.create).not.toHaveBeenCalled();
  });

  it('rechaza una fecha futura y un proyecto que no existe', async () => {
    await expect(service.crear({ ...DTO, motivoSinSoporte: 'x', fecha: '2999-01-01' }, USUARIO)).rejects.toThrow(/futura/);
    prisma.proyecto.findUnique.mockResolvedValue(null);
    await expect(service.crear({ ...DTO, motivoSinSoporte: 'x' }, USUARIO)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('un gasto general (sin proyecto) se acepta con alcance total', async () => {
    await service.crear({ ...DTO, proyectoId: undefined, motivoSinSoporte: 'x' }, USUARIO);
    expect(tx.movimientoFinanciero.create.mock.calls[0][0].data.proyectoId).toBeNull();
  });
});

describe('FinanzasService.anular (RF-EGR-04)', () => {
  it('marca el movimiento como anulado con quién, cuándo y por qué, sin borrarlo', async () => {
    const { prisma } = crearPrismaFalso();
    const service = new FinanzasService(prisma as unknown as PrismaService, {} as StorageService, {} as ConfiguracionService);
    prisma.movimientoFinanciero.findFirst.mockResolvedValue({ id: 'm-1', soporteRuta: null, categoriaGasto: null, categoriaIngreso: null });
    prisma.movimientoFinanciero.updateMany.mockResolvedValue({ count: 1 });

    await service.anular('m-1', { motivo: '  Se registró dos veces  ' }, USUARIO);

    expect(prisma.movimientoFinanciero.updateMany).toHaveBeenCalledWith({
      where: { id: 'm-1', estado: 'ACTIVO' },
      data: expect.objectContaining({ estado: 'ANULADO', anuladoPorId: USUARIO.id, motivoAnulacion: 'Se registró dos veces', anuladoEn: expect.any(Date) }),
    });
  });

  it('un movimiento ya anulado no se vuelve a anular', async () => {
    const { prisma } = crearPrismaFalso();
    const service = new FinanzasService(prisma as unknown as PrismaService, {} as StorageService, {} as ConfiguracionService);
    prisma.movimientoFinanciero.findFirst.mockResolvedValue({ id: 'm-1' });
    prisma.movimientoFinanciero.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.anular('m-1', { motivo: 'Otra vez' }, USUARIO)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('FinanzasService.obtenerSoporte', () => {
  it('entrega el soporte con el tipo detectado por su contenido y responde 404 si no hay', async () => {
    const { prisma } = crearPrismaFalso();
    const storage = { leer: vi.fn().mockResolvedValue(PDF) };
    const service = new FinanzasService(prisma as unknown as PrismaService, storage as unknown as StorageService, {} as ConfiguracionService);

    prisma.movimientoFinanciero.findFirst.mockResolvedValue({ soporteRuta: 'finanzas/soporte.pdf' });
    expect((await service.obtenerSoporte('m-1', USUARIO)).contentType).toBe('application/pdf');

    prisma.movimientoFinanciero.findFirst.mockResolvedValue({ soporteRuta: null });
    await expect(service.obtenerSoporte('m-1', USUARIO)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('FinanzasService.consolidado: no cuenta lo anulado', () => {
  it('solo trae movimientos vigentes', async () => {
    const { prisma } = crearPrismaFalso();
    const prismaConNomina = { ...prisma, pagoNomina: { findMany: vi.fn().mockResolvedValue([]) }, proyecto: { findMany: vi.fn().mockResolvedValue([]) } };
    const service = new FinanzasService(prismaConNomina as unknown as PrismaService, {} as StorageService, {} as ConfiguracionService);

    await service.consolidado({}, USUARIO);

    expect(prisma.movimientoFinanciero.findMany).toHaveBeenCalledWith({ where: expect.objectContaining({ estado: 'ACTIVO' }) });
  });
});

describe('FinanzasService.finanzasDeProyecto (RF-EGR-05, 06 y 08)', () => {
  it('une movimientos y abonos en un detalle, y la utilidad solo cuenta lo vigente', async () => {
    const { prisma } = crearPrismaFalso();
    const service = new FinanzasService(prisma as unknown as PrismaService, {} as StorageService, {} as ConfiguracionService);
    const base = { cuentaId: null, cuenta: null, referencia: null, terceroNombre: null, numeroDocumento: null, soporteRuta: null, registradoPor: { nombre: 'Usuario Prueba' }, ventaId: null };
    prisma.movimientoFinanciero.findMany.mockResolvedValue([
      { ...base, id: 'g1', tipo: 'GASTO', fecha: new Date(2026, 9, 3), valor: D('400000'), descripcion: 'Cemento', medioPago: 'EFECTIVO', estado: 'ACTIVO', categoriaGasto: { nombre: 'Materiales' }, categoriaIngreso: null },
      { ...base, id: 'g2', tipo: 'GASTO', fecha: new Date(2026, 9, 4), valor: D('900000'), descripcion: 'Repetido', medioPago: 'EFECTIVO', estado: 'ANULADO', categoriaGasto: { nombre: 'Materiales' }, categoriaIngreso: null },
    ]);
    prisma.venta.findMany.mockResolvedValue([
      {
        id: 'v1',
        estado: 'ACTIVA',
        valorTotal: D('100000000'),
        cliente: { nombre: 'Cliente de Prueba' },
        lote: { numero: 'L-1' },
        abonos: [
          { id: 'a1', fecha: new Date(2026, 9, 2), valor: D('30000000'), medioPago: 'EFECTIVO', estado: 'ACTIVO', referencia: null, comprobanteUrl: null, recibo: { numeroTexto: 'RC-000001' }, cuentaDestino: null, registradoPor: { nombre: 'Usuario Prueba' } },
          { id: 'a2', fecha: new Date(2026, 9, 2), valor: D('5000000'), medioPago: 'EFECTIVO', estado: 'ANULADO', referencia: null, comprobanteUrl: null, recibo: { numeroTexto: 'RC-000002' }, cuentaDestino: null, registradoPor: null },
        ],
      },
    ]);

    const resultado = await service.finanzasDeProyecto('p-1', {}, USUARIO);

    expect(resultado.movimientos.map((f) => f.id)).toEqual(['g2', 'g1', 'a1', 'a2']);
    expect(resultado.movimientos.find((f) => f.id === 'a1')).toMatchObject({ origen: 'ABONO', tipo: 'INGRESO', recibo: 'RC-000001', categoria: 'Cuotas y abonos de lotes' });
    expect(resultado.resumen.ingresosPorVentas.toString()).toBe('30000000');
    expect(resultado.resumen.egresos.toString()).toBe('400000');
    expect(resultado.resumen.utilidad.toString()).toBe('29600000');
    expect(resultado.resumen.valorVendido.toString()).toBe('100000000');
    expect(resultado.resumen.saldoPorCobrar.toString()).toBe('70000000');
  });

  it('el período filtra el detalle pero no lo vendido ni el saldo por cobrar', async () => {
    const { prisma } = crearPrismaFalso();
    const service = new FinanzasService(prisma as unknown as PrismaService, {} as StorageService, {} as ConfiguracionService);
    prisma.venta.findMany.mockResolvedValue([
      {
        id: 'v1',
        estado: 'ACTIVA',
        valorTotal: D('100000000'),
        cliente: { nombre: 'Cliente de Prueba' },
        lote: { numero: 'L-1' },
        abonos: [{ id: 'a1', fecha: new Date(2026, 8, 1), valor: D('30000000'), medioPago: 'EFECTIVO', estado: 'ACTIVO', referencia: null, comprobanteUrl: null, recibo: null, cuentaDestino: null, registradoPor: null }],
      },
    ]);

    const resultado = await service.finanzasDeProyecto('p-1', { desde: '2026-10-01', hasta: '2026-10-31' }, USUARIO);

    expect(resultado.movimientos).toHaveLength(0);
    expect(resultado.resumen.totalIngresos.toString()).toBe('0');
    expect(resultado.resumen.saldoPorCobrar.toString()).toBe('70000000');
  });
});
