import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { auditoriaDe, auditoriasDe } from '../test-utils/auditoria.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import { ConfiguracionService } from './configuracion.service.js';

function crearPrismaFalso() {
  const tablas = {
    tipoEquipo: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    categoriaGasto: { findUnique: vi.fn(), findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
    registroAuditoria: { create: vi.fn() },
  };
  return { ...tablas, $transaction: vi.fn((accion: (tx: typeof tablas) => unknown) => accion(tablas)) };
}

const servicio = (prisma: ReturnType<typeof crearPrismaFalso>) => new ConfiguracionService(prisma as unknown as PrismaService, {} as StorageService);

describe('Tipos de equipo (RF-MAQ-02)', () => {
  it('el gerente crea un tipo y queda en la auditoría', async () => {
    const prisma = crearPrismaFalso();
    prisma.tipoEquipo.findFirst.mockResolvedValue(null);
    prisma.tipoEquipo.create.mockResolvedValue({ id: 't-1', nombre: 'Volqueta', activo: true });

    await servicio(prisma).crearTipoEquipo({ nombre: '  Volqueta ' }, usuarioDePrueba());

    expect(prisma.tipoEquipo.create).toHaveBeenCalledWith({ data: { nombre: 'Volqueta' } });
    expect(auditoriaDe(prisma.registroAuditoria.create, 'CONFIGURACION_TIPO_EQUIPO')).toMatchObject({ entidad: 'CONFIGURACION', entidadId: 't-1', despues: { nombre: 'Volqueta', activo: true } });
  });

  it('un nombre repetido (sin importar mayúsculas) se rechaza sin auditar', async () => {
    const prisma = crearPrismaFalso();
    prisma.tipoEquipo.findFirst.mockResolvedValue({ id: 't-1', nombre: 'Volqueta' });
    await expect(servicio(prisma).crearTipoEquipo({ nombre: 'VOLQUETA' }, usuarioDePrueba())).rejects.toBeInstanceOf(ConflictException);
    expect(auditoriasDe(prisma.registroAuditoria.create)).toEqual([]);
  });

  it('desactivar un tipo deja el valor anterior en la auditoría; uno inexistente es 404', async () => {
    const prisma = crearPrismaFalso();
    prisma.tipoEquipo.findUnique.mockResolvedValue({ id: 't-1', nombre: 'Volqueta', activo: true });
    prisma.tipoEquipo.update.mockResolvedValue({ id: 't-1', nombre: 'Volqueta', activo: false });

    await servicio(prisma).actualizarTipoEquipo('t-1', { activo: false }, usuarioDePrueba());
    expect(auditoriaDe(prisma.registroAuditoria.create, 'CONFIGURACION_TIPO_EQUIPO')).toMatchObject({ antes: { activo: true }, despues: { activo: false } });

    prisma.tipoEquipo.findUnique.mockResolvedValue(null);
    await expect(servicio(prisma).actualizarTipoEquipo('t-x', { activo: true }, usuarioDePrueba())).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('Categorías de gasto propias de la maquinaria (RF-MAQ-06)', () => {
  it('se puede crear una categoría "solo maquinaria", y queda dicho en la auditoría', async () => {
    const prisma = crearPrismaFalso();
    prisma.categoriaGasto.create.mockResolvedValue({ id: 'c-1', nombre: 'Combustible', activa: true, esSistema: false, soloMaquinaria: true });

    await servicio(prisma).crearCategoriaGasto({ nombre: 'Combustible', soloMaquinaria: true }, usuarioDePrueba());

    expect(prisma.categoriaGasto.create).toHaveBeenCalledWith({ data: { nombre: 'Combustible', soloMaquinaria: true } });
    const registro = auditoriaDe(prisma.registroAuditoria.create, 'CONFIGURACION_CATEGORIA');
    expect(registro.resumen).toMatch(/solo maquinaria/);
    expect(registro.despues).toMatchObject({ soloMaquinaria: true });
  });

  it('por defecto la categoría es general', async () => {
    const prisma = crearPrismaFalso();
    prisma.categoriaGasto.create.mockResolvedValue({ id: 'c-2', nombre: 'Materiales', activa: true, esSistema: false, soloMaquinaria: false });
    await servicio(prisma).crearCategoriaGasto({ nombre: 'Materiales' }, usuarioDePrueba());
    expect(prisma.categoriaGasto.create).toHaveBeenCalledWith({ data: { nombre: 'Materiales' } });
  });
});
