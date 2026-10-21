import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { MedioPago } from '../generated/prisma/enums.js';
import type { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { auditoriaDe, auditoriasDe } from '../test-utils/auditoria.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import { AbonosService } from './abonos.service.js';
import type { ContextoRecibo } from './crear-abono-tx.js';

const PDF = Buffer.from('%PDF-1.4 contenido');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

const CONTEXTO: ContextoRecibo = {
  prefijoRecibo: 'RC-',
  recibidoPor: 'Usuario Prueba',
  usuario: { id: 'usuario-prueba', nombre: 'Usuario Prueba', email: 'prueba@ejemplo.test' },
  empresa: {
    nombreComercial: 'Empresa de prueba',
    razonSocial: 'Empresa de prueba SAS',
    nit: '900000000',
    direccion: null,
    telefonos: null,
    correo: null,
    logoRuta: null,
    colorPrimario: '#2563eb',
    textoLegal: null,
  },
};

const D = (v: string) => new Prisma.Decimal(v);
const FECHA = (mes: number) => new Date(2026, mes, 1);

// Venta de 45.000.000: cuota inicial (0) de 30.000.000 y tres cuotas de 5.000.000.
function ventaConCuotas(pagadoPorCuota: Record<number, string> = {}) {
  const valores: [number, number, string][] = [
    [0, 0, '30000000'],
    [1, 1, '5000000'],
    [2, 2, '5000000'],
    [3, 3, '5000000'],
  ];
  const cuotas = valores.map(([numero, mes, valor]) => ({
    id: `cuota-${numero}`,
    numero,
    fechaVencimiento: FECHA(mes),
    valor: D(valor),
    estado: 'PENDIENTE',
    aplicaciones: pagadoPorCuota[numero] ? [{ valor: D(pagadoPorCuota[numero]) }] : [],
  }));
  const pagado = Object.values(pagadoPorCuota).reduce((t, v) => t.plus(v), D('0'));
  return {
    id: 'venta-1',
    valorTotal: D('45000000'),
    cliente: { nombre: 'Cliente de Prueba', documento: '1000000001' },
    lote: { numero: 'L-1', proyecto: { nombre: 'Proyecto de prueba' }, manzana: { nombre: 'Manzana A' } },
    cuotas,
    abonos: pagado.greaterThan(0) ? [{ valor: pagado }] : [],
  };
}

function crearPrismaFalso() {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ ultimo: 1 }]),
    $executeRaw: vi.fn().mockResolvedValue(0),
    registroAuditoria: { create: vi.fn() },
    cierreCaja: { findFirst: vi.fn().mockResolvedValue(null) },
    venta: { findUnique: vi.fn() },
    cuentaBancaria: { findUnique: vi.fn() },
    abono: { create: vi.fn(), findFirst: vi.fn().mockResolvedValue(null), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
    aplicacionAbono: { createMany: vi.fn(), aggregate: vi.fn().mockResolvedValue({ _sum: { valor: null } }) },
    cuota: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    recibo: { create: vi.fn() },
  };
  type Tx = typeof tx;
  const prisma = {
    venta: { findFirst: vi.fn() },
    cuentaBancaria: { findUnique: vi.fn() },
    abono: { findFirst: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn((callback: (txArg: Tx) => unknown) => callback(tx)),
  };
  return { prisma, tx };
}

const VENTA_ACTIVA = { id: 'venta-1', clienteId: 'cliente-1', estado: 'ACTIVA' };
const USUARIO = usuarioDePrueba();
const DTO_BASE = { ventaId: 'venta-1', fecha: '2026-02-01', valor: '100', medioPago: MedioPago.EFECTIVO };

// El recibo por correo no se prueba aquí (vive en el servicio de notificaciones); basta con que el aviso no estorbe.
const enviarReciboFalso = vi.fn().mockResolvedValue(undefined);
const notificacionesFalsas = { enviarReciboAlRegistrar: enviarReciboFalso } as unknown as NotificacionesService;

