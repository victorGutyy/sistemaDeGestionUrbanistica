import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { auditoriaDe, auditoriasDe } from '../test-utils/auditoria.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import type { CrearParametroLegalDto } from './dto/seguridad-social.dto.js';
import { SeguridadSocialService } from './seguridad-social.service.js';

const D = (valor: string | number) => new Prisma.Decimal(valor);

// Valores inventados para las pruebas.
const NUEVO = {
  anio: 2030,
  smmlv: '2000000',
  auxilioTransporte: '300000',
  porcentajeIncapacidadTramo1: 66.67,
  porcentajeIncapacidadTramo2: 50,
  porcentajeIncapacidadLaboral: 100,
  diasEmpleador: 2,
  diasTramo1Hasta: 90,
  diasTramo2Hasta: 180,
} satisfies CrearParametroLegalDto;

const PARAMETRO = {
  id: 'p-1',
  anio: 2030,
  smmlv: D('2000000'),
  auxilioTransporte: D('300000'),
  topeAuxilioSmmlv: D('2'),
  porcentajeIncapacidadTramo1: D('66.67'),
  porcentajeIncapacidadTramo2: D('50'),
  porcentajeIncapacidadLaboral: D('100'),
  diasEmpleador: 2,
  diasTramo1Hasta: 90,
  diasTramo2Hasta: 180,
  diasBaseMes: 30,
  notas: null,
  validadoEn: null,
  validadoPorId: null,
};

function montar() {
  const tablas = {
    parametroLegal: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    entidadSS: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    claseRiesgoArl: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    registroAuditoria: { create: vi.fn() },
  };
  const prisma = { ...tablas, $transaction: vi.fn((accion: (tx: typeof tablas) => unknown) => accion(tablas)) };
  return { tablas, servicio: new SeguridadSocialService(prisma as unknown as PrismaService) };
}

