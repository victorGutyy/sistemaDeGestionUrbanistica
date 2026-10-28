import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfiguracionService } from '../configuracion/configuracion.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { auditoriaDe, auditoriasDe } from '../test-utils/auditoria.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import { EppService } from './epp.service.js';

const HOY = new Date(2026, 5, 10, 14, 30);
const dia = (mes: number, diaDelMes: number) => new Date(2026, mes - 1, diaDelMes);

const TRABAJADOR = { id: 't-1', nombre: 'Persona Inventada', documento: '000111', estado: 'ACTIVO', fechaIngreso: dia(1, 1) };
const ELEMENTO = { id: 'e-1', nombre: 'Casco de prueba', vidaUtilDias: 30, activo: true };

function montar() {
  const tablas = {
    trabajador: { findUnique: vi.fn().mockResolvedValue(TRABAJADOR) },
    elementoEpp: { findUnique: vi.fn().mockResolvedValue(ELEMENTO), findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    entregaEpp: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn() },
    registroAuditoria: { create: vi.fn() },
  };
  tablas.entregaEpp.create.mockImplementation(({ data }: { data: object }) => Promise.resolve({ id: 'en-1', ...data, trabajador: TRABAJADOR, elemento: ELEMENTO }));
  tablas.entregaEpp.update.mockImplementation(({ data }: { data: object }) => Promise.resolve({ id: 'en-1', cantidad: 2, ...data, trabajador: TRABAJADOR, elemento: ELEMENTO }));
  tablas.elementoEpp.create.mockImplementation(({ data }: { data: object }) => Promise.resolve({ id: 'e-9', activo: true, ...data }));
  tablas.elementoEpp.update.mockImplementation(({ data }: { data: object }) => Promise.resolve({ ...ELEMENTO, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) }));
  const prisma = { ...tablas, $transaction: vi.fn((accion: (tx: typeof tablas) => unknown) => accion(tablas)) };
  const configuracion = { obtenerEmpresa: vi.fn().mockResolvedValue({ diasAlertaSst: 15 }) };
  return { tablas, configuracion, servicio: new EppService(prisma as unknown as PrismaService, configuracion as unknown as ConfiguracionService) };
}

const ENTREGA_BASE = { trabajadorId: 't-1', elementoId: 'e-1', fecha: '2026-06-01', cantidad: 2, motivo: 'DOTACION_INICIAL' as const };

describe('EppService: catálogo (RF-SST-12)', () => {
  let m: ReturnType<typeof montar>;
  beforeEach(() => {
    m = montar();
  });

  it('crea un elemento con el nombre sin espacios sobrantes y lo audita', async () => {
    await m.servicio.crearElemento({ nombre: '  Guantes de prueba ', vidaUtilDias: 45 }, usuarioDePrueba());
    expect(m.tablas.elementoEpp.create).toHaveBeenCalledWith({ data: { nombre: 'Guantes de prueba', vidaUtilDias: 45 } });
    expect(auditoriaDe(m.tablas.registroAuditoria.create, 'ELEMENTO_EPP_CREAR')).toMatchObject({ entidad: 'ELEMENTO_EPP', entidadId: 'e-9' });
  });

  it('no repite un nombre, sin importar mayúsculas', async () => {
    m.tablas.elementoEpp.findFirst.mockResolvedValue({ id: 'e-0', nombre: 'Casco de prueba' });
    await expect(m.servicio.crearElemento({ nombre: 'CASCO DE PRUEBA', vidaUtilDias: 30 }, usuarioDePrueba())).rejects.toBeInstanceOf(ConflictException);
    expect(m.tablas.elementoEpp.findFirst.mock.calls[0][0].where.nombre).toMatchObject({ mode: 'insensitive' });
  });

  it('cambiar la vida útil queda en la auditoría con el valor anterior y el nuevo', async () => {
    m.tablas.elementoEpp.findUnique.mockResolvedValue(ELEMENTO);
    await m.servicio.actualizarElemento('e-1', { vidaUtilDias: 60 }, usuarioDePrueba());
    const registro = auditoriaDe(m.tablas.registroAuditoria.create, 'ELEMENTO_EPP_EDITAR');
    expect(registro.resumen).toMatch(/vida útil de 30 a 60 días/);
    expect(registro.antes).toMatchObject({ vidaUtilDias: 30 });
    expect(registro.despues).toMatchObject({ vidaUtilDias: 60 });
  });

  it('desactivar un elemento lo dice en el resumen', async () => {
    await m.servicio.actualizarElemento('e-1', { activo: false }, usuarioDePrueba());
    expect(auditoriaDe(m.tablas.registroAuditoria.create, 'ELEMENTO_EPP_EDITAR').resumen).toMatch(/lo desactivó/);
  });

  it('editar un elemento que no existe da 404, y renombrar a un nombre en uso da conflicto', async () => {
    m.tablas.elementoEpp.findUnique.mockResolvedValue(null);
    await expect(m.servicio.actualizarElemento('x', { activo: false }, usuarioDePrueba())).rejects.toBeInstanceOf(NotFoundException);
    m.tablas.elementoEpp.findUnique.mockResolvedValue(ELEMENTO);
    m.tablas.elementoEpp.findFirst.mockResolvedValue({ id: 'e-2', nombre: 'Otro elemento' });
    await expect(m.servicio.actualizarElemento('e-1', { nombre: 'Otro elemento' }, usuarioDePrueba())).rejects.toBeInstanceOf(ConflictException);
  });

  it('por defecto lista solo los activos; con incluirInactivos, todos', async () => {
    await m.servicio.listarElementos();
    expect(m.tablas.elementoEpp.findMany.mock.calls[0][0].where).toEqual({ activo: true });
    await m.servicio.listarElementos(true);
    expect(m.tablas.elementoEpp.findMany.mock.calls[1][0].where).toEqual({});
  });
});

