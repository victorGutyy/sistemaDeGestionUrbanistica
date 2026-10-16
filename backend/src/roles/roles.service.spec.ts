import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLES_SISTEMA, TODOS_LOS_PERMISOS } from '../auth/permisos.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { RolesService } from './roles.service.js';

describe('RolesService', () => {
  let prisma: { rolUsuario: { upsert: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> } };
  let service: RolesService;

  beforeEach(() => {
    prisma = { rolUsuario: { upsert: vi.fn(), findMany: vi.fn() } };
    service = new RolesService(prisma as unknown as PrismaService);
  });

  it('sincroniza los roles del sistema con los permisos que dice el código', async () => {
    await service.sincronizarRolesDelSistema();

    expect(prisma.rolUsuario.upsert).toHaveBeenCalledTimes(ROLES_SISTEMA.length);
    const gerente = prisma.rolUsuario.upsert.mock.calls
      .map(([argumentos]) => argumentos)
      .find((argumentos) => argumentos.where.clave === 'GERENTE');
    expect(gerente.update.permisos).toEqual(TODOS_LOS_PERMISOS);
    expect(gerente.update.esSistema).toBe(true);
  });

  it('un fallo al sincronizar (p. ej. base sin migrar) no tumba el arranque de la app', async () => {
    prisma.rolUsuario.upsert.mockRejectedValue(new Error('tabla no existe'));

    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });

  it('lista los roles activos junto con el catálogo de permisos', async () => {
    prisma.rolUsuario.findMany.mockResolvedValue([{ id: '1', clave: 'GERENTE' }]);

    const resultado = await service.listar();

    expect(resultado.roles).toHaveLength(1);
    expect(resultado.catalogoDePermisos).toEqual(TODOS_LOS_PERMISOS);
    expect(prisma.rolUsuario.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { activo: true } }));
  });
});