describe('SeguridadSocialService: parámetros legales por año (RF-CFG-13)', () => {
  let m: ReturnType<typeof montar>;
  beforeEach(() => {
    m = montar();
  });

  it('crea el parámetro de un año con el tope en 2 y la base del mes en 30 si no se indican, sin validar, y lo audita', async () => {
    m.tablas.parametroLegal.findUnique.mockResolvedValue(null);
    m.tablas.parametroLegal.create.mockImplementation(({ data }: { data: object }) => Promise.resolve({ id: 'p-1', ...data }));

    await m.servicio.crearParametro(NUEVO, usuarioDePrueba());

    const datos = m.tablas.parametroLegal.create.mock.calls[0][0].data;
    expect(datos.topeAuxilioSmmlv.toString()).toBe('2');
    expect(datos.diasBaseMes).toBe(30);
    expect(datos.validadoEn).toBeUndefined();
    expect(auditoriaDe(m.tablas.registroAuditoria.create, 'PARAMETRO_LEGAL_CREAR')).toMatchObject({
      entidad: 'PARAMETRO_LEGAL',
      entidadId: 'p-1',
      despues: { anio: 2030, smmlv: '2000000' },
    });
  });

  it('no crea dos veces el mismo año', async () => {
    m.tablas.parametroLegal.findUnique.mockResolvedValue(PARAMETRO);
    await expect(m.servicio.crearParametro(NUEVO, usuarioDePrueba())).rejects.toBeInstanceOf(ConflictException);
    expect(m.tablas.parametroLegal.create).not.toHaveBeenCalled();
  });

  it('rechaza tramos de días desordenados', async () => {
    m.tablas.parametroLegal.findUnique.mockResolvedValue(null);
    await expect(m.servicio.crearParametro({ ...NUEVO, diasTramo1Hasta: 200 }, usuarioDePrueba())).rejects.toBeInstanceOf(BadRequestException);
    expect(m.tablas.parametroLegal.create).not.toHaveBeenCalled();
  });

  it('rechaza un salario mínimo en cero', async () => {
    m.tablas.parametroLegal.findUnique.mockResolvedValue(null);
    await expect(m.servicio.crearParametro({ ...NUEVO, smmlv: '0' }, usuarioDePrueba())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cambiar un valor legal de un parámetro validado le quita la validación y lo deja en la auditoría', async () => {
    const validado = { ...PARAMETRO, validadoEn: new Date(2030, 0, 5), validadoPorId: 'u-1' };
    m.tablas.parametroLegal.findUnique.mockResolvedValue(validado);
    m.tablas.parametroLegal.update.mockImplementation(({ data }: { data: object }) => Promise.resolve({ ...validado, ...data }));

    await m.servicio.actualizarParametro('p-1', { smmlv: '2100000' }, usuarioDePrueba());

    const datos = m.tablas.parametroLegal.update.mock.calls[0][0].data;
    expect(datos.smmlv.toString()).toBe('2100000');
    expect(datos.validadoEn).toBeNull();
    expect(datos.validadoPorId).toBeNull();
    const registro = auditoriaDe(m.tablas.registroAuditoria.create, 'PARAMETRO_LEGAL_EDITAR');
    expect(registro.resumen).toMatch(/perdieron la validación/);
    expect(registro.antes).toMatchObject({ smmlv: '2000000' });
    expect(registro.despues).toMatchObject({ smmlv: '2100000' });
  });

  it('cambiar solo las notas no quita la validación', async () => {
    const validado = { ...PARAMETRO, validadoEn: new Date(2030, 0, 5), validadoPorId: 'u-1' };
    m.tablas.parametroLegal.findUnique.mockResolvedValue(validado);
    m.tablas.parametroLegal.update.mockImplementation(({ data }: { data: object }) => Promise.resolve({ ...validado, ...data }));

    await m.servicio.actualizarParametro('p-1', { notas: '  Revisado con el asesor  ' }, usuarioDePrueba());

    const datos = m.tablas.parametroLegal.update.mock.calls[0][0].data;
    expect(datos.notas).toBe('Revisado con el asesor');
    expect('validadoEn' in datos).toBe(false);
  });

  it('enviar el mismo valor que ya tiene no cuenta como cambio legal', async () => {
    const validado = { ...PARAMETRO, validadoEn: new Date(2030, 0, 5), validadoPorId: 'u-1' };
    m.tablas.parametroLegal.findUnique.mockResolvedValue(validado);
    m.tablas.parametroLegal.update.mockImplementation(({ data }: { data: object }) => Promise.resolve({ ...validado, ...data }));

    await m.servicio.actualizarParametro('p-1', { smmlv: '2000000.00', diasEmpleador: 2 }, usuarioDePrueba());

    expect('validadoEn' in m.tablas.parametroLegal.update.mock.calls[0][0].data).toBe(false);
  });

  it('al editar valida los tramos junto con lo que ya estaba guardado', async () => {
    m.tablas.parametroLegal.findUnique.mockResolvedValue(PARAMETRO);
    // El segundo tramo (180) quedaría por debajo del nuevo primer tramo (200).
    await expect(m.servicio.actualizarParametro('p-1', { diasTramo1Hasta: 200 }, usuarioDePrueba())).rejects.toBeInstanceOf(BadRequestException);
    expect(m.tablas.parametroLegal.update).not.toHaveBeenCalled();
  });

  it('editar un parámetro que no existe da 404', async () => {
    m.tablas.parametroLegal.findUnique.mockResolvedValue(null);
    await expect(m.servicio.actualizarParametro('x', { smmlv: '1' }, usuarioDePrueba())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('validar deja quién y cuándo, y lo audita', async () => {
    m.tablas.parametroLegal.findUnique.mockResolvedValue(PARAMETRO);
    m.tablas.parametroLegal.update.mockImplementation(({ data }: { data: object }) => Promise.resolve({ ...PARAMETRO, ...data }));

    await m.servicio.validarParametro('p-1', usuarioDePrueba());

    const datos = m.tablas.parametroLegal.update.mock.calls[0][0].data;
    expect(datos.validadoPorId).toBe('usuario-prueba');
    expect(datos.validadoEn).toBeInstanceOf(Date);
    expect(auditoriaDe(m.tablas.registroAuditoria.create, 'PARAMETRO_LEGAL_VALIDAR')).toMatchObject({ entidadId: 'p-1', usuarioId: 'usuario-prueba' });
  });

  it('no valida dos veces', async () => {
    m.tablas.parametroLegal.findUnique.mockResolvedValue({ ...PARAMETRO, validadoEn: new Date(), validadoPorId: 'u-1' });
    await expect(m.servicio.validarParametro('p-1', usuarioDePrueba())).rejects.toBeInstanceOf(ConflictException);
    expect(auditoriasDe(m.tablas.registroAuditoria.create)).toHaveLength(0);
  });

  it('el parámetro de un año que no existe no se reemplaza por el de otro año', async () => {
    m.tablas.parametroLegal.findUnique.mockResolvedValue(null);
    await expect(m.servicio.parametroDelAnio(2031)).rejects.toThrow(/2031/);
  });
});

describe('SeguridadSocialService: entidades (RF-CFG-14)', () => {
  let m: ReturnType<typeof montar>;
  beforeEach(() => {
    m = montar();
  });

  it('crea una entidad con el nombre sin espacios sobrantes y lo audita', async () => {
    m.tablas.entidadSS.findFirst.mockResolvedValue(null);
    m.tablas.entidadSS.create.mockImplementation(({ data }: { data: object }) => Promise.resolve({ id: 'e-1', activa: true, ...data }));

    await m.servicio.crearEntidad({ tipo: 'EPS', nombre: '  Salud Inventada  ' }, usuarioDePrueba());

    expect(m.tablas.entidadSS.create).toHaveBeenCalledWith({ data: { tipo: 'EPS', nombre: 'Salud Inventada' } });
    expect(auditoriaDe(m.tablas.registroAuditoria.create, 'ENTIDAD_SS_CREAR')).toMatchObject({ entidad: 'ENTIDAD_SS', entidadId: 'e-1' });
  });

  it('no repite un nombre dentro del mismo tipo, sin importar mayúsculas', async () => {
    m.tablas.entidadSS.findFirst.mockResolvedValue({ id: 'e-0', tipo: 'EPS', nombre: 'Salud Inventada' });
    await expect(m.servicio.crearEntidad({ tipo: 'EPS', nombre: 'SALUD INVENTADA' }, usuarioDePrueba())).rejects.toBeInstanceOf(ConflictException);
    expect(m.tablas.entidadSS.findFirst.mock.calls[0][0].where).toMatchObject({ tipo: 'EPS', nombre: { mode: 'insensitive' } });
  });

  it('desactivar una entidad queda en la auditoría con el valor anterior', async () => {
    const entidad = { id: 'e-1', tipo: 'ARL', nombre: 'Riesgos Inventados', activa: true };
    m.tablas.entidadSS.findUnique.mockResolvedValue(entidad);
    m.tablas.entidadSS.update.mockResolvedValue({ ...entidad, activa: false });

    await m.servicio.actualizarEntidad('e-1', { activa: false }, usuarioDePrueba());

    const registro = auditoriaDe(m.tablas.registroAuditoria.create, 'ENTIDAD_SS_EDITAR');
    expect(registro.resumen).toMatch(/desactivó/);
    expect(registro.antes).toMatchObject({ activa: true });
    expect(registro.despues).toMatchObject({ activa: false });
  });

  it('renombrar a un nombre que ya usa otra entidad del tipo da conflicto', async () => {
    m.tablas.entidadSS.findUnique.mockResolvedValue({ id: 'e-1', tipo: 'AFP', nombre: 'Fondo A', activa: true });
    m.tablas.entidadSS.findFirst.mockResolvedValue({ id: 'e-2', tipo: 'AFP', nombre: 'Fondo B' });
    await expect(m.servicio.actualizarEntidad('e-1', { nombre: 'Fondo B' }, usuarioDePrueba())).rejects.toBeInstanceOf(ConflictException);
  });

  it('editar una entidad que no existe da 404', async () => {
    m.tablas.entidadSS.findUnique.mockResolvedValue(null);
    await expect(m.servicio.actualizarEntidad('x', { activa: false }, usuarioDePrueba())).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('SeguridadSocialService: clases de riesgo de la ARL', () => {
  let m: ReturnType<typeof montar>;
  beforeEach(() => {
    m = montar();
  });

  it('cambiar la tasa deja el valor anterior y el nuevo en la auditoría', async () => {
    const clase = { id: 'c-3', clase: 3, tasa: D('2.436'), activa: true };
    m.tablas.claseRiesgoArl.findUnique.mockResolvedValue(clase);
    m.tablas.claseRiesgoArl.update.mockResolvedValue({ ...clase, tasa: D('2.5') });

    await m.servicio.actualizarClaseRiesgo('c-3', { tasa: 2.5 }, usuarioDePrueba());

    const registro = auditoriaDe(m.tablas.registroAuditoria.create, 'CLASE_RIESGO_ARL_EDITAR');
    expect(registro.antes).toMatchObject({ clase: 3, tasa: '2.436' });
    expect(registro.despues).toMatchObject({ clase: 3, tasa: '2.5' });
  });

  it('pide indicar qué cambiar', async () => {
    await expect(m.servicio.actualizarClaseRiesgo('c-3', {}, usuarioDePrueba())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('una clase que no existe da 404', async () => {
    m.tablas.claseRiesgoArl.findUnique.mockResolvedValue(null);
    await expect(m.servicio.actualizarClaseRiesgo('x', { activa: false }, usuarioDePrueba())).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('SeguridadSocialService: catálogos', () => {
  it('entrega parámetros (el año más reciente primero), entidades y clases', async () => {
    const m = montar();
    m.tablas.parametroLegal.findMany.mockResolvedValue([]);
    m.tablas.entidadSS.findMany.mockResolvedValue([]);
    m.tablas.claseRiesgoArl.findMany.mockResolvedValue([]);

    const catalogos = await m.servicio.listarCatalogos();

    expect(Object.keys(catalogos).sort()).toEqual(['clasesRiesgo', 'entidades', 'parametrosLegales']);
    expect(m.tablas.parametroLegal.findMany.mock.calls[0][0].orderBy).toEqual({ anio: 'desc' });
  });
});
