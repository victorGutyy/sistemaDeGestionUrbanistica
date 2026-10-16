import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ROLES_SISTEMA, TODOS_LOS_PERMISOS } from '../auth/permisos.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class RolesService implements OnModuleInit {
  private readonly logger = new Logger(RolesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Al arrancar, deja los roles del sistema con los permisos que dice el
  // código. Así, cuando una versión nueva agrega un permiso, el gerente lo
  // recibe sin migración. Los roles creados por el gerente no se tocan.
  async onModuleInit() {
    try {
      await this.sincronizarRolesDelSistema();
    } catch (error) {
      // Si la base aún no tiene la migración (p. ej. arranque antes de migrar), no tumbar la app.
      this.logger.warn(`No se pudieron sincronizar los roles del sistema: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async sincronizarRolesDelSistema() {
    for (const rol of ROLES_SISTEMA) {
      await this.prisma.rolUsuario.upsert({
        where: { clave: rol.clave },
        update: {
          nombre: rol.nombre,
          descripcion: rol.descripcion,
          permisos: rol.permisos,
          limitablePorProyecto: rol.limitablePorProyecto,
          esSistema: true,
        },
        create: {
          clave: rol.clave,
          nombre: rol.nombre,
          descripcion: rol.descripcion,
          permisos: rol.permisos,
          limitablePorProyecto: rol.limitablePorProyecto,
          esSistema: true,
        },
      });
    }
  }

  // Para llenar el selector de rol y mostrar qué puede hacer cada uno.
  async listar() {
    const roles = await this.prisma.rolUsuario.findMany({
      where: { activo: true },
      orderBy: [{ esSistema: 'desc' }, { nombre: 'asc' }],
      select: { id: true, clave: true, nombre: true, descripcion: true, permisos: true, esSistema: true, limitablePorProyecto: true },
    });
    return { roles, catalogoDePermisos: TODOS_LOS_PERMISOS };
  }
}
