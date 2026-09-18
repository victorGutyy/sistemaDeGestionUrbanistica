import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CrearLoteDto } from './dto/crear-lote.dto.js';
import { ListarLotesQueryDto } from './dto/listar-lotes-query.dto.js';

@Injectable()
export class LotesService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(dto: CrearLoteDto) {
    const proyecto = await this.prisma.proyecto.findUnique({ where: { id: dto.proyectoId } });
    if (!proyecto) {
      throw new NotFoundException(`No existe el proyecto ${dto.proyectoId}`);
    }

    const yaExiste = await this.prisma.lote.findUnique({
      where: { proyectoId_numero: { proyectoId: dto.proyectoId, numero: dto.numero } },
    });
    if (yaExiste) {
      throw new ConflictException(`El proyecto ya tiene un lote con el número ${dto.numero}`);
    }

    return this.prisma.lote.create({ data: dto });
  }

  listar(filtro: ListarLotesQueryDto) {
    return this.prisma.lote.findMany({
      where: {
        estado: filtro.estado,
        proyectoId: filtro.proyectoId,
      },
      include: { proyecto: true },
      orderBy: [{ proyecto: { nombre: 'asc' } }, { numero: 'asc' }],
    });
  }

  async buscarPorId(id: string) {
    const lote = await this.prisma.lote.findUnique({
      where: { id },
      include: { proyecto: true },
    });
    if (!lote) {
      throw new NotFoundException(`No existe el lote ${id}`);
    }
    return lote;
  }
}
