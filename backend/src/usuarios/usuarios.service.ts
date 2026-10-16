import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PERMISOS } from '../auth/permisos.js';
import { EstadoUsuario } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActualizarEstadoUsuarioDto } from './dto/actualizar-estado-usuario.dto.js';
import { ActualizarUsuarioDto } from './dto/actualizar-usuario.dto.js';
import { CrearUsuarioDto } from './dto/crear-usuario.dto.js';
import { RestablecerPasswordDto } from './dto/restablecer-password.dto.js';

// Nunca se devuelve passwordHash.
const SELECT_PUBLICO = {
  id: true,
  nombre: true,
  email: true,
  estado: true,
  ultimoIngreso: true,
  bloqueadoHasta: true,
  createdAt: true,
  rol: { select: { id: true, clave: true, nombre: true } },
} as const;

@Injectable()
export class UsuariosService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(dto: CrearUsuarioDto) {
    await this.exigirRolActivo(dto.rolId);
    await this.exigirCorreoLibre(dto.email);

    const passwordHash = await bcrypt.hash(dto.password, 12);

    return this.prisma.usuario.create({
      data: { nombre: dto.nombre, email: dto.email, passwordHash, rolId: dto.rolId },
      select: SELECT_PUBLICO,
    });
  }

  listar() {
    return this.prisma.usuario.findMany({ orderBy: { nombre: 'asc' }, select: SELECT_PUBLICO });
  }

  async actualizar(id: string, dto: ActualizarUsuarioDto) {
    const usuario = await this.obtenerConRol(id);

    if (dto.email && dto.email !== usuario.email) {
      await this.exigirCorreoLibre(dto.email, id);
    }

    if (dto.rolId && dto.rolId !== usuario.rolId) {
      const rolNuevo = await this.exigirRolActivo(dto.rolId);
      // Cambiar el rol puede quitarle a alguien la gestión de usuarios.
      if (!rolNuevo.permisos.includes(PERMISOS.USUARIOS_GESTIONAR)) {
        await this.exigirOtroGestorActivo(usuario);
      }
    }

    return this.prisma.usuario.update({
      where: { id },
      data: { nombre: dto.nombre, email: dto.email, rolId: dto.rolId },
      select: SELECT_PUBLICO,
    });
  }

  async actualizarEstado(id: string, dto: ActualizarEstadoUsuarioDto, idUsuarioActual: string) {
    if (id === idUsuarioActual) {
      throw new BadRequestException('No puedes cambiar el estado de tu propia cuenta');
    }

    const usuario = await this.obtenerConRol(id);
    if (dto.estado === EstadoUsuario.INACTIVO) {
      await this.exigirOtroGestorActivo(usuario);
    }

    return this.prisma.usuario.update({
      where: { id },
      data: { estado: dto.estado },
      select: SELECT_PUBLICO,
    });
  }

  // El gerente fija una contraseña nueva. Cierra las sesiones abiertas de esa
  // cuenta (por si el motivo era una sospecha de acceso indebido) y la desbloquea.
  async restablecerPassword(id: string, dto: RestablecerPasswordDto) {
    await this.obtenerConRol(id);
    const passwordHash = await bcrypt.hash(dto.password, 12);

    return this.prisma.usuario.update({
      where: { id },
      data: { passwordHash, intentosFallidos: 0, bloqueadoHasta: null, sesionesValidasDesde: new Date() },
      select: SELECT_PUBLICO,
    });
  }

  async desbloquear(id: string) {
    await this.obtenerConRol(id);
    return this.prisma.usuario.update({
      where: { id },
      data: { intentosFallidos: 0, bloqueadoHasta: null },
      select: SELECT_PUBLICO,
    });
  }

  private async obtenerConRol(id: string) {
    const usuario = await this.prisma.usuario.findUnique({ where: { id }, include: { rol: true } });
    if (!usuario) {
      throw new NotFoundException(`No existe el usuario ${id}`);
    }
    return usuario;
  }

  private async exigirRolActivo(rolId: string) {
    const rol = await this.prisma.rolUsuario.findUnique({ where: { id: rolId } });
    if (!rol || !rol.activo) {
      throw new BadRequestException('El rol indicado no existe o está desactivado');
    }
    return rol;
  }

  private async exigirCorreoLibre(email: string, ignorarId?: string) {
    const existente = await this.prisma.usuario.findUnique({ where: { email } });
    if (existente && existente.id !== ignorarId) {
      throw new ConflictException(`Ya existe un usuario con el correo ${email}`);
    }
  }

  // Regla de seguridad: siempre debe quedar al menos una cuenta activa que
  // pueda gestionar usuarios; si no, nadie podría volver a arreglar accesos.
  private async exigirOtroGestorActivo(usuario: { id: string; estado: EstadoUsuario; rol: { permisos: string[] } }) {
    const eraGestorActivo =
      usuario.estado === EstadoUsuario.ACTIVO && usuario.rol.permisos.includes(PERMISOS.USUARIOS_GESTIONAR);
    if (!eraGestorActivo) return;

    const otros = await this.prisma.usuario.count({
      where: {
        id: { not: usuario.id },
        estado: EstadoUsuario.ACTIVO,
        rol: { activo: true, permisos: { has: PERMISOS.USUARIOS_GESTIONAR } },
      },
    });
    if (otros === 0) {
      throw new BadRequestException(
        'Debe quedar al menos un usuario activo con permiso para gestionar usuarios (por ejemplo, un gerente)',
      );
    }
  }
}
