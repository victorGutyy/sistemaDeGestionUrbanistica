import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { MedioPago, TipoMovimiento } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { auditoriaDe, auditoriasDe } from '../test-utils/auditoria.js';
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
    movimientoFinanciero: { create: vi.fn().mockResolvedValue({ id: 'm-1' }), updateMany: vi.fn() },
    registroAuditoria: { create: vi.fn() },
    proyecto: { findUnique: vi.fn().mockResolvedValue({ tipo: 'LOTES' }) },
    equipo: { findUnique: vi.fn() },
  };
  const prisma = {
    proyecto: { findUnique: vi.fn().mockResolvedValue({ id: 'p-1', nombre: 'Proyecto de prueba', tipo: 'LOTES' }) },
    cuentaBancaria: { findUnique: vi.fn() },
    // anular se hace en una transacción: usa el mismo falso de updateMany que la base "normal".
    movimientoFinanciero: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), updateMany: tx.movimientoFinanciero.updateMany },
    venta: { findMany: vi.fn().mockResolvedValue([]) },
    pagoNomina: { findMany: vi.fn().mockResolvedValue([]) },
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
    prisma.movimientoFinanciero.findFirst.mockResolvedValue({ id: 'm-1', tipo: 'GASTO', valor: D('250000'), descripcion: 'Cemento', fecha: new Date(2026, 9, 1), soporteRuta: null, categoriaGasto: null, categoriaIngreso: null });
    prisma.movimientoFinanciero.updateMany.mockResolvedValue({ count: 1 });

    await service.anular('m-1', { motivo: '  Se registró dos veces  ' }, USUARIO);

    expect(prisma.movimientoFinanciero.updateMany).toHaveBeenCalledWith({
      where: { id: 'm-1', estado: 'ACTIVO' },
      data: expect.objectContaining({ estado: 'ANULADO', anuladoPorId: USUARIO.id, motivoAnulacion: 'Se registró dos veces', anuladoEn: expect.any(Date) }),
    });
  });

  it('la anulación deja en la auditoría quién, cuándo y por qué, con el estado antes y después (RF-AUD-01)', async () => {
    const { prisma, tx } = crearPrismaFalso();
    const service = new FinanzasService(prisma as unknown as PrismaService, {} as StorageService, {} as ConfiguracionService);
    prisma.movimientoFinanciero.findFirst.mockResolvedValue({ id: 'm-1', tipo: 'GASTO', valor: D('250000'), descripcion: 'Cemento', fecha: new Date(2026, 9, 1), soporteRuta: null, categoriaGasto: null, categoriaIngreso: null });
    prisma.movimientoFinanciero.updateMany.mockResolvedValue({ count: 1 });

    await service.anular('m-1', { motivo: 'Se registró dos veces' }, USUARIO);

    expect(auditoriaDe(tx.registroAuditoria.create, 'MOVIMIENTO_ANULAR')).toMatchObject({
      entidad: 'MOVIMIENTO',
      entidadId: 'm-1',
      usuarioId: USUARIO.id,
      antes: { estado: 'ACTIVO', valor: '250000' },
      despues: { estado: 'ANULADO', motivoAnulacion: 'Se registró dos veces' },
    });
  });

  it('si el movimiento ya estaba anulado, no queda un segundo registro de anulación', async () => {
    const { prisma, tx } = crearPrismaFalso();
    const service = new FinanzasService(prisma as unknown as PrismaService, {} as StorageService, {} as ConfiguracionService);
    prisma.movimientoFinanciero.findFirst.mockResolvedValue({ id: 'm-1', tipo: 'GASTO', valor: D('1'), descripcion: 'x', fecha: new Date() });
    prisma.movimientoFinanciero.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.anular('m-1', { motivo: 'Otra vez' }, USUARIO)).rejects.toThrow();
    expect(auditoriasDe(tx.registroAuditoria.create)).toEqual([]);
  });

  it('el egreso de una comisión no se anula desde Finanzas: se anula la comisión, para que ambos queden coherentes (RF-COM-03)', async () => {
    const { prisma, tx } = crearPrismaFalso();
    const service = new FinanzasService(prisma as unknown as PrismaService, {} as StorageService, {} as ConfiguracionService);
    prisma.movimientoFinanciero.findFirst.mockResolvedValue({ id: 'm-1', tipo: 'GASTO', valor: D('1000000'), descripcion: 'Comisión de venta', fecha: new Date(), origen: 'COMISION' });
    await expect(service.anular('m-1', { motivo: 'Quiero anularlo' }, USUARIO)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.movimientoFinanciero.updateMany).not.toHaveBeenCalled();
    expect(auditoriasDe(tx.registroAuditoria.create)).toEqual([]);
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

describe('FinanzasService: la nómina cuesta a su obra (CC-05, RF-PER-09 y RF-PER-10)', () => {
  const pago = (cambios: object) => ({ proyectoId: 'p-1', fechaPago: new Date(2026, 9, 15), periodoInicio: new Date(2026, 9, 1), periodoFin: new Date(2026, 9, 15), valorDevengado: D('600000'), valorPagado: D('480000'), ...cambios });
  const servicio = (prisma: object) => new FinanzasService(prisma as unknown as PrismaService, {} as StorageService, {} as ConfiguracionService);

  it('en las finanzas de la obra, la nómina entra como UN gasto por quincena y a su costo (lo devengado), sin nombres', async () => {
    const { prisma } = crearPrismaFalso();
    prisma.pagoNomina.findMany.mockResolvedValue([pago({}), pago({ valorDevengado: D('400000'), valorPagado: D('400000') }), pago({ fechaPago: new Date(2026, 9, 31), periodoInicio: new Date(2026, 9, 16), periodoFin: new Date(2026, 9, 31) })]);

    const resultado = await servicio(prisma).finanzasDeProyecto('p-1', {}, USUARIO);

    const filas = resultado.movimientos.filter((f) => f.origen === 'NOMINA');
    expect(filas).toHaveLength(2);
    expect(filas.map((f) => f.valor.toString()).sort()).toEqual(['1000000', '600000']);
    expect(filas.find((f) => f.valor.toString() === '1000000')?.descripcion).toBe('Nómina del 01/10/2026 al 15/10/2026 · 2 trabajadores');
    expect(filas[0]).toMatchObject({ tipo: 'GASTO', categoria: 'Nómina', medioPago: null });
    // La utilidad de la obra baja en lo que cuesta la nómina.
    expect(resultado.resumen.egresos.toString()).toBe('1600000');
    expect(resultado.resumen.utilidad.toString()).toBe('-1600000');
    expect(prisma.pagoNomina.findMany.mock.calls[0][0].where).toMatchObject({ proyectoId: 'p-1' });
  });

  it('un pago anterior a CC-05 (sin devengado) cuesta lo que se pagó', async () => {
    const { prisma } = crearPrismaFalso();
    prisma.pagoNomina.findMany.mockResolvedValue([pago({ valorDevengado: null, valorPagado: D('750000') })]);
    const resultado = await servicio(prisma).finanzasDeProyecto('p-1', {}, USUARIO);
    expect(resultado.resumen.egresos.toString()).toBe('750000');
  });

  it('en el consolidado, cada pago cuenta en SU obra y a su costo; el de antes de CC-05, en general', async () => {
    const base = crearPrismaFalso().prisma;
    const prisma = { ...base, proyecto: { ...base.proyecto, findMany: vi.fn().mockResolvedValue([{ id: 'p-1', nombre: 'Obra Uno' }, { id: 'p-2', nombre: 'Obra Dos' }]) } };
    prisma.pagoNomina.findMany.mockResolvedValue([
      { proyectoId: 'p-1', fechaPago: new Date(2026, 9, 15), valorDevengado: D('600000'), valorPagado: D('480000') },
      { proyectoId: 'p-2', fechaPago: new Date(2026, 9, 15), valorDevengado: D('300000'), valorPagado: D('300000') },
      { proyectoId: null, fechaPago: new Date(2026, 9, 15), valorDevengado: null, valorPagado: D('100000') },
    ]);

    const consolidado = await servicio(prisma).consolidado({}, USUARIO);

    expect(consolidado.gastos.toString()).toBe('1000000');
    const porProyecto = (nombre: string) => consolidado.porProyecto.find((p) => p.nombre === nombre);
    expect(porProyecto('Obra Uno')?.gastos.toString()).toBe('600000');
    expect(porProyecto('Obra Dos')?.gastos.toString()).toBe('300000');
  });

  it('quien está limitado a proyectos solo cuenta la nómina de los suyos', async () => {
    const base = crearPrismaFalso().prisma;
    const prisma = { ...base, proyecto: { ...base.proyecto, findMany: vi.fn().mockResolvedValue([]) } };
    await servicio(prisma).consolidado({}, { ...USUARIO, proyectoIds: ['p-1'] });
    expect(prisma.pagoNomina.findMany.mock.calls[0][0].where).toEqual({ proyectoId: { in: ['p-1'] } });

    await servicio(prisma).consolidado({}, { ...USUARIO, proyectoIds: null });
    expect(prisma.pagoNomina.findMany.mock.calls[1][0].where).toEqual({});
  });
});
