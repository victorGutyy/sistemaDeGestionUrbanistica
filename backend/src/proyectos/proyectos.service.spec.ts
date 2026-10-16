import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoProyecto, TipoProyecto } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ProyectosService } from './proyectos.service.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';

function crearPrismaFalso() {
  return {
    proyecto: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    manzana: { findFirst: vi.fn(), create: vi.fn() },
  };
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
