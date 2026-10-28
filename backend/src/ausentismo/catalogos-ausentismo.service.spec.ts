import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { auditoriaDe } from '../test-utils/auditoria.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import { CatalogosAusentismoService } from './catalogos-ausentismo.service.js';

const TIPO_LUTO = { id: 'tipo-luto', codigo: 'LUTO', nombre: 'Licencia por luto', regla: 'PAGA_EMPLEADOR', porcentaje: new Prisma.Decimal(100), requiereDiagnostico: false, diaEventoComoLaborado: false, activo: true, orden: 5 };
const TIPO_GENERAL = { id: 'tipo-eg', codigo: 'ENFERMEDAD_GENERAL', nombre: 'Enfermedad general', regla: 'INCAPACIDAD_GENERAL', porcentaje: null, requiereDiagnostico: true, diaEventoComoLaborado: false, activo: true, orden: 1 };
const DIAGNOSTICO = { id: 'cie-1', codigo: 'J06.9', descripcion: 'Infección aguda de las vías respiratorias superiores', activo: true };

function montar() {
  const tablas = {
    tipoAusentismo: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn(), findFirst: vi.fn().mockResolvedValue(null), create: vi.fn(), update: vi.fn() },
    diagnosticoCie10: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    registroAuditoria: { create: vi.fn() },
  };
  tablas.tipoAusentismo.create.mockImplementation(({ data }: { data: object }) => Promise.resolve({ id: 'tipo-nuevo', activo: true, ...data }));
  tablas.tipoAusentismo.update.mockImplementation(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
    Promise.resolve({ ...(where.id === TIPO_GENERAL.id ? TIPO_GENERAL : TIPO_LUTO), ...Object.fromEntries(Object.entries(data).filter(([, valor]) => valor !== undefined)) }),
  );
  tablas.diagnosticoCie10.create.mockImplementation(({ data }: { data: object }) => Promise.resolve({ id: 'cie-nuevo', activo: true, ...data }));
  tablas.diagnosticoCie10.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ ...DIAGNOSTICO, ...Object.fromEntries(Object.entries(data).filter(([, valor]) => valor !== undefined)) }),
  );
  const prisma = { ...tablas, $transaction: vi.fn((accion: (tx: typeof tablas) => unknown) => accion(tablas)) };
  return { tablas, servicio: new CatalogosAusentismoService(prisma as unknown as PrismaService) };
}

describe('CatalogosAusentismoService: tipos de ausentismo (RF-CFG-14)', () => {
  let m: ReturnType<typeof montar>;
  const usuario = usuarioDePrueba();
  beforeEach(() => {
    m = montar();
  });

  it('lista solo los activos, por orden, y todos si se pide', async () => {
    await m.servicio.listarTipos();
    expect(m.tablas.tipoAusentismo.findMany).toHaveBeenLastCalledWith({ where: { activo: true }, orderBy: [{ orden: 'asc' }, { nombre: 'asc' }] });
    await m.servicio.listarTipos(true);
    expect(m.tablas.tipoAusentismo.findMany).toHaveBeenLastCalledWith({ where: {}, orderBy: [{ orden: 'asc' }, { nombre: 'asc' }] });
  });

  it('crea un tipo con porcentaje, lo pone al final de la lista y lo audita', async () => {
    m.tablas.tipoAusentismo.findMany.mockResolvedValue([{ orden: 9 }]);
    const tipo = await m.servicio.crearTipo({ codigo: 'LICENCIA_ESTUDIO', nombre: ' Licencia de estudio ', regla: 'PAGA_EMPLEADOR', porcentaje: 50 } as never, usuario);
    expect(tipo).toMatchObject({ codigo: 'LICENCIA_ESTUDIO', nombre: 'Licencia de estudio', orden: 10 });
    expect(m.tablas.tipoAusentismo.create.mock.calls[0][0].data.porcentaje.toString()).toBe('50');
    expect(auditoriaDe(m.tablas.registroAuditoria.create, 'TIPO_AUSENTISMO_CREAR').resumen).toContain('Licencia de estudio');
  });

  it('una regla con porcentaje lo exige y una incapacidad no lo admite', async () => {
    await expect(m.servicio.crearTipo({ codigo: 'X_TIPO', nombre: 'Otro tipo', regla: 'DESCUENTO' } as never, usuario)).rejects.toThrow(BadRequestException);
    await expect(m.servicio.crearTipo({ codigo: 'X_TIPO', nombre: 'Otro tipo', regla: 'INCAPACIDAD_GENERAL', porcentaje: 66 } as never, usuario)).rejects.toThrow(/parámetros legales/);
    expect(m.tablas.tipoAusentismo.create).not.toHaveBeenCalled();
  });

  it('el día del evento como laborado solo aplica a las reglas de origen laboral', async () => {
    await expect(
      m.servicio.crearTipo({ codigo: 'X_TIPO', nombre: 'Otro tipo', regla: 'PAGA_EPS', porcentaje: 100, diaEventoComoLaborado: true } as never, usuario),
    ).rejects.toThrow(/origen laboral/);
    await m.servicio.crearTipo({ codigo: 'ACCIDENTE_EN_VIA', nombre: 'Accidente en vía', regla: 'ORIGEN_LABORAL', diaEventoComoLaborado: true } as never, usuario);
    expect(m.tablas.tipoAusentismo.create.mock.calls[0][0].data.diaEventoComoLaborado).toBe(true);
  });

  it('no repite la clave ni el nombre', async () => {
    m.tablas.tipoAusentismo.findFirst.mockResolvedValue(TIPO_LUTO);
    await expect(m.servicio.crearTipo({ codigo: 'LUTO', nombre: 'Otro nombre', regla: 'PAGA_EMPLEADOR', porcentaje: 100 } as never, usuario)).rejects.toThrow(ConflictException);
    expect(m.tablas.tipoAusentismo.create).not.toHaveBeenCalled();
  });

  it('cambia el porcentaje de un tipo y deja el antes y el después en la auditoría', async () => {
    m.tablas.tipoAusentismo.findUnique.mockResolvedValue(TIPO_LUTO);
    await m.servicio.actualizarTipo('tipo-luto', { porcentaje: 80 }, usuario);
    const registro = auditoriaDe(m.tablas.registroAuditoria.create, 'TIPO_AUSENTISMO_EDITAR');
    expect(registro.resumen).toContain('porcentaje de 100 a 80 %');
    expect(registro.antes).toMatchObject({ codigo: 'LUTO' });
    expect(registro.despues).toMatchObject({ codigo: 'LUTO' });
  });

  it('el porcentaje de una incapacidad no se cambia en el tipo sino en los parámetros legales', async () => {
    m.tablas.tipoAusentismo.findUnique.mockResolvedValue(TIPO_GENERAL);
    await expect(m.servicio.actualizarTipo('tipo-eg', { porcentaje: 70 }, usuario)).rejects.toThrow(/parámetros legales/);
    expect(m.tablas.tipoAusentismo.update).not.toHaveBeenCalled();
  });

  it('desactiva un tipo (no se borra) y lo anota', async () => {
    m.tablas.tipoAusentismo.findUnique.mockResolvedValue(TIPO_LUTO);
    await m.servicio.actualizarTipo('tipo-luto', { activo: false }, usuario);
    expect(auditoriaDe(m.tablas.registroAuditoria.create, 'TIPO_AUSENTISMO_EDITAR').resumen).toContain('lo desactivó');
  });

  it('un tipo que no existe da 404', async () => {
    m.tablas.tipoAusentismo.findUnique.mockResolvedValue(null);
    await expect(m.servicio.actualizarTipo('nada', { activo: false }, usuario)).rejects.toThrow(NotFoundException);
  });
});

