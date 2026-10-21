import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { MedioPago, TipoVendedor } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import type { StorageService } from '../storage/storage.service.js';
import { ConfiguracionService, detectarTipoImagen } from './configuracion.service.js';
import { auditoriaDe, auditoriasDe } from '../test-utils/auditoria.js';

const EMPRESA = {
  id: 1,
  razonSocial: 'Empresa de Prueba SAS',
  nombreComercial: 'Empresa de Prueba',
  nit: '900000001',
  logoRuta: null,
  updatedAt: new Date(2026, 9, 15),
};

const USUARIO = usuarioDePrueba();
const PNG_REAL = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

function crearPrismaFalso() {
  const tablas = {
    configuracionEmpresa: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), create: vi.fn(), update: vi.fn() },
    cuentaBancaria: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    medioPagoConfig: { findMany: vi.fn(), createMany: vi.fn(), update: vi.fn(), count: vi.fn() },
    categoriaGasto: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    categoriaIngreso: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    comisionTipoVendedor: { findMany: vi.fn(), createMany: vi.fn(), update: vi.fn() },
    registroAuditoria: { create: vi.fn() },
  };
  // Los cambios de configuración se guardan en una transacción junto con su registro de auditoría.
  return { ...tablas, $transaction: vi.fn((accion: (tx: typeof tablas) => unknown) => accion(tablas)) };
}

