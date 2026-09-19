import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActualizarEstadoUsuarioDto } from './dto/actualizar-estado-usuario.dto.js';
import { CrearUsuarioDto } from './dto/crear-usuario.dto.js';

const SELECT_SIN_PASSWORD = { id: true, nombre: true, email: true, rol: true, estado: true, createdAt: true };

@Injectable()
export class UsuariosService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(dto: CrearUsuarioDto) {
    const existente = await this.prisma.usuario.findUnique({ where: { email: dto.email } });
    if (existente) {
      throw new ConflictException(`Ya existe un usuario con el correo ${dto.email}`);
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    return this.prisma.usuario.create({
      data: { nombre: dto.nombre, email: dto.email, passwordHash, rol: dto.rol },
      select: SELECT_SIN_PASSWORD,
    });
  }

  listar() {
    return this.prisma.usuario.findMany({ orderBy: { nombre: 'asc' }, select: SELECT_SIN_PASSWORD });
  }

  async actualizarEstado(id: string, dto: ActualizarEstadoUsuarioDto, idUsuarioActual: string) {
    if (id === idUsuarioActual) {
      throw new BadRequestException('No puedes cambiar el estado de tu propia cuenta');
    }

    const usuario = await this.prisma.usuario.findUnique({ where: { id } });
    if (!usuario) {
      throw new NotFoundException(`No existe el usuario ${id}`);
    }

    return this.prisma.usuario.update({
      where: { id },
      data: { estado: dto.estado },
      select: SELECT_SIN_PASSWORD,
    });
  }
}