describe('CatalogosAusentismoService: diagnósticos CIE-10 (RF-CFG-14)', () => {
  let m: ReturnType<typeof montar>;
  const usuario = usuarioDePrueba();
  beforeEach(() => {
    m = montar();
  });

  it('busca por código o descripción, sin distinguir mayúsculas, con un tope de filas', async () => {
    await m.servicio.listarDiagnosticos({ q: ' gripe ', limite: 20 });
    const argumento = m.tablas.diagnosticoCie10.findMany.mock.calls[0][0];
    expect(argumento.where.activo).toBe(true);
    expect(argumento.where.OR).toEqual([
      { codigo: { contains: 'gripe', mode: 'insensitive' } },
      { descripcion: { contains: 'gripe', mode: 'insensitive' } },
    ]);
    expect(argumento.take).toBe(20);
  });

  it('sin filtros trae los primeros 50 activos', async () => {
    await m.servicio.listarDiagnosticos();
    const argumento = m.tablas.diagnosticoCie10.findMany.mock.calls[0][0];
    expect(argumento.take).toBe(50);
    expect(argumento.where.OR).toBeUndefined();
  });

  it('agrega un código nuevo y lo audita', async () => {
    m.tablas.diagnosticoCie10.findUnique.mockResolvedValue(null);
    const creado = await m.servicio.crearDiagnostico({ codigo: 'M54.5', descripcion: ' Lumbago no especificado ' }, usuario);
    expect(creado).toMatchObject({ codigo: 'M54.5', descripcion: 'Lumbago no especificado' });
    expect(auditoriaDe(m.tablas.registroAuditoria.create, 'DIAGNOSTICO_CIE10_CREAR').resumen).toContain('M54.5');
  });

  it('no repite un código', async () => {
    m.tablas.diagnosticoCie10.findUnique.mockResolvedValue(DIAGNOSTICO);
    await expect(m.servicio.crearDiagnostico({ codigo: 'J06.9', descripcion: 'Otra descripción' }, usuario)).rejects.toThrow(ConflictException);
    expect(m.tablas.diagnosticoCie10.create).not.toHaveBeenCalled();
  });

  it('desactiva un código y anota qué cambió', async () => {
    m.tablas.diagnosticoCie10.findUnique.mockResolvedValue(DIAGNOSTICO);
    await m.servicio.actualizarDiagnostico('cie-1', { activo: false }, usuario);
    expect(auditoriaDe(m.tablas.registroAuditoria.create, 'DIAGNOSTICO_CIE10_EDITAR').resumen).toContain('lo desactivó');
  });

  it('un código que no existe da 404', async () => {
    m.tablas.diagnosticoCie10.findUnique.mockResolvedValue(null);
    await expect(m.servicio.actualizarDiagnostico('nada', { activo: false }, usuario)).rejects.toThrow(NotFoundException);
  });
});
