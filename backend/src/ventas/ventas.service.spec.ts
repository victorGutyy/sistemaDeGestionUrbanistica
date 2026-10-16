import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoLote, EstadoVenta, FormaPago, MedioPago, TipoVendedor } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import type { CrearVentaDto } from './dto/crear-venta.dto.js';

// Forma plana del DTO, para poder copiarla con ... en las pruebas.
type DatosVenta = { [Clave in keyof CrearVentaDto]: CrearVentaDto[Clave] };
import { VentasService } from './ventas.service.js';

// Solo se simulan las llamadas a Prisma que usa VentasService: las reglas de negocio (qué se
// busca, cuándo se rechaza, qué se guarda) se prueban sin base de datos real.
function crearPrismaFalso() {
  const tx = {
    lote: { findUnique: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    loteHistorial: { create: vi.fn() },
    cliente: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    vendedor: { findUnique: vi.fn(), create: vi.fn() },
    venta: {
      create: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    cuota: { create: vi.fn(), createMany: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
    abono: { create: vi.fn(), findMany: vi.fn() },
    separacion: { updateMany: vi.fn() },
    desistimiento: { create: vi.fn() },
    documentoVenta: { create: vi.fn(), findFirst: vi.fn() },
  };

  type Tx = typeof tx;
  const prisma = { ...tx, $transaction: vi.fn((callback: (txArg: Tx) => unknown) => callback(tx)) };
  return { prisma, tx };
}

const D = (valor: string) => new Prisma.Decimal(valor);
const STORAGE_FALSO = () => ({ guardar: vi.fn(), leer: vi.fn() }) as unknown as StorageService;
const LOTE = { id: 'lote-1', proyectoId: 'p-1', numero: 'L-1', estado: EstadoLote.DISPONIBLE };
const USUARIO = usuarioDePrueba();
const GERENTE = { ...usuarioDePrueba(), id: 'gerente-1', permisos: ['ventas.autorizar'] };

const CONFIG = { porcentajeCuotaInicial: D('30'), plazoMaximoMeses: 12, tasaFinanciacionMensual: D('0') };

const BASE_FINANCIADA: DatosVenta = {
  loteId: 'lote-1',
  clienteId: 'cliente-1',
  formaPago: FormaPago.FINANCIADO,
  valorTotal: '100000000',
  cuotaInicial: '30000000',
  numeroCuotas: 12,
};
const BASE_CONTADO: DatosVenta = { loteId: 'lote-1', clienteId: 'cliente-1', formaPago: FormaPago.CONTADO, valorTotal: '80000000' };

describe('VentasService.crear', () => {
  let prisma: ReturnType<typeof crearPrismaFalso>['prisma'];
  let tx: ReturnType<typeof crearPrismaFalso>['tx'];
  let configuracion: { obtenerEmpresa: ReturnType<typeof vi.fn>; exigirMedioPagoActivo: ReturnType<typeof vi.fn> };
  let service: VentasService;

  beforeEach(() => {
    ({ prisma, tx } = crearPrismaFalso());
    configuracion = {
      obtenerEmpresa: vi.fn().mockResolvedValue(CONFIG),
      exigirMedioPagoActivo: vi.fn().mockResolvedValue(undefined),
    };
    service = new VentasService(prisma as unknown as PrismaService, configuracion as unknown as ConfiguracionService, STORAGE_FALSO());

    tx.lote.findUnique.mockResolvedValue(LOTE);
    tx.cliente.findFirst.mockResolvedValue({ id: 'cliente-1' });
    tx.venta.create.mockImplementation(({ data }: { data: object }) => Promise.resolve({ id: 'venta-1', ...data }));
    tx.venta.findUniqueOrThrow.mockResolvedValue({ id: 'venta-1' });
    tx.cuota.create.mockResolvedValue({ id: 'cuota-0' });
    tx.cuota.findUniqueOrThrow.mockResolvedValue({ id: 'cuota-0', valor: D('80000000'), estado: 'PENDIENTE' });
    tx.abono.findMany.mockResolvedValue([{ valor: D('80000000') }]);
  });

  describe('validaciones', () => {
    it('rechaza si no se envía ni clienteId ni clienteNuevo', async () => {
      await expect(service.crear({ ...BASE_CONTADO, clienteId: undefined }, USUARIO)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza si se envían clienteId y clienteNuevo a la vez', async () => {
      await expect(
        service.crear({ ...BASE_CONTADO, clienteNuevo: { nombre: 'Ana', documento: '123' } }, USUARIO),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza si se envían vendedorId y vendedorNuevo a la vez', async () => {
      await expect(
        service.crear(
          { ...BASE_CONTADO, vendedorId: 'v-1', vendedorNuevo: { tipo: TipoVendedor.REFERIDO, nombre: 'Luis', documento: '555' } },
          USUARIO,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza un valor total en cero', async () => {
      await expect(service.crear({ ...BASE_CONTADO, valorTotal: '0' }, USUARIO)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza una venta financiada sin numeroCuotas', async () => {
      await expect(service.crear({ ...BASE_FINANCIADA, numeroCuotas: undefined }, USUARIO)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza una cuota inicial mayor al valor total', async () => {
      await expect(service.crear({ ...BASE_FINANCIADA, cuotaInicial: '200000000' }, USUARIO)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza una venta financiada cuya cuota inicial cubre todo (debe ser de contado)', async () => {
      await expect(service.crear({ ...BASE_FINANCIADA, cuotaInicial: '100000000' }, USUARIO)).rejects.toThrow(/de contado/);
    });

    it('rechaza dar la cuota inicial en valor y en porcentaje a la vez', async () => {
      await expect(service.crear({ ...BASE_FINANCIADA, cuotaInicialPorcentaje: '30' }, USUARIO)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza registrar el pago de la cuota inicial sin medio de pago, o con un medio deshabilitado', async () => {
      await expect(service.crear({ ...BASE_CONTADO, cuotaInicialRecibida: true }, USUARIO)).rejects.toBeInstanceOf(BadRequestException);

      configuracion.exigirMedioPagoActivo.mockRejectedValue(new BadRequestException('Medio no habilitado'));
      await expect(
        service.crear({ ...BASE_CONTADO, cuotaInicialRecibida: true, medioPago: MedioPago.CHEQUE }, USUARIO),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.venta.create).not.toHaveBeenCalled();
    });
  });

  describe('lote', () => {
    it('rechaza si el lote no existe', async () => {
      tx.lote.findUnique.mockResolvedValue(null);
      await expect(service.crear(BASE_CONTADO, USUARIO)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('no se puede vender un lote de otro proyecto (alcance)', async () => {
      await expect(service.crear(BASE_CONTADO, usuarioDePrueba(['p-otro']))).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.venta.create).not.toHaveBeenCalled();
    });

    it.each([EstadoLote.VENDIDO, EstadoLote.ESCRITURADO, EstadoLote.DESISTIDO])('rechaza un lote %s', async (estado) => {
      tx.lote.findUnique.mockResolvedValue({ ...LOTE, estado });
      await expect(service.crear(BASE_CONTADO, USUARIO)).rejects.toBeInstanceOf(ConflictException);
      expect(tx.venta.create).not.toHaveBeenCalled();
    });

    it('rechaza un lote que ya tiene una venta en curso', async () => {
      tx.venta.findFirst.mockResolvedValue({ id: 'otra-venta' });
      await expect(service.crear(BASE_CONTADO, USUARIO)).rejects.toThrow(/venta en curso/);
    });

    it('también se puede vender un lote SEPARADO', async () => {
      tx.lote.findUnique.mockResolvedValue({ ...LOTE, estado: EstadoLote.SEPARADO });
      await service.crear(BASE_CONTADO, USUARIO);
      expect(tx.lote.updateMany).toHaveBeenCalledWith({
        where: { id: 'lote-1', estado: EstadoLote.SEPARADO },
        data: { estado: EstadoLote.VENDIDO },
      });
    });

    it('al vender un lote separado, su separación activa pasa a CONVERTIDA en esa venta', async () => {
      tx.lote.findUnique.mockResolvedValue({ ...LOTE, estado: EstadoLote.SEPARADO });
      await service.crear(BASE_CONTADO, USUARIO);
      expect(tx.separacion.updateMany).toHaveBeenCalledWith({
        where: { loteId: 'lote-1', estado: 'ACTIVA' },
        data: { estado: 'CONVERTIDA', ventaId: 'venta-1' },
      });
    });

    it('si otra persona vendió el lote en el mismo instante, la segunda venta falla con conflicto', async () => {
      tx.lote.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.crear(BASE_CONTADO, USUARIO)).rejects.toBeInstanceOf(ConflictException);
      expect(tx.loteHistorial.create).not.toHaveBeenCalled();
    });
  });

  describe('venta de contado', () => {
    it('crea la venta ACTIVA con una cuota 0 por el valor total, sin plan de cuotas, y marca el lote VENDIDO', async () => {
      await service.crear(BASE_CONTADO, USUARIO);

      const { data } = tx.venta.create.mock.calls[0][0];
      expect(data).toMatchObject({ estado: EstadoVenta.ACTIVA, esExcepcion: false, registradaPorId: USUARIO.id, numeroCuotas: null, tasaInteres: null });
      expect(data.cuotaInicial.toString()).toBe('80000000');
      expect(tx.cuota.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ ventaId: 'venta-1', numero: 0, valor: expect.anything() }),
      });
      expect(tx.cuota.createMany).not.toHaveBeenCalled();
      expect(tx.lote.updateMany).toHaveBeenCalledWith({
        where: { id: 'lote-1', estado: EstadoLote.DISPONIBLE },
        data: { estado: EstadoLote.VENDIDO },
      });
      expect(tx.loteHistorial.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ ventaId: 'venta-1', estadoNuevo: EstadoLote.VENDIDO, usuarioId: USUARIO.id }),
      });
    });

    it('si la cuota inicial se recibió, registra su abono en la misma transacción y deja la cuota 0 pagada', async () => {
      await service.crear({ ...BASE_CONTADO, cuotaInicialRecibida: true, medioPago: MedioPago.TRANSFERENCIA }, USUARIO);

      expect(configuracion.exigirMedioPagoActivo).toHaveBeenCalledWith(MedioPago.TRANSFERENCIA);
      expect(tx.abono.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ ventaId: 'venta-1', cuotaId: 'cuota-0', medioPago: MedioPago.TRANSFERENCIA }),
      });
      expect(tx.cuota.update).toHaveBeenCalledWith({ where: { id: 'cuota-0' }, data: { estado: 'PAGADA' } });
    });

    it('sin marcar la cuota inicial como recibida no se crea ningún abono: queda pendiente', async () => {
      await service.crear(BASE_CONTADO, USUARIO);
      expect(tx.abono.create).not.toHaveBeenCalled();
    });
  });

  describe('venta financiada', () => {
    it('crea la cuota 0 y exactamente numeroCuotas cuotas, todas en pesos enteros y sin interés por defecto', async () => {
      await service.crear(BASE_FINANCIADA, USUARIO);

      const { data } = tx.venta.create.mock.calls[0][0];
      expect(data).toMatchObject({ estado: EstadoVenta.ACTIVA, esExcepcion: false, tasaInteres: null, numeroCuotas: 12 });
      expect(data.cuotaInicial.toString()).toBe('30000000');

      const { data: cuotas } = tx.cuota.createMany.mock.calls[0][0];
      expect(cuotas).toHaveLength(12);
      expect(cuotas.every((c: { valor: Prisma.Decimal }) => c.valor.decimalPlaces() === 0)).toBe(true);
      const suma = cuotas.reduce((total: Prisma.Decimal, c: { valor: Prisma.Decimal }) => total.plus(c.valor), D('0'));
      expect(suma.toString()).toBe('70000000');
    });

    it('sin indicar la cuota inicial usa el porcentaje configurado (30 %)', async () => {
      await service.crear({ ...BASE_FINANCIADA, cuotaInicial: undefined }, USUARIO);
      expect(tx.venta.create.mock.calls[0][0].data.cuotaInicial.toString()).toBe('30000000');
    });

    it('acepta la cuota inicial como porcentaje', async () => {
      await service.crear({ ...BASE_FINANCIADA, cuotaInicial: undefined, cuotaInicialPorcentaje: '40' }, USUARIO);
      expect(tx.venta.create.mock.calls[0][0].data.cuotaInicial.toString()).toBe('40000000');
    });

    it('si el gerente configuró una tasa de financiación, la venta la usa', async () => {
      configuracion.obtenerEmpresa.mockResolvedValue({ ...CONFIG, tasaFinanciacionMensual: D('1.5') });
      await service.crear(BASE_FINANCIADA, USUARIO);
      expect(tx.venta.create.mock.calls[0][0].data.tasaInteres.toString()).toBe('1.5');
    });

    it('la cuota 0 vence el día pactado para la cuota inicial', async () => {
      await service.crear({ ...BASE_FINANCIADA, fechaVenta: '2026-10-01', fechaLimiteCuotaInicial: '2026-10-15' }, USUARIO);
      const { data } = tx.cuota.create.mock.calls[0][0];
      expect(data.fechaVencimiento.getDate()).toBe(15);
    });
  });

  describe('excepciones (RF-VEN-05)', () => {
    const CUOTA_BAJA = { ...BASE_FINANCIADA, cuotaInicial: '10000000' };

    it('una cuota inicial baja sin motivo se rechaza, avisando la razón y el código', async () => {
      const error = await service.crear(CUOTA_BAJA, GERENTE).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({ codigo: 'EXCEPCION_REQUIERE_MOTIVO' });
      expect(tx.venta.create).not.toHaveBeenCalled();
    });

    it('un plazo mayor al máximo también exige motivo', async () => {
      await expect(service.crear({ ...BASE_FINANCIADA, numeroCuotas: 24 }, GERENTE)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('quien no puede autorizar deja la venta PENDIENTE_APROBACION: sin plan de cuotas, y el lote queda SEPARADO', async () => {
      await service.crear({ ...CUOTA_BAJA, motivoExcepcion: 'Cliente de confianza' }, USUARIO);

      const { data } = tx.venta.create.mock.calls[0][0];
      expect(data).toMatchObject({ estado: EstadoVenta.PENDIENTE_APROBACION, esExcepcion: true, motivoExcepcion: 'Cliente de confianza', resueltaPorId: null });
      expect(tx.cuota.create).not.toHaveBeenCalled();
      expect(tx.cuota.createMany).not.toHaveBeenCalled();
      expect(tx.lote.updateMany).toHaveBeenCalledWith({
        where: { id: 'lote-1', estado: EstadoLote.DISPONIBLE },
        data: { estado: EstadoLote.SEPARADO },
      });
      // Se anota que esta venta fue la que separó el lote, para liberarlo si se rechaza.
      expect(tx.venta.update).toHaveBeenCalledWith({ where: { id: 'venta-1' }, data: { separoElLote: true } });
    });

    it('una venta pendiente sobre un lote que ya estaba SEPARADO no lo vuelve a separar', async () => {
      tx.lote.findUnique.mockResolvedValue({ ...LOTE, estado: EstadoLote.SEPARADO });
      await service.crear({ ...CUOTA_BAJA, motivoExcepcion: 'Motivo válido' }, USUARIO);
      expect(tx.lote.updateMany).not.toHaveBeenCalled();
      expect(tx.venta.update).not.toHaveBeenCalled();
    });

    it('una venta pendiente no puede registrar el pago de la cuota inicial todavía', async () => {
      await expect(
        service.crear({ ...CUOTA_BAJA, motivoExcepcion: 'Motivo válido', cuotaInicialRecibida: true, medioPago: MedioPago.EFECTIVO }, USUARIO),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('quien puede autorizar (gerente) la deja ACTIVA, autorizada por él mismo y con el motivo registrado', async () => {
      await service.crear({ ...CUOTA_BAJA, motivoExcepcion: 'Cliente de confianza' }, GERENTE);

      const { data } = tx.venta.create.mock.calls[0][0];
      expect(data).toMatchObject({ estado: EstadoVenta.ACTIVA, esExcepcion: true, motivoExcepcion: 'Cliente de confianza', resueltaPorId: GERENTE.id });
      expect(data.resueltaEn).toBeInstanceOf(Date);
      expect(tx.cuota.createMany).toHaveBeenCalled();
      expect(tx.lote.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { estado: EstadoLote.VENDIDO } }));
    });

    it('una venta sin excepción no guarda motivo aunque se envíe uno', async () => {
      await service.crear({ ...BASE_FINANCIADA, motivoExcepcion: 'no hace falta' }, USUARIO);
      expect(tx.venta.create.mock.calls[0][0].data).toMatchObject({ esExcepcion: false, motivoExcepcion: null });
    });
  });

  describe('cliente y vendedor', () => {
    it('crea el cliente nuevo dentro de la misma transacción cuando no existe', async () => {
      tx.cliente.findUnique.mockResolvedValue(null);
      tx.cliente.create.mockResolvedValue({ id: 'cliente-nuevo' });

      await service.crear({ ...BASE_CONTADO, clienteId: undefined, clienteNuevo: { nombre: 'Ana Pérez', documento: '123456789' } }, USUARIO);

      expect(tx.cliente.create).toHaveBeenCalledWith({ data: { nombre: 'Ana Pérez', documento: '123456789' } });
      expect(tx.venta.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ clienteId: 'cliente-nuevo' }) }));
    });

    it('rechaza un cliente nuevo con un documento que ya existe', async () => {
      tx.cliente.findUnique.mockResolvedValue({ id: 'otro' });
      await expect(
        service.crear({ ...BASE_CONTADO, clienteId: undefined, clienteNuevo: { nombre: 'Ana', documento: '123' } }, USUARIO),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rechaza un cliente que no existe o está fuera del alcance', async () => {
      tx.cliente.findFirst.mockResolvedValue(null);
      await expect(service.crear(BASE_CONTADO, USUARIO)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('crea el vendedor nuevo y lo asocia a la venta', async () => {
      tx.vendedor.findUnique.mockResolvedValue(null);
      tx.vendedor.create.mockResolvedValue({ id: 'vend-1' });

      await service.crear({ ...BASE_CONTADO, vendedorNuevo: { tipo: TipoVendedor.ASESOR_INMOBILIARIO, nombre: 'Luis Gómez', documento: '555' } }, USUARIO);

      expect(tx.venta.create.mock.calls[0][0].data.vendedorId).toBe('vend-1');
    });

    it('si el documento del vendedor ya existe, lo reutiliza en vez de duplicarlo', async () => {
      tx.vendedor.findUnique.mockResolvedValue({ id: 'vend-existente' });

      await service.crear({ ...BASE_CONTADO, vendedorNuevo: { tipo: TipoVendedor.REFERIDO, nombre: 'Luis', documento: '555' } }, USUARIO);

      expect(tx.vendedor.create).not.toHaveBeenCalled();
      expect(tx.venta.create.mock.calls[0][0].data.vendedorId).toBe('vend-existente');
    });

    it('rechaza un vendedorId que no existe', async () => {
      tx.vendedor.findUnique.mockResolvedValue(null);
      await expect(service.crear({ ...BASE_CONTADO, vendedorId: 'v-x' }, USUARIO)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('la venta sin vendedor es válida', async () => {
      await service.crear(BASE_CONTADO, USUARIO);
      expect(tx.venta.create.mock.calls[0][0].data.vendedorId).toBeNull();
    });
  });
});

describe('VentasService: aprobar y rechazar excepciones', () => {
  let prisma: ReturnType<typeof crearPrismaFalso>['prisma'];
  let tx: ReturnType<typeof crearPrismaFalso>['tx'];
  let service: VentasService;

  const PENDIENTE = {
    id: 'venta-1',
    estado: EstadoVenta.PENDIENTE_APROBACION,
    valorTotal: D('100000000'),
    cuotaInicial: D('10000000'),
    numeroCuotas: 12,
    tasaInteres: null,
    formaPago: FormaPago.FINANCIADO,
    fechaVenta: new Date(2026, 9, 1),
    fechaCuotaInicial: new Date(2026, 9, 1),
    separoElLote: true,
    lote: { id: 'lote-1', numero: 'L-1', estado: EstadoLote.SEPARADO },
  };

  beforeEach(() => {
    ({ prisma, tx } = crearPrismaFalso());
    service = new VentasService(prisma as unknown as PrismaService, {} as ConfiguracionService, STORAGE_FALSO());
    tx.venta.findFirst.mockResolvedValue(PENDIENTE);
    tx.cuota.create.mockResolvedValue({ id: 'cuota-0' });
    tx.venta.findUniqueOrThrow.mockResolvedValue({ id: 'venta-1' });
  });

  it('aprobar activa la venta, genera la cuota 0 y el plan, y vende el lote dejando quién autorizó', async () => {
    await service.aprobar('venta-1', GERENTE);

    expect(tx.venta.updateMany).toHaveBeenCalledWith({
      where: { id: 'venta-1', estado: EstadoVenta.PENDIENTE_APROBACION },
      data: expect.objectContaining({ estado: EstadoVenta.ACTIVA, resueltaPorId: GERENTE.id }),
    });
    expect(tx.cuota.create).toHaveBeenCalledWith({ data: expect.objectContaining({ numero: 0 }) });
    expect(tx.cuota.createMany.mock.calls[0][0].data).toHaveLength(12);
    expect(tx.lote.updateMany).toHaveBeenCalledWith({
      where: { id: 'lote-1', estado: EstadoLote.SEPARADO },
      data: { estado: EstadoLote.VENDIDO },
    });
  });

  it('solo se aprueba una venta pendiente', async () => {
    tx.venta.findFirst.mockResolvedValue({ ...PENDIENTE, estado: EstadoVenta.ACTIVA });
    await expect(service.aprobar('venta-1', GERENTE)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.cuota.create).not.toHaveBeenCalled();
  });

  it('si otra persona ya resolvió la venta en el mismo instante, responde conflicto sin duplicar el plan', async () => {
    tx.venta.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.aprobar('venta-1', GERENTE)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.cuota.create).not.toHaveBeenCalled();
  });

  it('una venta que no existe (o es de otro proyecto) responde 404', async () => {
    tx.venta.findFirst.mockResolvedValue(null);
    await expect(service.aprobar('x', GERENTE)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.rechazar('x', 'motivo', GERENTE)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rechazar deja la venta RECHAZADA con el motivo, sin borrarla, y libera el lote que ella había separado', async () => {
    await service.rechazar('venta-1', '  No cumple las condiciones  ', GERENTE);

    expect(tx.venta.updateMany).toHaveBeenCalledWith({
      where: { id: 'venta-1', estado: EstadoVenta.PENDIENTE_APROBACION },
      data: expect.objectContaining({ estado: EstadoVenta.RECHAZADA, resueltaPorId: GERENTE.id, motivoRechazo: 'No cumple las condiciones' }),
    });
    expect(tx.lote.updateMany).toHaveBeenCalledWith({
      where: { id: 'lote-1', estado: EstadoLote.SEPARADO },
      data: { estado: EstadoLote.DISPONIBLE },
    });
    expect(tx.cuota.create).not.toHaveBeenCalled();
  });

  it('rechazar no libera un lote que ya estaba separado antes de esta venta', async () => {
    tx.venta.findFirst.mockResolvedValue({ ...PENDIENTE, separoElLote: false });
    await service.rechazar('venta-1', 'Motivo válido', GERENTE);
    expect(tx.lote.updateMany).not.toHaveBeenCalled();
  });
});

describe('VentasService.parametros', () => {
  it('entrega los valores por defecto del negocio y si quien consulta puede autorizar excepciones', async () => {
    const { prisma } = crearPrismaFalso();
    const configuracion = { obtenerEmpresa: vi.fn().mockResolvedValue({ ...CONFIG, tasaFinanciacionMensual: D('0') }) };
    const service = new VentasService(prisma as unknown as PrismaService, configuracion as unknown as ConfiguracionService, STORAGE_FALSO());

    expect(await service.parametros(USUARIO)).toEqual({
      porcentajeCuotaInicial: '30',
      plazoMaximoMeses: 12,
      tasaFinanciacionMensual: '0',
      puedeAutorizar: false,
    });
    expect((await service.parametros(GERENTE)).puedeAutorizar).toBe(true);
  });
});

describe('VentasService.desistir (RF-VEN-08)', () => {
  let prisma: ReturnType<typeof crearPrismaFalso>['prisma'];
  let tx: ReturnType<typeof crearPrismaFalso>['tx'];
  let service: VentasService;

  const VENTA = {
    id: 'venta-1',
    estado: EstadoVenta.ACTIVA,
    lote: { id: 'lote-1', numero: 'L-1', estado: EstadoLote.VENDIDO },
    abonos: [{ valor: D('30000000') }, { valor: D('5000000') }],
  };
  const DTO = { fecha: '2026-10-16', motivo: 'El cliente no pudo continuar con los pagos' };

  beforeEach(() => {
    ({ prisma, tx } = crearPrismaFalso());
    service = new VentasService(prisma as unknown as PrismaService, {} as ConfiguracionService, STORAGE_FALSO());
    tx.venta.findFirst.mockResolvedValue(VENTA);
    tx.venta.findUniqueOrThrow.mockResolvedValue({ id: 'venta-1' });
  });

  it('deja la venta DESISTIDA, el lote DESISTIDO y registra el desistimiento sin tocar los abonos', async () => {
    await service.desistir('venta-1', { ...DTO, valorDevolver: '20000000', valorRetener: '15000000' }, GERENTE);

    expect(tx.venta.updateMany).toHaveBeenCalledWith({
      where: { id: 'venta-1', estado: EstadoVenta.ACTIVA },
      data: { estado: EstadoVenta.DESISTIDA },
    });
    expect(tx.lote.updateMany).toHaveBeenCalledWith({
      where: { id: 'lote-1', estado: EstadoLote.VENDIDO },
      data: { estado: EstadoLote.DESISTIDO },
    });
    expect(tx.loteHistorial.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ estadoNuevo: EstadoLote.DESISTIDO, ventaId: 'venta-1', usuarioId: GERENTE.id }),
    });
    const { data } = tx.desistimiento.create.mock.calls[0][0];
    expect(data).toMatchObject({ ventaId: 'venta-1', motivo: DTO.motivo, registradoPorId: GERENTE.id });
    expect(data.valorDevolver.toString()).toBe('20000000');
    expect(data.valorRetener.toString()).toBe('15000000');
    // No existe ninguna operación que borre o modifique abonos.
    expect(tx.abono.create).not.toHaveBeenCalled();
  });

  it('los valores a devolver y retener son opcionales', async () => {
    await service.desistir('venta-1', DTO, GERENTE);
    expect(tx.desistimiento.create.mock.calls[0][0].data).toMatchObject({ valorDevolver: null, valorRetener: null });
  });

  it('no se puede devolver o retener más de lo que el cliente pagó', async () => {
    await expect(service.desistir('venta-1', { ...DTO, valorDevolver: '36000000' }, GERENTE)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.desistir('venta-1', { ...DTO, valorRetener: '36000000' }, GERENTE)).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.desistir('venta-1', { ...DTO, valorDevolver: '20000000', valorRetener: '20000000' }, GERENTE),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.desistimiento.create).not.toHaveBeenCalled();
  });

  it('un cliente que no pagó nada puede desistir sin valores', async () => {
    tx.venta.findFirst.mockResolvedValue({ ...VENTA, abonos: [] });
    await expect(service.desistir('venta-1', DTO, GERENTE)).resolves.toBeDefined();
    await expect(service.desistir('venta-1', { ...DTO, valorRetener: '1' }, GERENTE)).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([EstadoVenta.PENDIENTE_APROBACION, EstadoVenta.RECHAZADA, EstadoVenta.DESISTIDA])('solo se desiste una venta activa, no una %s', async (estado) => {
    tx.venta.findFirst.mockResolvedValue({ ...VENTA, estado });
    await expect(service.desistir('venta-1', DTO, GERENTE)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.desistimiento.create).not.toHaveBeenCalled();
  });

  it('un lote ya escriturado no admite desistimiento', async () => {
    tx.venta.findFirst.mockResolvedValue({ ...VENTA, lote: { ...VENTA.lote, estado: EstadoLote.ESCRITURADO } });
    await expect(service.desistir('venta-1', DTO, GERENTE)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.desistimiento.create).not.toHaveBeenCalled();
  });

  it('si otra persona cambió el estado de la venta al mismo tiempo, responde conflicto', async () => {
    tx.venta.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.desistir('venta-1', DTO, GERENTE)).rejects.toBeInstanceOf(ConflictException);
  });

  it('una venta que no existe o es de otro proyecto responde 404', async () => {
    tx.venta.findFirst.mockResolvedValue(null);
    await expect(service.desistir('x', DTO, GERENTE)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('VentasService: documentos firmados (RF-VEN-06)', () => {
  let prisma: ReturnType<typeof crearPrismaFalso>['prisma'];
  let tx: ReturnType<typeof crearPrismaFalso>['tx'];
  let storage: { guardar: ReturnType<typeof vi.fn>; leer: ReturnType<typeof vi.fn> };
  let service: VentasService;

  const PDF = Buffer.from('%PDF-1.7 contenido de prueba');
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const archivo = (buffer: Buffer, originalname: string) => ({ buffer, originalname }) as Express.Multer.File;

  beforeEach(() => {
    ({ prisma, tx } = crearPrismaFalso());
    storage = { guardar: vi.fn().mockResolvedValue({ rutaRelativa: 'ventas/venta-1/abc.pdf' }), leer: vi.fn() };
    service = new VentasService(prisma as unknown as PrismaService, {} as ConfiguracionService, storage as unknown as StorageService);
    tx.venta.findFirst.mockResolvedValue({ id: 'venta-1' });
    tx.documentoVenta.create.mockImplementation(({ data }: { data: object }) => Promise.resolve({ id: 'doc-1', ...data }));
  });

  it('guarda varios documentos con nombre de disco decidido por el servidor y el tipo real por sus bytes', async () => {
    const resultado = await service.subirDocumentos('venta-1', [archivo(PDF, '../../contrato firmado.pdf'), archivo(PNG, 'promesa.JPG')], 'Contrato', USUARIO);

    expect(resultado).toHaveLength(2);
    // El nombre en disco es "documento.<tipo real>": un .JPG que en realidad es PNG se guarda como png.
    expect(storage.guardar).toHaveBeenNthCalledWith(1, 'ventas/venta-1', 'documento.pdf', PDF);
    expect(storage.guardar).toHaveBeenNthCalledWith(2, 'ventas/venta-1', 'documento.png', PNG);
    const primero = tx.documentoVenta.create.mock.calls[0][0].data;
    expect(primero).toMatchObject({ nombreOriginal: 'contrato firmado.pdf', tipoMime: 'application/pdf', descripcion: 'Contrato', subidoPorId: USUARIO.id });
    expect(tx.documentoVenta.create.mock.calls[1][0].data.tipoMime).toBe('image/png');
  });

  it('rechaza un archivo que dice ser PDF pero no lo es, sin guardar ninguno (la carga no queda a medias)', async () => {
    await expect(
      service.subirDocumentos('venta-1', [archivo(PDF, 'bueno.pdf'), archivo(Buffer.from('<script>alert(1)</script>'), 'malo.pdf')], undefined, USUARIO),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.guardar).not.toHaveBeenCalled();
    expect(tx.documentoVenta.create).not.toHaveBeenCalled();
  });

  it('exige al menos un archivo', async () => {
    await expect(service.subirDocumentos('venta-1', [], undefined, USUARIO)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.subirDocumentos('venta-1', undefined, undefined, USUARIO)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('una venta de otro proyecto (fuera del alcance) responde 404 sin guardar nada', async () => {
    tx.venta.findFirst.mockResolvedValue(null);
    await expect(service.subirDocumentos('venta-x', [archivo(PDF, 'a.pdf')], undefined, USUARIO)).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.guardar).not.toHaveBeenCalled();
  });

  it('descargar un documento exige que la venta esté dentro del alcance del usuario', async () => {
    tx.documentoVenta.findFirst.mockResolvedValue(null);
    await expect(service.leerDocumento('venta-1', 'doc-x', usuarioDePrueba(['p-otro']))).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.documentoVenta.findFirst).toHaveBeenCalledWith({
      where: { id: 'doc-x', ventaId: 'venta-1', venta: { lote: { proyectoId: { in: ['p-otro'] } } } },
    });
    expect(storage.leer).not.toHaveBeenCalled();
  });

  it('entrega el archivo con el tipo que se guardó (el detectado), no el que diga el cliente', async () => {
    tx.documentoVenta.findFirst.mockResolvedValue({ ruta: 'ventas/venta-1/abc.pdf', tipoMime: 'application/pdf', nombreOriginal: 'contrato.pdf' });
    storage.leer.mockResolvedValue(PDF);

    expect(await service.leerDocumento('venta-1', 'doc-1', USUARIO)).toEqual({ buffer: PDF, contentType: 'application/pdf', nombre: 'contrato.pdf' });
  });
});