describe('EppService: entregas (RF-SST-13)', () => {
  let m: ReturnType<typeof montar>;
  beforeEach(() => {
    m = montar();
  });

  it('registra la entrega con la vida útil y la reposición calculadas el día de la entrega', async () => {
    await m.servicio.registrarEntrega({ ...ENTREGA_BASE, tallaReferencia: ' 42 ' }, usuarioDePrueba(), HOY);

    const datos = m.tablas.entregaEpp.create.mock.calls[0][0].data;
    expect(datos).toMatchObject({ trabajadorId: 't-1', elementoId: 'e-1', cantidad: 2, tallaReferencia: '42', motivo: 'DOTACION_INICIAL', vidaUtilDias: 30, registradaPorId: 'usuario-prueba', firmoRecibido: false });
    expect(datos.fecha).toEqual(dia(6, 1));
    expect(datos.proximaReposicion).toEqual(dia(7, 1));
    expect(auditoriaDe(m.tablas.registroAuditoria.create, 'ENTREGA_EPP_REGISTRAR')).toMatchObject({
      entidad: 'ENTREGA_EPP',
      entidadId: 'en-1',
      despues: { elemento: 'Casco de prueba', cantidad: 2, vidaUtilDias: 30 },
    });
  });

  it('quien entrega es quien registra si no se indica otra persona', async () => {
    await m.servicio.registrarEntrega(ENTREGA_BASE, usuarioDePrueba(), HOY);
    expect(m.tablas.entregaEpp.create.mock.calls[0][0].data.entregadoPor).toBe('Usuario de prueba');
    await m.servicio.registrarEntrega({ ...ENTREGA_BASE, entregadoPor: ' Almacenista Inventado ', firmoRecibido: true }, usuarioDePrueba(), HOY);
    expect(m.tablas.entregaEpp.create.mock.calls[1][0].data).toMatchObject({ entregadoPor: 'Almacenista Inventado', firmoRecibido: true });
  });

  it('una entrega de hoy es válida; una de mañana no', async () => {
    await m.servicio.registrarEntrega({ ...ENTREGA_BASE, fecha: '2026-06-10' }, usuarioDePrueba(), HOY);
    await expect(m.servicio.registrarEntrega({ ...ENTREGA_BASE, fecha: '2026-06-11' }, usuarioDePrueba(), HOY)).rejects.toThrow(/futura/);
  });

  it('no registra entregas anteriores al ingreso del trabajador ni con una fecha inválida', async () => {
    await expect(m.servicio.registrarEntrega({ ...ENTREGA_BASE, fecha: '2025-12-31' }, usuarioDePrueba(), HOY)).rejects.toThrow(/ingreso/);
    await expect(m.servicio.registrarEntrega({ ...ENTREGA_BASE, fecha: 'no-es-fecha' }, usuarioDePrueba(), HOY)).rejects.toBeInstanceOf(BadRequestException);
    expect(m.tablas.entregaEpp.create).not.toHaveBeenCalled();
  });

  it('no entrega a un trabajador retirado, ni a uno que no existe', async () => {
    m.tablas.trabajador.findUnique.mockResolvedValue({ ...TRABAJADOR, estado: 'INACTIVO' });
    await expect(m.servicio.registrarEntrega(ENTREGA_BASE, usuarioDePrueba(), HOY)).rejects.toThrow(/retirado/);
    m.tablas.trabajador.findUnique.mockResolvedValue(null);
    await expect(m.servicio.registrarEntrega(ENTREGA_BASE, usuarioDePrueba(), HOY)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('no entrega un elemento desactivado ni uno que no existe', async () => {
    m.tablas.elementoEpp.findUnique.mockResolvedValue({ ...ELEMENTO, activo: false });
    await expect(m.servicio.registrarEntrega(ENTREGA_BASE, usuarioDePrueba(), HOY)).rejects.toThrow(/desactivado/);
    m.tablas.elementoEpp.findUnique.mockResolvedValue(null);
    await expect(m.servicio.registrarEntrega(ENTREGA_BASE, usuarioDePrueba(), HOY)).rejects.toBeInstanceOf(NotFoundException);
    expect(auditoriasDe(m.tablas.registroAuditoria.create)).toHaveLength(0);
  });

  it('anular deja quién, cuándo y por qué, y lo audita', async () => {
    m.tablas.entregaEpp.findUnique.mockResolvedValue({ id: 'en-1', anulada: false, cantidad: 2 });
    await m.servicio.anularEntrega('en-1', { motivo: '  Se registró por error ' }, usuarioDePrueba());

    const datos = m.tablas.entregaEpp.update.mock.calls[0][0].data;
    expect(datos).toMatchObject({ anulada: true, anuladaPorId: 'usuario-prueba', motivoAnulacion: 'Se registró por error' });
    expect(datos.anuladaEn).toBeInstanceOf(Date);
    const registro = auditoriaDe(m.tablas.registroAuditoria.create, 'ENTREGA_EPP_ANULAR');
    expect(registro.resumen).toMatch(/Se registró por error/);
    expect(registro.antes).toEqual({ anulada: false });
  });

  it('no anula dos veces ni una entrega que no existe', async () => {
    m.tablas.entregaEpp.findUnique.mockResolvedValue({ id: 'en-1', anulada: true });
    await expect(m.servicio.anularEntrega('en-1', { motivo: 'Otro motivo' }, usuarioDePrueba())).rejects.toBeInstanceOf(ConflictException);
    m.tablas.entregaEpp.findUnique.mockResolvedValue(null);
    await expect(m.servicio.anularEntrega('x', { motivo: 'Otro motivo' }, usuarioDePrueba())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('marcar la firma pasa de "no firmó" a "firmó" y se audita; repetirla no hace nada; una anulada no se firma', async () => {
    m.tablas.entregaEpp.findUnique.mockResolvedValue({ id: 'en-1', anulada: false, firmoRecibido: false });
    await m.servicio.marcarFirma('en-1', usuarioDePrueba());
    expect(m.tablas.entregaEpp.update.mock.calls[0][0].data).toEqual({ firmoRecibido: true });
    expect(auditoriaDe(m.tablas.registroAuditoria.create, 'ENTREGA_EPP_FIRMA').despues).toEqual({ firmoRecibido: true });

    m.tablas.entregaEpp.update.mockClear();
    m.tablas.entregaEpp.findUnique.mockResolvedValue({ id: 'en-1', anulada: false, firmoRecibido: true });
    await m.servicio.marcarFirma('en-1', usuarioDePrueba());
    expect(m.tablas.entregaEpp.update).not.toHaveBeenCalled();

    m.tablas.entregaEpp.findUnique.mockResolvedValue({ id: 'en-1', anulada: true, firmoRecibido: false });
    await expect(m.servicio.marcarFirma('en-1', usuarioDePrueba())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('la lista oculta las anuladas salvo que se pidan, y filtra por trabajador, elemento y fechas', async () => {
    await m.servicio.listarEntregas({});
    expect(m.tablas.entregaEpp.findMany.mock.calls[0][0].where).toEqual({ trabajadorId: undefined, elementoId: undefined, anulada: false });

    await m.servicio.listarEntregas({ trabajadorId: 't-1', elementoId: 'e-1', desde: '2026-01-01', hasta: '2026-03-31', incluirAnuladas: 'true' });
    const donde = m.tablas.entregaEpp.findMany.mock.calls[1][0].where;
    expect(donde).toMatchObject({ trabajadorId: 't-1', elementoId: 'e-1', fecha: { gte: dia(1, 1), lte: dia(3, 31) } });
    expect('anulada' in donde).toBe(false);
  });

  it('buscar una entrega que no existe da 404', async () => {
    m.tablas.entregaEpp.findUnique.mockResolvedValue(null);
    await expect(m.servicio.buscarEntrega('x')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('EppService: reposiciones (RF-SST-14)', () => {
  const fila = (id: string, trabajadorId: string, fecha: Date, vidaUtilDias: number, extra: object = {}) => ({
    id,
    trabajadorId,
    elementoId: 'e-1',
    fecha,
    proximaReposicion: new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + vidaUtilDias),
    anulada: false,
    createdAt: new Date(2026, 0, 1),
    trabajador: { id: trabajadorId, nombre: `Trabajador ${trabajadorId}`, documento: trabajadorId },
    elemento: { id: 'e-1', nombre: 'Casco de prueba' },
    ...extra,
  });

  // Hoy es el 10 de junio y la alerta es de 15 días.
  const filas = () => [
    fila('a', 't-vencido', dia(4, 1), 30), // reposición 1/mayo: vencida
    fila('b', 't-por-reponer', dia(5, 20), 30), // reposición 19/jun: faltan 9 días
    fila('c', 't-vigente', dia(6, 9), 30), // reposición 9/jul: faltan 29 días
  ];

  it('por defecto muestra solo lo que pide atención, de lo más urgente a lo menos', async () => {
    const m = montar();
    m.tablas.entregaEpp.findMany.mockResolvedValue(filas());
    const r = await m.servicio.reposiciones({}, HOY);

    expect(r.diasAlerta).toBe(15);
    expect(r.resumen).toEqual({ vencidos: 1, porReponer: 1, vigentes: 1 });
    expect(r.reposiciones.map((x) => [x.trabajador.id, x.estado])).toEqual([
      ['t-vencido', 'VENCIDO'],
      ['t-por-reponer', 'POR_REPONER'],
    ]);
    expect(r.reposiciones[0].diasRestantes).toBeLessThan(0);
  });

  it('puede pedir un estado, o todos', async () => {
    const m = montar();
    m.tablas.entregaEpp.findMany.mockResolvedValue(filas());
    expect((await m.servicio.reposiciones({ estado: 'VIGENTE' }, HOY)).reposiciones.map((x) => x.estado)).toEqual(['VIGENTE']);
    expect((await m.servicio.reposiciones({ estado: 'TODOS' }, HOY)).reposiciones).toHaveLength(3);
    expect((await m.servicio.reposiciones({ estado: 'VENCIDO' }, HOY)).reposiciones).toHaveLength(1);
  });

  it('usa la anticipación configurada: con 5 días la de 9 días ya no es "por reponer"', async () => {
    const m = montar();
    m.configuracion.obtenerEmpresa.mockResolvedValue({ diasAlertaSst: 5 });
    m.tablas.entregaEpp.findMany.mockResolvedValue(filas());
    const r = await m.servicio.reposiciones({}, HOY);
    expect(r.diasAlerta).toBe(5);
    expect(r.reposiciones.map((x) => x.estado)).toEqual(['VENCIDO']);
  });

  it('solo mira entregas no anuladas de trabajadores activos y de elementos activos', async () => {
    const m = montar();
    await m.servicio.reposiciones({ trabajadorId: 't-1' }, HOY);
    expect(m.tablas.entregaEpp.findMany.mock.calls[0][0].where).toEqual({ anulada: false, trabajador: { estado: 'ACTIVO', id: 't-1' }, elemento: { activo: true } });
  });

  it('una reposición reciente deja sin alerta la entrega vieja del mismo trabajador y elemento', async () => {
    const m = montar();
    m.tablas.entregaEpp.findMany.mockResolvedValue([fila('vieja', 't-1', dia(1, 1), 30), fila('nueva', 't-1', dia(6, 5), 30)]);
    const r = await m.servicio.reposiciones({ estado: 'TODOS' }, HOY);
    expect(r.reposiciones).toHaveLength(1);
    expect(r.reposiciones[0]).toMatchObject({ entregaId: 'nueva', estado: 'VIGENTE' });
  });
});
