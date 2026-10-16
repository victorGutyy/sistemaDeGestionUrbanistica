import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { exigirAlcanceTotal, filtroCliente } from '../auth/alcance.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CrearClienteDto } from './dto/crear-cliente.dto.js';

@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(dto: CrearClienteDto, usuario: UsuarioAutenticado) {
    // Un cliente sin ventas todavía no pertenece a ningún proyecto: lo registra
    // quien ve todos los proyectos (o se crea junto con su venta).
    exigirAlcanceTotal(usuario);

    const existente = await this.prisma.cliente.findUnique({
      where: { documento: dto.documento },
    });
    if (existente) {
      throw new ConflictException(`Ya existe un cliente con el documento ${dto.documento}`);
    }

    return this.prisma.cliente.create({ data: dto });
  }

  // Quien tiene alcance restringido solo ve a los clientes con alguna venta en sus proyectos.
  listar(usuario: UsuarioAutenticado) {
    return this.prisma.cliente.findMany({ where: filtroCliente(usuario), orderBy: { nombre: 'asc' } });
  }

  async buscarPorId(id: string, usuario: UsuarioAutenticado) {
    const cliente = await this.prisma.cliente.findFirst({ where: { id, ...filtroCliente(usuario) } });
    if (!cliente) {
      throw new NotFoundException(`No existe el cliente ${id}`);
    }
    return cliente;
  }
}
