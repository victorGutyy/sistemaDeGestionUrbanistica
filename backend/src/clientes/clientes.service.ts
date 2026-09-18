import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CrearClienteDto } from './dto/crear-cliente.dto.js';

@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(dto: CrearClienteDto) {
    const existente = await this.prisma.cliente.findUnique({
      where: { documento: dto.documento },
    });
    if (existente) {
      throw new ConflictException(`Ya existe un cliente con el documento ${dto.documento}`);
    }

    return this.prisma.cliente.create({ data: dto });
  }

  listar() {
    return this.prisma.cliente.findMany({ orderBy: { nombre: 'asc' } });
  }

  async buscarPorId(id: string) {
    const cliente = await this.prisma.cliente.findUnique({ where: { id } });
    if (!cliente) {
      throw new NotFoundException(`No existe el cliente ${id}`);
    }
    return cliente;
  }
}
