import { Injectable, NotFoundException } from '@nestjs/common';
import { parsearFechaLocal } from '../common/fecha.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActualizarEstadoProyectoDto } from './dto/actualizar-estado-proyecto.dto.js';
import { CrearProyectoDto } from './dto/crear-proyecto.dto.js';

@Injectable()
export class ProyectosService {
  constructor(private readonly prisma: PrismaService) {}

  crear(dto: CrearProyectoDto) {
    return this.prisma.proyecto.create({
      data: {
        nombre: dto.nombre,
        ubicacion: dto.ubicacion,
        areaTotal: dto.areaTotal,
        valorCompra: dto.valorCompra,
        fechaCompra: dto.fechaCompra ? parsearFechaLocal(dto.fechaCompra) : undefined,
      },
    });
  }

  listar() {
    return this.prisma.proyecto.findMany({
      include: { _count: { select: { lotes: true } } },
      orderBy: { nombre: 'asc' },
    });
  }

  async buscarPorId(id: string) {
    const proyecto = await this.prisma.proyecto.findUnique({
      where: { id },
      include: { lotes: { orderBy: { numero: 'asc' } } },
    });
    if (!proyecto) {
      throw new NotFoundException(`No existe el proyecto ${id}`);
    }
    return proyecto;
  }

  async actualizarEstado(id: string, dto: ActualizarEstadoProyectoDto) {
    const proyecto = await this.prisma.proyecto.findUnique({ where: { id } });
    if (!proyecto) {
      throw new NotFoundException(`No existe el proyecto ${id}`);
    }

    return this.prisma.proyecto.update({
      where: { id },
      data: { estado: dto.estado },
    });
  }
}
