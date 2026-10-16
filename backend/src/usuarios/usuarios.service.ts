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
  rol: { select: { id: true, clave: true, nombre: true, limitablePorProyecto: true } },
  todosLosProyectos: true,
  proyectosPermitidos: { select: { proyectoId: true } },
} as const;

interface AlcanceResuelto {
  todosLosProyectos: boolean;
  // undefined = no tocar la lista actual de proyectos.
  proyectoIds: string[] | undefined;
}

@Injectable()
export class UsuariosService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(dto: CrearUsuarioDto) {
    const rol = await this.exigirRolActivo(dto.rolId);
    await this.exigirCorreoLibre(dto.email);
    const alcance = await this.resolverAlcance(rol, dto, true);

    const passwordHash = await bcrypt.hash(dto.password, 12);

    return this.prisma.usuario.create({
      data: {
        nombre: dto.nombre,
        email: dto.email,
        passwordHash,
        rolId: dto.rolId,
        todosLosProyectos: alcance.todosLosProyectos,
        proyectosPermitidos: alcance.proyectoIds
          ? { create: alcance.proyectoIds.map((proyectoId) => ({ proyectoId })) }
          : undefined,
      },
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

    let rolFinal = usuario.rol;
    if (dto.rolId && dto.rolId !== usuario.rolId) {
      const rolNuevo = await this.exigirRolActivo(dto.rolId);
      // Cambiar el rol puede quitarle a alguien la gestión de usuarios.
      if (!rolNuevo.permisos.includes(PERMISOS.USUARIOS_GESTIONAR)) {
        await this.exigirOtroGestorActivo(usuario);
      }
      rolFinal = rolNuevo;
    }

    const alcance = await this.resolverAlcance(rolFinal, dto, false, usuario.todosLosProyectos);

    return this.prisma.$transaction(async (tx) => {
      if (alcance.proyectoIds) {
        await tx.usuarioProyecto.deleteMany({ where: { usuarioId: id } });
        await tx.usuarioProyecto.createMany({
          data: alcance.proyectoIds.map((proyectoId) => ({ usuarioId: id, proyectoId })),
        });
      }
      return tx.usuario.update({
        where: { id },
        data: {
          nombre: dto.nombre,
          email: dto.email,
          rolId: dto.rolId,
          todosLosProyectos: alcance.todosLosProyectos,
        },
        select: SELECT_PUBLICO,
      });
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

  // Decide el alcance por proyecto que queda tras crear o editar:
  // - Un rol que no se puede limitar por proyecto siempre queda con todos los proyectos.
  // - Restringir exige al menos un proyecto, y todos deben existir.
  // - Si solo se cambia el rol de alguien ya restringido (a otro rol limitable), conserva su lista.
  private async resolverAlcance(
    rol: { clave: string; limitablePorProyecto: boolean },
    dto: { todosLosProyectos?: boolean; proyectoIds?: string[] },
    esCreacion: boolean,
    todosActual = true,
  ): Promise<AlcanceResuelto> {
    const estabaRestringido = !esCreacion && !todosActual;

    if (!rol.limitablePorProyecto) {
      if (dto.todosLosProyectos === false) {
        throw new BadRequestException(`El rol ${rol.clave} no se puede limitar a ciertos proyectos`);
      }
      // Si venía restringido y pasa a un rol no limitable, recupera el acceso total y se limpia su lista.
      return { todosLosProyectos: true, proyectoIds: estabaRestringido ? [] : undefined };
    }

    const quiereTodos = dto.todosLosProyectos ?? !estabaRestringido;
    if (quiereTodos) {
      return { todosLosProyectos: true, proyectoIds: estabaRestringido ? [] : undefined };
    }

    // Queda restringido.
    if (dto.proyectoIds === undefined) {
      if (estabaRestringido) return { todosLosProyectos: false, proyectoIds: undefined }; // conserva su lista
      throw new BadRequestException('Para limitar el acceso debes elegir al menos un proyecto');
    }

    const ids = [...new Set(dto.proyectoIds)];
    if (ids.length === 0) {
      throw new BadRequestException('Para limitar el acceso debes elegir al menos un proyecto');
    }
    const existentes = await this.prisma.proyecto.count({ where: { id: { in: ids } } });
    if (existentes !== ids.length) {
      throw new BadRequestException('Alguno de los proyectos elegidos no existe');
    }
    return { todosLosProyectos: false, proyectoIds: ids };
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