describe('AbonosService.crear', () => {
  let prisma: ReturnType<typeof crearPrismaFalso>['prisma'];
  let tx: ReturnType<typeof crearPrismaFalso>['tx'];
  let storage: { guardar: ReturnType<typeof vi.fn>; leer: ReturnType<typeof vi.fn> };
  let configuracion: { exigirMedioPagoActivo: ReturnType<typeof vi.fn>; contextoRecibo: ReturnType<typeof vi.fn> };
  let service: AbonosService;

  // Prepara la base falsa para que un abono de `valor` sobre la venta de prueba se guarde sin problemas.
  function prepararAbonoExitoso(venta = ventaConCuotas()) {
    tx.venta.findUnique.mockResolvedValue(venta);
    tx.abono.create.mockResolvedValue({ id: 'abono-1' });
    tx.cuota.findUniqueOrThrow.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(venta.cuotas.find((cuota) => cuota.id === where.id)),
    );
    tx.recibo.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'recibo-1', ...data }));
  }

  beforeEach(() => {
    ({ prisma, tx } = crearPrismaFalso());
    storage = { guardar: vi.fn(), leer: vi.fn() };
    configuracion = {
      exigirMedioPagoActivo: vi.fn().mockResolvedValue(undefined),
      contextoRecibo: vi.fn().mockResolvedValue(CONTEXTO),
    };
    service = new AbonosService(
      prisma as unknown as PrismaService,
      storage as unknown as StorageService,
      configuracion as unknown as ConfiguracionService,
      notificacionesFalsas,
    );
  });

  it.each(['PENDIENTE_APROBACION', 'RECHAZADA', 'DESISTIDA'])('no se registran abonos en una venta %s', async (estado) => {
    prisma.venta.findFirst.mockResolvedValue({ ...VENTA_ACTIVA, estado });

    await expect(service.crear(DTO_BASE, USUARIO)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.abono.create).not.toHaveBeenCalled();
  });

  it('rechaza un medio de pago que el gerente tiene deshabilitado, sin guardar nada', async () => {
    prisma.venta.findFirst.mockResolvedValue(VENTA_ACTIVA);
    configuracion.exigirMedioPagoActivo.mockRejectedValue(new BadRequestException('Medio no habilitado'));

    await expect(service.crear({ ...DTO_BASE, medioPago: MedioPago.CHEQUE }, USUARIO)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.abono.create).not.toHaveBeenCalled();
    expect(storage.guardar).not.toHaveBeenCalled();
  });

  it('rechaza si la venta no existe o está fuera del alcance del usuario', async () => {
    prisma.venta.findFirst.mockResolvedValue(null);
    await expect(service.crear({ ...DTO_BASE, ventaId: 'venta-x' }, USUARIO)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('un pago que no es en efectivo exige la cuenta destino (RF-REC-01)', async () => {
    prisma.venta.findFirst.mockResolvedValue(VENTA_ACTIVA);

    await expect(service.crear({ ...DTO_BASE, medioPago: MedioPago.TRANSFERENCIA }, USUARIO)).rejects.toThrow(/cuenta donde entró/);
    expect(tx.abono.create).not.toHaveBeenCalled();
  });

  it('rechaza una cuenta destino desactivada', async () => {
    prisma.venta.findFirst.mockResolvedValue(VENTA_ACTIVA);
    prisma.cuentaBancaria.findUnique.mockResolvedValue({ id: 'cuenta-1', alias: 'Ahorros', activa: false });

    await expect(
      service.crear({ ...DTO_BASE, medioPago: MedioPago.TRANSFERENCIA, cuentaDestinoId: 'cuenta-1' }, USUARIO),
    ).rejects.toThrow(/desactivada/);
  });

  it('rechaza una fecha futura', async () => {
    prisma.venta.findFirst.mockResolvedValue(VENTA_ACTIVA);
    const manana = new Date();
    manana.setDate(manana.getDate() + 2);
    const iso = `${manana.getFullYear()}-${String(manana.getMonth() + 1).padStart(2, '0')}-${String(manana.getDate()).padStart(2, '0')}`;

    await expect(service.crear({ ...DTO_BASE, fecha: iso }, USUARIO)).rejects.toThrow(/futura/);
  });

  it('rechaza un soporte que no es PDF ni imagen aunque lo declare así el navegador', async () => {
    prisma.venta.findFirst.mockResolvedValue(VENTA_ACTIVA);

    await expect(
      service.crear(DTO_BASE, USUARIO, { originalname: 'soporte.pdf', mimetype: 'application/pdf', buffer: Buffer.from('MZ ejecutable') } as Express.Multer.File),
    ).rejects.toThrow(/imagen \(JPG\/PNG\) o un PDF/);
    expect(storage.guardar).not.toHaveBeenCalled();
  });

  it('guarda el soporte con el nombre fijado por el servidor según su tipo real', async () => {
    prisma.venta.findFirst.mockResolvedValue(VENTA_ACTIVA);
    storage.guardar.mockResolvedValue({ rutaRelativa: 'cliente-1/venta-1/soporte.png' });
    prepararAbonoExitoso();

    await service.crear(DTO_BASE, USUARIO, { originalname: '../../raro.pdf', mimetype: 'application/pdf', buffer: PNG } as Express.Multer.File);

    expect(storage.guardar).toHaveBeenCalledWith('cliente-1/venta-1', 'soporte.png', PNG);
    expect(tx.abono.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ comprobanteUrl: 'cliente-1/venta-1/soporte.png' }) }),
    );
  });

  it('no registra un abono con fecha dentro de un cierre de caja cerrado o aprobado (RF-CAJ-05)', async () => {
    prisma.venta.findFirst.mockResolvedValue(VENTA_ACTIVA);
    prepararAbonoExitoso();
    tx.cierreCaja.findFirst.mockResolvedValue({ numeroTexto: 'CC-000007', desde: new Date('2026-02-01T00:00:00Z'), hasta: new Date('2026-02-07T00:00:00Z') });

    await expect(service.crear({ ...DTO_BASE, fecha: '2026-02-03' }, USUARIO)).rejects.toThrow(/CC-000007/);
    expect(tx.abono.create).not.toHaveBeenCalled();
    expect(tx.recibo.create).not.toHaveBeenCalled();
    // Antes de revisar se toma el bloqueo compartido que ordena los registros con el cierre.
    expect(tx.$executeRaw).toHaveBeenCalled();
  });

  it('abono parcial: se aplica a la primera cuota pendiente y el recibo muestra saldo anterior y nuevo', async () => {
    prisma.venta.findFirst.mockResolvedValue(VENTA_ACTIVA);
    prepararAbonoExitoso();

    const resultado = await service.crear({ ...DTO_BASE, valor: '10000000' }, USUARIO);

    // Auditoría (RF-AUD-01): el abono y el recibo emitido, con quién los registró.
    const abonoAuditado = auditoriaDe(tx.registroAuditoria.create, 'ABONO_REGISTRAR');
    expect(abonoAuditado).toMatchObject({ entidad: 'ABONO', entidadId: 'abono-1', usuarioId: USUARIO.id });
    expect(abonoAuditado.despues).toMatchObject({ valor: '10000000', medioPago: 'EFECTIVO', saldoAnterior: '45000000', saldoNuevo: '35000000' });
    expect(auditoriaDe(tx.registroAuditoria.create, 'RECIBO_EMITIR')).toMatchObject({ entidad: 'RECIBO', entidadId: 'recibo-1' });

    expect(tx.aplicacionAbono.createMany).toHaveBeenCalledWith({
      data: [{ abonoId: 'abono-1', cuotaId: 'cuota-0', valor: D('10000000') }],
    });
    expect(resultado.cuotasCubiertas).toEqual([{ numero: 0, valor: D('10000000'), completa: false }]);
    const contenido = tx.recibo.create.mock.calls[0][0].data.contenido;
    expect(contenido.saldoAnterior).toBe('45000000');
    expect(contenido.saldoNuevo).toBe('35000000');
    expect(contenido.valorEnLetras).toBe('DIEZ MILLONES DE PESOS M/CTE');
  });

  it('al guardar el abono dispara el recibo por correo (RF-NOT-01) y un abono rechazado no lo dispara', async () => {
    const enviar = enviarReciboFalso;
    enviar.mockClear();

    prisma.venta.findFirst.mockResolvedValue(null);
    await expect(service.crear({ ...DTO_BASE, ventaId: 'venta-x' }, USUARIO)).rejects.toBeInstanceOf(NotFoundException);
    expect(enviar).not.toHaveBeenCalled();

    prisma.venta.findFirst.mockResolvedValue(VENTA_ACTIVA);
    prepararAbonoExitoso();
    await service.crear({ ...DTO_BASE, valor: '10000000' }, USUARIO);
    expect(enviar).toHaveBeenCalledWith('abono-1', USUARIO.id);
  });

  it('un abono grande se reparte entre varias cuotas por orden de vencimiento (RF-REC-03)', async () => {
    prisma.venta.findFirst.mockResolvedValue(VENTA_ACTIVA);
    prepararAbonoExitoso(ventaConCuotas({ 0: '30000000' }));
    // Lo aplicado a cada cuota por abonos activos, tal como lo leería la base de datos tras guardar este abono.
    const aplicado: Record<string, string> = { 'cuota-1': '5000000', 'cuota-2': '2000000' };
    tx.aplicacionAbono.aggregate.mockImplementation(({ where }: { where: { cuotaId: string } }) =>
      Promise.resolve({ _sum: { valor: aplicado[where.cuotaId] ? D(aplicado[where.cuotaId]) : null } }),
    );

    const resultado = await service.crear({ ...DTO_BASE, valor: '7000000' }, USUARIO);

    expect(resultado.cuotasCubiertas.map((c) => [c.numero, c.valor.toString(), c.completa])).toEqual([
      [1, '5000000', true],
      [2, '2000000', false],
    ]);
    expect(tx.cuota.update).toHaveBeenCalledWith({ where: { id: 'cuota-1' }, data: { estado: 'PAGADA' } });
    expect(tx.cuota.update).toHaveBeenCalledWith({ where: { id: 'cuota-2' }, data: { estado: 'PARCIAL' } });
  });

  it('un abono que se rechaza no deja nada en la auditoría', async () => {
    prisma.venta.findFirst.mockResolvedValue(VENTA_ACTIVA);
    prepararAbonoExitoso(ventaConCuotas({ 0: '30000000' }));
    await expect(service.crear({ ...DTO_BASE, valor: '20000000' }, USUARIO)).rejects.toThrow();
    expect(auditoriasDe(tx.registroAuditoria.create)).toEqual([]);
  });

  it('no deja pasar un abono mayor al saldo de la venta ni gasta un consecutivo', async () => {
    prisma.venta.findFirst.mockResolvedValue(VENTA_ACTIVA);
    prepararAbonoExitoso(ventaConCuotas({ 0: '30000000' }));

    await expect(service.crear({ ...DTO_BASE, valor: '20000000' }, USUARIO)).rejects.toThrow(/supera el saldo pendiente/);
    expect(tx.abono.create).not.toHaveBeenCalled();
    expect(tx.recibo.create).not.toHaveBeenCalled();
  });

  it('una venta ya pagada por completo no recibe más abonos', async () => {
    prisma.venta.findFirst.mockResolvedValue(VENTA_ACTIVA);
    prepararAbonoExitoso(ventaConCuotas({ 0: '30000000', 1: '5000000', 2: '5000000', 3: '5000000' }));

    await expect(service.crear(DTO_BASE, USUARIO)).rejects.toThrow(/ya está pagada/);
  });

  it('rechaza una referencia que ya se usó en esa cuenta y dice en qué recibo', async () => {
    prisma.venta.findFirst.mockResolvedValue(VENTA_ACTIVA);
    prisma.cuentaBancaria.findUnique.mockResolvedValue({ id: 'cuenta-1', alias: 'Ahorros', activa: true });
    tx.cuentaBancaria.findUnique.mockResolvedValue({ id: 'cuenta-1', banco: 'Banco', alias: 'Ahorros', numero: '123' });
    prepararAbonoExitoso();
    tx.abono.findFirst.mockResolvedValue({ id: 'otro', recibo: { numeroTexto: 'RC-000007' } });

    await expect(
      service.crear({ ...DTO_BASE, medioPago: MedioPago.TRANSFERENCIA, cuentaDestinoId: 'cuenta-1', referencia: ' ABC123 ' }, USUARIO),
    ).rejects.toThrow(/RC-000007/);
    expect(tx.abono.create).not.toHaveBeenCalled();
  });

  it('si la base detecta la referencia repetida (dos pagos simultáneos) responde conflicto, no error 500', async () => {
    prisma.venta.findFirst.mockResolvedValue(VENTA_ACTIVA);
    prepararAbonoExitoso();
    tx.abono.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('Unique', { code: 'P2002', clientVersion: 'test' }));

    await expect(service.crear(DTO_BASE, USUARIO)).rejects.toBeInstanceOf(ConflictException);
  });

  it('emite el recibo de la serie de caja con el prefijo configurado y los datos de la empresa de ese momento', async () => {
    prisma.venta.findFirst.mockResolvedValue(VENTA_ACTIVA);
    prepararAbonoExitoso();
    tx.$queryRaw.mockResolvedValue([{ ultimo: 12 }]);

    const resultado = await service.crear(DTO_BASE, USUARIO);

    expect(resultado.recibo).toEqual({ id: 'recibo-1', numeroTexto: 'RC-000012' });
    const datos = tx.recibo.create.mock.calls[0][0].data;
    expect(datos).toMatchObject({ serie: 'RECIBO_CAJA', numero: 12, esHistorico: false });
    expect(datos.contenido.empresa.nombreComercial).toBe('Empresa de prueba');
    expect(datos.contenido.recibidoPor).toBe('Usuario Prueba');
  });
});