describe('ConfiguracionService', () => {
  let prisma: ReturnType<typeof crearPrismaFalso>;
  let storage: { guardar: ReturnType<typeof vi.fn>; leer: ReturnType<typeof vi.fn> };
  let service: ConfiguracionService;

  beforeEach(() => {
    prisma = crearPrismaFalso();
    storage = { guardar: vi.fn(), leer: vi.fn() };
    service = new ConfiguracionService(prisma as unknown as PrismaService, storage as unknown as StorageService);
  });

  describe('obtenerEmpresa', () => {
    it('devuelve la configuración existente sin crear nada', async () => {
      prisma.configuracionEmpresa.findUnique.mockResolvedValue(EMPRESA);

      expect(await service.obtenerEmpresa()).toBe(EMPRESA);
      expect(prisma.configuracionEmpresa.create).not.toHaveBeenCalled();
    });

    it('si no hay configuración crea una fila neutra: la app nunca debe fallar por no tener datos', async () => {
      prisma.configuracionEmpresa.findUnique.mockResolvedValue(null);
      prisma.configuracionEmpresa.create.mockResolvedValue(EMPRESA);

      await service.obtenerEmpresa();

      expect(prisma.configuracionEmpresa.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ id: 1, nombreComercial: 'Mi empresa' }),
      });
    });

    it('si otra petición la creó al mismo tiempo, la lee en vez de fallar', async () => {
      prisma.configuracionEmpresa.findUnique.mockResolvedValue(null);
      prisma.configuracionEmpresa.create.mockRejectedValue(new Error('Unique constraint'));
      prisma.configuracionEmpresa.findUniqueOrThrow.mockResolvedValue(EMPRESA);

      expect(await service.obtenerEmpresa()).toBe(EMPRESA);
    });
  });

  describe('obtenerPublica', () => {
    it('expone solo marca (nombre, color, si hay logo), nunca NIT, cuentas ni parámetros', async () => {
      prisma.configuracionEmpresa.findUnique.mockResolvedValue({
        ...EMPRESA,
        nombreProducto: 'Plataforma',
        colorPrimario: '#0f766e',
        minutosInactividad: 30,
        logoRuta: 'empresa/logo.png',
      });

      const publica = await service.obtenerPublica();

      expect(publica).toEqual({
        nombreComercial: 'Empresa de Prueba',
        nombreProducto: 'Plataforma',
        colorPrimario: '#0f766e',
        minutosInactividad: 30,
        tieneLogo: true,
        version: EMPRESA.updatedAt.getTime(),
      });
      expect(publica).not.toHaveProperty('nit');
    });
  });

  describe('actualizarParametros', () => {
    it('guarda los porcentajes como Decimal y permite dejar la tasa de mora sin definir (null)', async () => {
      prisma.configuracionEmpresa.findUnique.mockResolvedValue(EMPRESA);

      await service.actualizarParametros({
        porcentajeCuotaInicial: 30,
        plazoMaximoMeses: 12,
        tasaFinanciacionMensual: 0,
        tasaMoraMensual: null,
        diasGraciaMora: 3,
        diasSemaforoAmarillo: 5,
        diasAntesRecordatorio: 3,
        diasEntreAvisosMora: 7,
        enviarReciboPorCorreo: true,
        intentosMaximosLogin: 5,
        minutosBloqueoLogin: 15,
        minutosInactividad: 30,
      }, USUARIO);

      const { data } = prisma.configuracionEmpresa.update.mock.calls[0][0];
      expect(data.porcentajeCuotaInicial).toBeInstanceOf(Prisma.Decimal);
      expect(data.porcentajeCuotaInicial.toString()).toBe('30');
      expect(data.tasaMoraMensual).toBeNull();
      expect(data.diasGraciaMora).toBe(3);
    });

    it('guarda la tasa de mora cuando el gerente la define', async () => {
      prisma.configuracionEmpresa.findUnique.mockResolvedValue(EMPRESA);

      await service.actualizarParametros({
        porcentajeCuotaInicial: 30,
        plazoMaximoMeses: 12,
        tasaFinanciacionMensual: 0,
        tasaMoraMensual: 2.5,
        diasGraciaMora: 0,
        diasSemaforoAmarillo: 5,
        diasAntesRecordatorio: 3,
        diasEntreAvisosMora: 7,
        enviarReciboPorCorreo: true,
        intentosMaximosLogin: 5,
        minutosBloqueoLogin: 15,
        minutosInactividad: 30,
      }, USUARIO);

      const { data } = prisma.configuracionEmpresa.update.mock.calls[0][0];
      expect(data.tasaMoraMensual.toString()).toBe('2.5');
    });
  });

  describe('logo', () => {
    it('detecta el tipo real de una imagen por sus primeros bytes, no por el nombre', () => {
      expect(detectarTipoImagen(PNG_REAL)).toBe('png');
      expect(detectarTipoImagen(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
      expect(detectarTipoImagen(Buffer.from('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ', 'latin1'))).toBe('webp');
      expect(detectarTipoImagen(Buffer.from('<svg onload="alert(1)">'))).toBeNull();
    });

    it('rechaza un archivo que dice ser imagen pero no lo es', async () => {
      const falso = { buffer: Buffer.from('<script>alert(1)</script>'), originalname: 'logo.png' };

      await expect(service.guardarLogo(falso as Express.Multer.File, USUARIO)).rejects.toBeInstanceOf(BadRequestException);
      expect(storage.guardar).not.toHaveBeenCalled();
    });

    it('guarda un PNG real con un nombre que fija el servidor y lo asocia a la empresa', async () => {
      prisma.configuracionEmpresa.findUnique.mockResolvedValue(EMPRESA);
      prisma.configuracionEmpresa.update.mockResolvedValue({ ...EMPRESA, logoRuta: 'empresa/x.png' });
      storage.guardar.mockResolvedValue({ rutaRelativa: 'empresa/x.png' });

      await service.guardarLogo({ buffer: PNG_REAL, originalname: '../../etc/passwd' } as Express.Multer.File, USUARIO);

      expect(storage.guardar).toHaveBeenCalledWith('empresa', 'logo.png', PNG_REAL);
      expect(prisma.configuracionEmpresa.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { logoRuta: 'empresa/x.png' },
      });
    });

    it('leerLogo responde 404 si la empresa no tiene logo', async () => {
      prisma.configuracionEmpresa.findUnique.mockResolvedValue(EMPRESA);

      await expect(service.leerLogo()).rejects.toBeInstanceOf(NotFoundException);
    });

    it('quitar el logo solo lo desasocia: no borra el archivo', async () => {
      prisma.configuracionEmpresa.findUnique.mockResolvedValue({ ...EMPRESA, logoRuta: 'empresa/x.png' });
      prisma.configuracionEmpresa.update.mockResolvedValue(EMPRESA);

      await service.quitarLogo(USUARIO);

      expect(prisma.configuracionEmpresa.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { logoRuta: null } });
    });
  });

  describe('cuentas de recaudo', () => {
    it('rechaza una cuenta repetida del mismo banco y número', async () => {
      prisma.cuentaBancaria.findUnique.mockResolvedValue({ id: 'c1' });

      await expect(
        service.crearCuenta({ banco: 'Bancolombia', tipo: 'AHORROS', numero: '123', alias: 'Principal' }, USUARIO),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.cuentaBancaria.create).not.toHaveBeenCalled();
    });

    it('desactivar una cuenta la conserva (no hay borrado)', async () => {
      prisma.cuentaBancaria.findUnique.mockResolvedValue({ id: 'c1', banco: 'B', numero: '1', alias: 'A', activa: true });
      prisma.cuentaBancaria.update.mockResolvedValue({ id: 'c1', banco: 'B', numero: '1', alias: 'A', activa: false });

      await service.actualizarCuenta('c1', { activa: false }, USUARIO);

      expect(prisma.cuentaBancaria.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { activa: false } });
    });

    it('no permite renombrar una cuenta con los datos de otra', async () => {
      prisma.cuentaBancaria.findUnique
        .mockResolvedValueOnce({ id: 'c1', banco: 'B', numero: '1' })
        .mockResolvedValueOnce({ id: 'c2', banco: 'B', numero: '2' });

      await expect(service.actualizarCuenta('c1', { numero: '2' }, USUARIO)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('medios de pago', () => {
    it('crea las filas que falten con los medios por defecto activos (y cheque/tarjeta inactivos)', async () => {
      prisma.medioPagoConfig.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
        { medio: MedioPago.EFECTIVO, activo: true },
        { medio: MedioPago.CHEQUE, activo: false },
      ]);

      await service.listarMediosPago();

      const { data } = prisma.medioPagoConfig.createMany.mock.calls[0][0];
      expect(data).toHaveLength(Object.values(MedioPago).length);
      expect(data.find((fila: { medio: string }) => fila.medio === 'NEQUI').activo).toBe(true);
      expect(data.find((fila: { medio: string }) => fila.medio === 'CHEQUE').activo).toBe(false);
    });

    it('exigirMedioPagoActivo rechaza un medio deshabilitado y acepta uno habilitado', async () => {
      prisma.medioPagoConfig.findMany.mockResolvedValue(
        Object.values(MedioPago).map((medio) => ({ medio, activo: medio !== MedioPago.CHEQUE })),
      );

      await expect(service.exigirMedioPagoActivo(MedioPago.CHEQUE)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.exigirMedioPagoActivo(MedioPago.NEQUI)).resolves.toBeUndefined();
    });

    it('no deja desactivar el último medio de pago activo', async () => {
      prisma.medioPagoConfig.findMany.mockResolvedValue(
        Object.values(MedioPago).map((medio) => ({ medio, activo: true })),
      );
      prisma.medioPagoConfig.count.mockResolvedValue(0);

      await expect(service.actualizarMedioPago(MedioPago.EFECTIVO, false, USUARIO)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.medioPagoConfig.update).not.toHaveBeenCalled();
    });
  });

  describe('categorías de gasto', () => {
    it('rechaza una categoría repetida sin distinguir mayúsculas', async () => {
      prisma.categoriaGasto.findFirst.mockResolvedValue({ id: 'k1', nombre: 'Materiales' });

      await expect(service.crearCategoriaGasto({ nombre: 'materiales' }, USUARIO)).rejects.toBeInstanceOf(ConflictException);
    });

    it('una categoría del sistema (Nómina, Comisiones) no se puede desactivar ni renombrar', async () => {
      prisma.categoriaGasto.findUnique.mockResolvedValue({ id: 'k1', nombre: 'Nómina', esSistema: true });

      await expect(service.actualizarCategoriaGasto('k1', { activa: false }, USUARIO)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.actualizarCategoriaGasto('k1', { nombre: 'Sueldos' }, USUARIO)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.categoriaGasto.update).not.toHaveBeenCalled();
    });

    it('una categoría normal sí se puede desactivar', async () => {
      prisma.categoriaGasto.findUnique.mockResolvedValue({ id: 'k2', nombre: 'Materiales', esSistema: false, activa: true });
      prisma.categoriaGasto.update.mockResolvedValue({ id: 'k2', nombre: 'Materiales', esSistema: false, activa: false });

      await service.actualizarCategoriaGasto('k2', { activa: false }, USUARIO);

      expect(prisma.categoriaGasto.update).toHaveBeenCalledWith({
        where: { id: 'k2' },
        data: { nombre: undefined, activa: false },
      });
    });
  });

  describe('categorías de ingreso (RF-CFG-11)', () => {
    it('se crean con nombre único, sin distinguir mayúsculas, y no se mezclan con las de gasto', async () => {
      prisma.categoriaIngreso.findFirst.mockResolvedValue({ id: 'i1', nombre: 'Otros servicios' });
      await expect(service.crearCategoriaIngreso({ nombre: 'otros SERVICIOS' }, USUARIO)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.categoriaGasto.findFirst).not.toHaveBeenCalled();

      prisma.categoriaIngreso.findFirst.mockResolvedValue(null);
      prisma.categoriaIngreso.create.mockResolvedValue({ id: 'i2' });
      await service.crearCategoriaIngreso({ nombre: '  Anticipo de remodelación ' }, USUARIO);
      expect(prisma.categoriaIngreso.create).toHaveBeenCalledWith({ data: { nombre: 'Anticipo de remodelación' } });
      expect(prisma.categoriaGasto.create).not.toHaveBeenCalled();
    });

    it('se pueden desactivar en vez de borrarse, y una del sistema no', async () => {
      prisma.categoriaIngreso.findUnique.mockResolvedValue({ id: 'i2', nombre: 'Otros', esSistema: false, activa: true });
      prisma.categoriaIngreso.update.mockResolvedValue({ id: 'i2', nombre: 'Otros', esSistema: false, activa: false });
      await service.actualizarCategoriaIngreso('i2', { activa: false }, USUARIO);
      expect(prisma.categoriaIngreso.update).toHaveBeenCalledWith({ where: { id: 'i2' }, data: { nombre: undefined, activa: false } });

      prisma.categoriaIngreso.findUnique.mockResolvedValue({ id: 'i3', nombre: 'Del sistema', esSistema: true });
      await expect(service.actualizarCategoriaIngreso('i3', { activa: false }, USUARIO)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('una categoría que no existe responde 404', async () => {
      prisma.categoriaIngreso.findUnique.mockResolvedValue(null);
      await expect(service.actualizarCategoriaIngreso('x', { activa: false }, USUARIO)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('comisiones', () => {
    it('crea en cero las comisiones que no existan todavía', async () => {
      prisma.comisionTipoVendedor.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await service.listarComisiones();

      const { data } = prisma.comisionTipoVendedor.createMany.mock.calls[0][0];
      expect(data).toHaveLength(Object.values(TipoVendedor).length);
      expect(data[0].valor.toString()).toBe('0');
    });

    it('guarda el valor como Decimal exacto', async () => {
      prisma.comisionTipoVendedor.findMany.mockResolvedValue(
        Object.values(TipoVendedor).map((tipo) => ({ tipo, valor: new Prisma.Decimal(0) })),
      );

      prisma.comisionTipoVendedor.update.mockResolvedValue({ tipo: TipoVendedor.ASESOR_INMOBILIARIO, valor: new Prisma.Decimal('1000000.5') });

      await service.actualizarComision(TipoVendedor.ASESOR_INMOBILIARIO, '1000000.50', USUARIO);

      const { data } = prisma.comisionTipoVendedor.update.mock.calls[0][0];
      expect(data.valor.toString()).toBe('1000000.5');
    });
  });
});

describe('ConfiguracionService: auditoría (RF-AUD-01)', () => {
  let prisma: ReturnType<typeof crearPrismaFalso>;
  let service: ConfiguracionService;
  const EMPRESA_COMPLETA = {
    ...EMPRESA,
    direccion: null,
    telefonos: null,
    correo: null,
    colorPrimario: '#2563eb',
    textoLegalRecibo: null,
    prefijoRecibo: 'RC-',
    porcentajeCuotaInicial: new Prisma.Decimal('30'),
    plazoMaximoMeses: 12,
    tasaFinanciacionMensual: new Prisma.Decimal('0'),
    tasaMoraMensual: null,
    diasGraciaMora: 0,
    diasSemaforoAmarillo: 5,
    diasAntesRecordatorio: 3,
        diasEntreAvisosMora: 7,
        enviarReciboPorCorreo: true,
    intentosMaximosLogin: 5,
    minutosBloqueoLogin: 15,
    minutosInactividad: 30,
  };

  beforeEach(() => {
    prisma = crearPrismaFalso();
    service = new ConfiguracionService(prisma as unknown as PrismaService, { guardar: vi.fn().mockResolvedValue({ rutaRelativa: 'empresa/logo.png' }), leer: vi.fn() } as unknown as StorageService);
    prisma.configuracionEmpresa.findUnique.mockResolvedValue(EMPRESA_COMPLETA);
  });

  it('cambiar los datos de la empresa deja el antes y el después, sin el logo ni campos internos', async () => {
    prisma.configuracionEmpresa.update.mockResolvedValue({ ...EMPRESA_COMPLETA, nombreComercial: 'Nombre Nuevo', colorPrimario: '#ff0000' });

    await service.actualizarEmpresa(
      { razonSocial: EMPRESA.razonSocial, nombreComercial: 'Nombre Nuevo', nit: EMPRESA.nit, colorPrimario: '#FF0000' },
      USUARIO,
    );

    const registro = auditoriaDe(prisma.registroAuditoria.create, 'CONFIGURACION_EMPRESA');
    expect(registro).toMatchObject({ entidad: 'CONFIGURACION', usuarioId: USUARIO.id });
    expect(registro.antes).toMatchObject({ nombreComercial: 'Empresa de Prueba', colorPrimario: '#2563eb' });
    expect(registro.despues).toMatchObject({ nombreComercial: 'Nombre Nuevo', colorPrimario: '#ff0000' });
    expect(registro.antes).not.toHaveProperty('logoRuta');
  });

  it('cambiar los parámetros del negocio deja la tasa de mora anterior y la nueva', async () => {
    prisma.configuracionEmpresa.update.mockResolvedValue({ ...EMPRESA_COMPLETA, tasaMoraMensual: new Prisma.Decimal('2.5') });

    await service.actualizarParametros(
      {
        porcentajeCuotaInicial: 30,
        plazoMaximoMeses: 12,
        tasaFinanciacionMensual: 0,
        tasaMoraMensual: 2.5,
        diasGraciaMora: 0,
        diasSemaforoAmarillo: 5,
        diasAntesRecordatorio: 3,
        diasEntreAvisosMora: 7,
        enviarReciboPorCorreo: true,
        intentosMaximosLogin: 5,
        minutosBloqueoLogin: 15,
        minutosInactividad: 30,
      },
      USUARIO,
    );

    const registro = auditoriaDe(prisma.registroAuditoria.create, 'CONFIGURACION_PARAMETROS');
    expect(registro.antes).toMatchObject({ tasaMoraMensual: null });
    expect(registro.despues).toMatchObject({ tasaMoraMensual: '2.5' });
  });

  it('cambiar y quitar el logo quedan registrados con la ruta anterior y la nueva', async () => {
    await service.guardarLogo({ buffer: PNG_REAL, originalname: 'logo.png' } as Express.Multer.File, USUARIO);
    expect(auditoriaDe(prisma.registroAuditoria.create, 'CONFIGURACION_LOGO').despues).toEqual({ logoRuta: 'empresa/logo.png' });

    prisma.registroAuditoria.create.mockClear();
    await service.quitarLogo(USUARIO);
    expect(auditoriaDe(prisma.registroAuditoria.create, 'CONFIGURACION_LOGO')).toMatchObject({ despues: { logoRuta: null } });
  });

  it('crear y desactivar una cuenta de recaudo quedan registrados', async () => {
    prisma.cuentaBancaria.findUnique.mockResolvedValue(null);
    prisma.cuentaBancaria.create.mockResolvedValue({ id: 'c9', banco: 'Banco', tipo: 'AHORROS', numero: '123', alias: 'Principal', activa: true });
    await service.crearCuenta({ banco: 'Banco', tipo: 'AHORROS', numero: '123', alias: 'Principal' }, USUARIO);
    expect(auditoriaDe(prisma.registroAuditoria.create, 'CONFIGURACION_CUENTA')).toMatchObject({ entidadId: 'c9', despues: { alias: 'Principal', activa: true } });

    prisma.registroAuditoria.create.mockClear();
    prisma.cuentaBancaria.findUnique.mockResolvedValue({ id: 'c9', banco: 'Banco', tipo: 'AHORROS', numero: '123', alias: 'Principal', activa: true });
    prisma.cuentaBancaria.update.mockResolvedValue({ id: 'c9', banco: 'Banco', tipo: 'AHORROS', numero: '123', alias: 'Principal', activa: false });
    await service.actualizarCuenta('c9', { activa: false }, USUARIO);
    const registro = auditoriaDe(prisma.registroAuditoria.create, 'CONFIGURACION_CUENTA');
    expect(registro.antes).toMatchObject({ activa: true });
    expect(registro.despues).toMatchObject({ activa: false });
    expect(registro.resumen).toContain('desactivó');
  });

  it('habilitar o deshabilitar un medio de pago deja el estado anterior y el nuevo', async () => {
    prisma.medioPagoConfig.findMany.mockResolvedValue(Object.values(MedioPago).map((medio) => ({ medio, activo: true })));
    prisma.medioPagoConfig.count.mockResolvedValue(3);

    await service.actualizarMedioPago(MedioPago.NEQUI, false, USUARIO);

    expect(auditoriaDe(prisma.registroAuditoria.create, 'CONFIGURACION_MEDIO_PAGO')).toMatchObject({
      entidadId: 'NEQUI',
      antes: { medio: 'NEQUI', activo: true },
      despues: { medio: 'NEQUI', activo: false },
    });
  });

  it('crear una categoría de gasto o de ingreso queda registrado', async () => {
    prisma.categoriaGasto.findFirst.mockResolvedValue(null);
    prisma.categoriaGasto.create.mockResolvedValue({ id: 'k9', nombre: 'Combustible', activa: true, esSistema: false });
    await service.crearCategoriaGasto({ nombre: 'Combustible' }, USUARIO);
    expect(auditoriaDe(prisma.registroAuditoria.create, 'CONFIGURACION_CATEGORIA')).toMatchObject({ entidadId: 'k9', despues: { tipo: 'gasto', nombre: 'Combustible' } });
  });

  it('cambiar una comisión deja el valor anterior y el nuevo', async () => {
    prisma.comisionTipoVendedor.findMany.mockResolvedValue(Object.values(TipoVendedor).map((tipo) => ({ tipo, valor: new Prisma.Decimal('1000000') })));
    prisma.comisionTipoVendedor.update.mockResolvedValue({ tipo: TipoVendedor.REFERIDO, valor: new Prisma.Decimal('600000') });

    await service.actualizarComision(TipoVendedor.REFERIDO, '600000', USUARIO);

    expect(auditoriaDe(prisma.registroAuditoria.create, 'CONFIGURACION_COMISION')).toMatchObject({
      antes: { tipo: 'REFERIDO', valor: '1000000' },
      despues: { tipo: 'REFERIDO', valor: '600000' },
    });
  });

  it('un cambio rechazado no deja nada en la auditoría', async () => {
    prisma.medioPagoConfig.findMany.mockResolvedValue(Object.values(MedioPago).map((medio) => ({ medio, activo: medio === MedioPago.EFECTIVO })));
    prisma.medioPagoConfig.count.mockResolvedValue(0);
    await expect(service.actualizarMedioPago(MedioPago.EFECTIVO, false, USUARIO)).rejects.toBeInstanceOf(BadRequestException);

    prisma.cuentaBancaria.findUnique.mockResolvedValue({ id: 'x' });
    await expect(service.crearCuenta({ banco: 'B', tipo: 'AHORROS', numero: '1', alias: 'A' }, USUARIO)).rejects.toBeInstanceOf(ConflictException);

    expect(auditoriasDe(prisma.registroAuditoria.create)).toEqual([]);
  });
});
