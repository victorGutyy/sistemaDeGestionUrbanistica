import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EstadoProyecto } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ProyectosService } from './proyectos.service.js';

function crearPrismaFalso() {
  return {
    proyecto: { findUnique: vi.fn(), update: vi.fn() },
  };
}

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
      service.actualizarEstado('p-x', { estado: EstadoProyecto.FINALIZADO }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('actualiza el estado cuando el proyecto existe', async () => {
    prisma.proyecto.findUnique.mockResolvedValue({ id: 'p-1' });
    prisma.proyecto.update.mockResolvedValue({ id: 'p-1', estado: EstadoProyecto.FINALIZADO });

    const resultado = await service.actualizarEstado('p-1', { estado: EstadoProyecto.FINALIZADO });

    expect(prisma.proyecto.update).toHaveBeenCalledWith({
      where: { id: 'p-1' },
      data: { estado: EstadoProyecto.FINALIZADO },
    });
    expect(resultado).toEqual({ id: 'p-1', estado: EstadoProyecto.FINALIZADO });
  });
});