describe('AbonosService.anular', () => {
  it('rechaza anular un abono fuera del alcance del usuario', async () => {
    const { prisma } = crearPrismaFalso();
    prisma.abono.findFirst.mockResolvedValue(null);
    const service = new AbonosService(prisma as unknown as PrismaService, {} as StorageService, {} as ConfiguracionService, notificacionesFalsas);

    await expect(service.anular('abono-x', { motivo: 'Error de digitación' }, USUARIO)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('anula, recalcula las cuotas afectadas y no vuelve a anular un abono ya anulado', async () => {
    const { prisma, tx } = crearPrismaFalso();
    prisma.abono.findFirst.mockResolvedValue({ id: 'abono-1' });
    tx.abono.findUnique.mockResolvedValue({ ventaId: 'venta-1' });
    tx.abono.findUniqueOrThrow.mockResolvedValue({ id: 'abono-1', estado: 'ACTIVO', valor: D('100000'), fecha: new Date(2026, 9, 1), aplicaciones: [{ cuotaId: 'cuota-0' }] });
    tx.abono.update.mockResolvedValue({ id: 'abono-1', estado: 'ANULADO', recibo: { id: 'recibo-1', numeroTexto: 'RC-000001' } });
    tx.cuota.findUniqueOrThrow.mockResolvedValue({ id: 'cuota-0', valor: D('30000000'), estado: 'PARCIAL' });
    const service = new AbonosService(prisma as unknown as PrismaService, {} as StorageService, {} as ConfiguracionService, notificacionesFalsas);

    await service.anular('abono-1', { motivo: '  Consignación devuelta por el banco ' }, USUARIO);

    // Auditoría: la anulación del abono y la del recibo, con el motivo y el estado antes y después.
    expect(auditoriaDe(tx.registroAuditoria.create, 'ABONO_ANULAR')).toMatchObject({
      entidad: 'ABONO',
      entidadId: 'abono-1',
      usuarioId: USUARIO.id,
      antes: { estado: 'ACTIVO' },
      despues: { estado: 'ANULADO', motivoAnulacion: 'Consignación devuelta por el banco' },
    });
    expect(auditoriaDe(tx.registroAuditoria.create, 'RECIBO_ANULAR').resumen).toContain('RC-000001');

    expect(tx.abono.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estado: 'ANULADO', anuladoPorId: USUARIO.id, motivoAnulacion: 'Consignación devuelta por el banco' }),
      }),
    );
    // Sin abonos activos, la cuota vuelve a PENDIENTE.
    expect(tx.cuota.update).toHaveBeenCalledWith({ where: { id: 'cuota-0' }, data: { estado: 'PENDIENTE' } });

    tx.abono.findUniqueOrThrow.mockResolvedValue({ id: 'abono-1', estado: 'ANULADO', aplicaciones: [] });
    await expect(service.anular('abono-1', { motivo: 'Otra vez' }, USUARIO)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('AbonosService.obtenerComprobante', () => {
  it('entrega el soporte con el tipo detectado por su contenido', async () => {
    const { prisma } = crearPrismaFalso();
    prisma.abono.findFirst.mockResolvedValue({ id: 'abono-1', comprobanteUrl: 'a/b/soporte.pdf' });
    const storage = { leer: vi.fn().mockResolvedValue(PDF) };
    const service = new AbonosService(prisma as unknown as PrismaService, storage as unknown as StorageService, {} as ConfiguracionService, notificacionesFalsas);

    const { contentType } = await service.obtenerComprobante('abono-1', USUARIO);
    expect(contentType).toBe('application/pdf');
  });

  it('responde 404 si el abono no tiene soporte', async () => {
    const { prisma } = crearPrismaFalso();
    prisma.abono.findFirst.mockResolvedValue({ id: 'abono-1', comprobanteUrl: null });
    const service = new AbonosService(prisma as unknown as PrismaService, {} as StorageService, {} as ConfiguracionService, notificacionesFalsas);

    await expect(service.obtenerComprobante('abono-1', USUARIO)).rejects.toBeInstanceOf(NotFoundException);
  });
});
