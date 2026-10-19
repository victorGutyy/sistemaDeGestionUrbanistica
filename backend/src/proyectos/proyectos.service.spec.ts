import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoProyecto, TipoProyecto } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ProyectosService } from './proyectos.service.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import { auditoriaDe, auditoriasDe } from '../test-utils/auditoria.js';

function crearPrismaFalso() {
  const tablas = {
    proyecto: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    manzana: { findFirst: vi.fn(), create: vi.fn() },
    registroAuditoria: { create: vi.fn() },
  };
  // Los cambios se guardan en una transacción junto con su registro de auditoría.
  return { ...tablas, $transaction: vi.fn((accion: (tx: typeof tablas) => unknown) => accion(tablas)) };
}

const USUARIO = usuarioDePrueba();

describe('ProyectosService.actualizarEstado', () => {
  let prisma: ReturnType<typeof crearPrismaFalso>;
  let service: ProyectosService;

  beforeEach(() => {
    prisma = crearPrismaFalso();
    service = new ProyectosService(prisma as unknown as PrismaService);
  });

  it('rechaza si el proyecto no existe', async () => {
    prisma.proyecto.findUnique.mockResolvedValue(null);

    await expect(
      service.actualizarEstado('p-x', { estado: EstadoProyecto.FINALIZADO }, USUARIO),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('actualiza el estado cuando el proyecto existe', async () => {
    prisma.proyecto.findUnique.mockResolvedValue({ id: 'p-1' });
    prisma.proyecto.update.mockResolvedValue({ id: 'p-1', estado: EstadoProyecto.FINALIZADO });

    const resultado = await service.actualizarEstado('p-1', { estado: EstadoProyecto.FINALIZADO }, USUARIO);

    expect(prisma.proyecto.update).toHaveBeenCalledWith({
      where: { id: 'p-1' },
      data: { estado: EstadoProyecto.FINALIZADO },
    });
    expect(resultado).toEqual({ id: 'p-1', estado: EstadoProyecto.FINALIZADO });
  });
});

describe('ProyectosService: manzanas y resumen de áreas', () => {
  let prisma: ReturnType<typeof crearPrismaFalso>;
  let service: ProyectosService;
  const PROYECTO = { id: 'p-1', nombre: 'La Floresta', tipo: TipoProyecto.LOTES, estado: EstadoProyecto.ACTIVO };

  beforeEach(() => {
    prisma = crearPrismaFalso();
    service = new ProyectosService(prisma as unknown as PrismaService);
    prisma.proyecto.findUnique.mockResolvedValue(PROYECTO);
    prisma.manzana.findFirst.mockResolvedValue(null);
    prisma.manzana.create.mockResolvedValue({ id: 'm-1', nombre: 'A' });
  });

  it('crea una manzana con el nombre recortado', async () => {
    await service.crearManzana('p-1', { nombre: '  A  ' }, USUARIO);
    expect(prisma.manzana.create).toHaveBeenCalledWith({ data: { proyectoId: 'p-1', nombre: 'A' } });
  });

  it('rechaza una manzana repetida sin distinguir mayúsculas', async () => {
    prisma.manzana.findFirst.mockResolvedValue({ id: 'm-0', nombre: 'A' });
    await expect(service.crearManzana('p-1', { nombre: 'a' }, USUARIO)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.manzana.create).not.toHaveBeenCalled();
  });

  it.each([TipoProyecto.REMODELACION, TipoProyecto.MAQUINARIA])('un proyecto de tipo %s no maneja manzanas', async (tipo) => {
    prisma.proyecto.findUnique.mockResolvedValue({ ...PROYECTO, tipo });
    await expect(service.crearManzana('p-1', { nombre: 'A' }, USUARIO)).rejects.toThrow(/no maneja manzanas/);
  });

  it('un proyecto finalizado no admite manzanas nuevas', async () => {
    prisma.proyecto.findUnique.mockResolvedValue({ ...PROYECTO, estado: EstadoProyecto.FINALIZADO });
    await expect(service.crearManzana('p-1', { nombre: 'A' }, USUARIO)).rejects.toThrow(/finalizado/);
  });

  it('un usuario limitado a otro proyecto no puede crearle manzanas (404)', async () => {
    await expect(service.crearManzana('p-1', { nombre: 'A' }, usuarioDePrueba(['p-otro']))).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.proyecto.findUnique).not.toHaveBeenCalled();
  });

  it('el detalle del proyecto incluye el resumen de áreas (total, subdividida y disponible)', async () => {
    prisma.proyecto.findFirst.mockResolvedValue({
      ...PROYECTO,
      areaTotal: new Prisma.Decimal('10000'),
      manzanas: [],
      lotes: [{ area: new Prisma.Decimal('500') }, { area: new Prisma.Decimal('250.5') }],
    });

    const detalle = await service.buscarPorId('p-1', USUARIO);

    expect(detalle.resumenAreas.areaSubdividida.toString()).toBe('750.5');
    expect(detalle.resumenAreas.areaDisponible.toString()).toBe('9249.5');
  });
});

describe('ProyectosService: auditoría (RF-AUD-01)', () => {
  let prisma: ReturnType<typeof crearPrismaFalso>;
  let service: ProyectosService;
  const PROYECTO_BD = { id: 'p-1', nombre: 'La Floresta', tipo: 'LOTES', estado: 'ACTIVO', areaTotal: '1000', ubicacion: null, municipio: 'Calarcá', valorCompra: null, fechaCompra: null };

  beforeEach(() => {
    prisma = crearPrismaFalso();
    service = new ProyectosService(prisma as unknown as PrismaService);
  });

  it('crear un proyecto deja quién lo creó y con qué datos', async () => {
    prisma.proyecto.create.mockResolvedValue(PROYECTO_BD);
    await service.crear({ nombre: 'La Floresta', areaTotal: '1000', municipio: 'Calarcá' }, USUARIO);
    expect(auditoriaDe(prisma.registroAuditoria.create, 'PROYECTO_CREAR')).toMatchObject({ entidad: 'PROYECTO', entidadId: 'p-1', usuarioId: USUARIO.id, despues: { nombre: 'La Floresta', tipo: 'LOTES' } });
  });

  it('finalizar o reactivar un proyecto deja el estado anterior y el nuevo', async () => {
    prisma.proyecto.findUnique.mockResolvedValue(PROYECTO_BD);
    prisma.proyecto.update.mockResolvedValue({ ...PROYECTO_BD, estado: 'FINALIZADO' });
    await service.actualizarEstado('p-1', { estado: 'FINALIZADO' }, USUARIO);
    expect(auditoriaDe(prisma.registroAuditoria.create, 'PROYECTO_CAMBIAR_ESTADO')).toMatchObject({ antes: { estado: 'ACTIVO' }, despues: { estado: 'FINALIZADO' } });
  });

  it('crear una manzana deja a qué proyecto se la agregaron', async () => {
    prisma.proyecto.findUnique.mockResolvedValue(PROYECTO_BD);
    prisma.manzana.findFirst.mockResolvedValue(null);
    prisma.manzana.create.mockResolvedValue({ id: 'm-1', nombre: 'A' });
    await service.crearManzana('p-1', { nombre: 'A' }, USUARIO);
    expect(auditoriaDe(prisma.registroAuditoria.create, 'PROYECTO_CREAR_MANZANA')).toMatchObject({ entidadId: 'p-1', despues: { manzanaId: 'm-1', nombre: 'A' } });
  });

  it('un cambio rechazado (proyecto que no existe) no deja nada en la auditoría', async () => {
    prisma.proyecto.findUnique.mockResolvedValue(null);
    await expect(service.actualizarEstado('x', { estado: 'FINALIZADO' }, USUARIO)).rejects.toThrow();
    expect(auditoriasDe(prisma.registroAuditoria.create)).toEqual([]);
  });
});
