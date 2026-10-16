import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { UsuariosService } from './usuarios.service.js';

const ROL_GERENTE = { id: 'rol-g', clave: 'GERENTE', nombre: 'Gerente', activo: true, permisos: ['usuarios.gestionar'] };
const ROL_CONSULTA = {
  id: 'rol-c',
  clave: 'CONSULTA',
  nombre: 'Consulta',
  activo: true,
  permisos: ['ventas.ver'],
  limitablePorProyecto: true,
};

function crearPrismaFalso() {
  const prisma = {
    usuario: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    usuarioProyecto: { deleteMany: vi.fn(), createMany: vi.fn() },
    rolUsuario: { findUnique: vi.fn() },
    proyecto: { count: vi.fn() },
    $transaction: vi.fn(),
  };
  // En la transacción el servicio usa las mismas tablas falsas.
  prisma.$transaction.mockImplementation((accion: (tx: typeof prisma) => unknown) => accion(prisma));
  return prisma;
}

describe('UsuariosService', () => {
  let prisma: ReturnType<typeof crearPrismaFalso>;
  let service: UsuariosService;

  beforeEach(() => {
    prisma = crearPrismaFalso();
    service = new UsuariosService(prisma as unknown as PrismaService);
  });

  describe('crear', () => {
    it('rechaza crear un usuario con un correo que ya existe', async () => {
      prisma.rolUsuario.findUnique.mockResolvedValue(ROL_CONSULTA);
      prisma.usuario.findUnique.mockResolvedValue({ id: 'existente' });

      await expect(
        service.crear({ nombre: 'Juan', email: 'juan@x.com', password: '12345678', rolId: 'rol-c' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rechaza un rol que no existe o está desactivado', async () => {
      prisma.rolUsuario.findUnique.mockResolvedValue(null);
      await expect(
        service.crear({ nombre: 'Juan', email: 'juan@x.com', password: '12345678', rolId: 'x' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      prisma.rolUsuario.findUnique.mockResolvedValue({ ...ROL_CONSULTA, activo: false });
      await expect(
        service.crear({ nombre: 'Juan', email: 'juan@x.com', password: '12345678', rolId: 'rol-c' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('nunca guarda la contraseña en texto plano', async () => {
      prisma.rolUsuario.findUnique.mockResolvedValue(ROL_CONSULTA);
      prisma.usuario.findUnique.mockResolvedValue(null);
      prisma.usuario.create.mockResolvedValue({ id: '1' });

      await service.crear({ nombre: 'Juan', email: 'juan@x.com', password: '12345678', rolId: 'rol-c' });

      const { data } = prisma.usuario.create.mock.calls[0][0];
      expect(data.passwordHash).not.toBe('12345678');
      expect(await bcrypt.compare('12345678', data.passwordHash)).toBe(true);
    });
  });

  describe('actualizarEstado', () => {
    it('rechaza que un usuario cambie el estado de su propia cuenta', async () => {
      await expect(service.actualizarEstado('1', { estado: 'INACTIVO' }, '1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rechaza actualizar el estado de un usuario que no existe', async () => {
      prisma.usuario.findUnique.mockResolvedValue(null);

      await expect(service.actualizarEstado('2', { estado: 'INACTIVO' }, '1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('no deja desactivar al último usuario activo que puede gestionar usuarios', async () => {
      prisma.usuario.findUnique.mockResolvedValue({ id: '2', estado: 'ACTIVO', rol: ROL_GERENTE });
      prisma.usuario.count.mockResolvedValue(0);

      await expect(service.actualizarEstado('2', { estado: 'INACTIVO' }, '1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.usuario.update).not.toHaveBeenCalled();
    });

    it('permite desactivar a un gestor si queda otro activo', async () => {
      prisma.usuario.findUnique.mockResolvedValue({ id: '2', estado: 'ACTIVO', rol: ROL_GERENTE });
      prisma.usuario.count.mockResolvedValue(1);
      prisma.usuario.update.mockResolvedValue({ id: '2' });

      await service.actualizarEstado('2', { estado: 'INACTIVO' }, '1');

      expect(prisma.usuario.update).toHaveBeenCalledWith(expect.objectContaining({ data: { estado: 'INACTIVO' } }));
    });

    it('desactivar a un usuario sin permiso de gestión no requiere revisar a los demás', async () => {
      prisma.usuario.findUnique.mockResolvedValue({ id: '3', estado: 'ACTIVO', rol: ROL_CONSULTA });
      prisma.usuario.update.mockResolvedValue({ id: '3' });

      await service.actualizarEstado('3', { estado: 'INACTIVO' }, '1');

      expect(prisma.usuario.count).not.toHaveBeenCalled();
    });
  });

  describe('actualizar', () => {
    it('no deja quitarle el rol de gestión al último gestor activo', async () => {
      prisma.usuario.findUnique.mockResolvedValue({ id: '2', email: 'g@x.com', rolId: 'rol-g', estado: 'ACTIVO', rol: ROL_GERENTE });
      prisma.rolUsuario.findUnique.mockResolvedValue(ROL_CONSULTA);
      prisma.usuario.count.mockResolvedValue(0);

      await expect(service.actualizar('2', { rolId: 'rol-c' })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.usuario.update).not.toHaveBeenCalled();
    });

    it('rechaza cambiar el correo por uno que ya usa otra persona', async () => {
      prisma.usuario.findUnique
        .mockResolvedValueOnce({ id: '2', email: 'a@x.com', rolId: 'rol-c', estado: 'ACTIVO', rol: ROL_CONSULTA })
        .mockResolvedValueOnce({ id: '9', email: 'b@x.com' });

      await expect(service.actualizar('2', { email: 'b@x.com' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('cambia nombre y rol cuando todo es válido', async () => {
      prisma.usuario.findUnique.mockResolvedValue({ id: '3', email: 'a@x.com', rolId: 'rol-c', estado: 'ACTIVO', rol: ROL_CONSULTA });
      prisma.rolUsuario.findUnique.mockResolvedValue({ ...ROL_GERENTE, id: 'rol-g' });
      prisma.usuario.update.mockResolvedValue({ id: '3' });

      await service.actualizar('3', { nombre: 'Nuevo Nombre', rolId: 'rol-g' });

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ nombre: 'Nuevo Nombre', rolId: 'rol-g' }) }),
      );
    });
  });

  describe('alcance por proyecto', () => {
    const USUARIO_CONSULTA = { id: '3', email: 'a@x.com', rolId: 'rol-c', estado: 'ACTIVO', todosLosProyectos: true, rol: ROL_CONSULTA };

    it('crea un usuario de Consulta limitado a los proyectos elegidos', async () => {
      prisma.rolUsuario.findUnique.mockResolvedValue(ROL_CONSULTA);
      prisma.usuario.findUnique.mockResolvedValue(null);
      prisma.proyecto.count.mockResolvedValue(2);
      prisma.usuario.create.mockResolvedValue({ id: '9' });

      await service.crear({
        nombre: 'Socio',
        email: 's@x.com',
        password: '12345678',
        rolId: 'rol-c',
        todosLosProyectos: false,
        proyectoIds: ['p-1', 'p-2', 'p-1'],
      });

      const { data } = prisma.usuario.create.mock.calls[0][0];
      expect(data.todosLosProyectos).toBe(false);
      expect(data.proyectosPermitidos.create).toEqual([{ proyectoId: 'p-1' }, { proyectoId: 'p-2' }]);
    });

    it('rechaza limitar por proyecto a un rol que no es limitable (p. ej. administrador)', async () => {
      prisma.rolUsuario.findUnique.mockResolvedValue({ ...ROL_CONSULTA, clave: 'ADMINISTRADOR', limitablePorProyecto: false });
      prisma.usuario.findUnique.mockResolvedValue(null);

      await expect(
        service.crear({ nombre: 'Adm', email: 'a@x.com', password: '12345678', rolId: 'rol-c', todosLosProyectos: false, proyectoIds: ['p-1'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza limitar el acceso sin elegir ningún proyecto', async () => {
      prisma.rolUsuario.findUnique.mockResolvedValue(ROL_CONSULTA);
      prisma.usuario.findUnique.mockResolvedValue(null);

      await expect(
        service.crear({ nombre: 'Socio', email: 's@x.com', password: '12345678', rolId: 'rol-c', todosLosProyectos: false, proyectoIds: [] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.crear({ nombre: 'Socio', email: 's@x.com', password: '12345678', rolId: 'rol-c', todosLosProyectos: false }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza proyectos que no existen', async () => {
      prisma.rolUsuario.findUnique.mockResolvedValue(ROL_CONSULTA);
      prisma.usuario.findUnique.mockResolvedValue(null);
      prisma.proyecto.count.mockResolvedValue(1); // se pidieron 2

      await expect(
        service.crear({ nombre: 'Socio', email: 's@x.com', password: '12345678', rolId: 'rol-c', todosLosProyectos: false, proyectoIds: ['p-1', 'p-x'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('al editar reemplaza la lista de proyectos permitidos', async () => {
      prisma.usuario.findUnique.mockResolvedValue(USUARIO_CONSULTA);
      prisma.proyecto.count.mockResolvedValue(1);
      prisma.usuario.update.mockResolvedValue({ id: '3' });

      await service.actualizar('3', { todosLosProyectos: false, proyectoIds: ['p-7'] });

      expect(prisma.usuarioProyecto.deleteMany).toHaveBeenCalledWith({ where: { usuarioId: '3' } });
      expect(prisma.usuarioProyecto.createMany).toHaveBeenCalledWith({ data: [{ usuarioId: '3', proyectoId: 'p-7' }] });
      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ todosLosProyectos: false }) }),
      );
    });

    it('cambiar solo el nombre de alguien restringido conserva su lista de proyectos', async () => {
      prisma.usuario.findUnique.mockResolvedValue({ ...USUARIO_CONSULTA, todosLosProyectos: false });
      prisma.usuario.update.mockResolvedValue({ id: '3' });

      await service.actualizar('3', { nombre: 'Nombre Nuevo' });

      expect(prisma.usuarioProyecto.deleteMany).not.toHaveBeenCalled();
      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ todosLosProyectos: false }) }),
      );
    });

    it('pasar a alguien restringido a un rol no limitable le devuelve el acceso total y limpia su lista', async () => {
      const rolAdmin = { id: 'rol-a', clave: 'ADMINISTRADOR', nombre: 'Administrador', activo: true, permisos: ['ventas.ver'], limitablePorProyecto: false };
      prisma.usuario.findUnique.mockResolvedValue({ ...USUARIO_CONSULTA, todosLosProyectos: false });
      prisma.rolUsuario.findUnique.mockResolvedValue(rolAdmin);
      prisma.usuario.count.mockResolvedValue(1);
      prisma.usuario.update.mockResolvedValue({ id: '3' });

      await service.actualizar('3', { rolId: 'rol-a' });

      expect(prisma.usuarioProyecto.deleteMany).toHaveBeenCalledWith({ where: { usuarioId: '3' } });
      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ todosLosProyectos: true, rolId: 'rol-a' }) }),
      );
    });
  });

  describe('restablecerPassword', () => {
    it('guarda la contraseña cifrada, desbloquea la cuenta y cierra sus sesiones abiertas', async () => {
      prisma.usuario.findUnique.mockResolvedValue({ id: '3', estado: 'ACTIVO', rol: ROL_CONSULTA });
      prisma.usuario.update.mockResolvedValue({ id: '3' });

      await service.restablecerPassword('3', { password: 'NuevaClave123' });

      const { data } = prisma.usuario.update.mock.calls[0][0];
      expect(await bcrypt.compare('NuevaClave123', data.passwordHash)).toBe(true);
      expect(data.intentosFallidos).toBe(0);
      expect(data.bloqueadoHasta).toBeNull();
      expect(data.sesionesValidasDesde).toBeInstanceOf(Date);
    });

    it('responde 404 si el usuario no existe', async () => {
      prisma.usuario.findUnique.mockResolvedValue(null);
      await expect(service.restablecerPassword('x', { password: 'NuevaClave123' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('desbloquear', () => {
    it('limpia el contador y el bloqueo', async () => {
      prisma.usuario.findUnique.mockResolvedValue({ id: '3', rol: ROL_CONSULTA });
      prisma.usuario.update.mockResolvedValue({ id: '3' });

      await service.desbloquear('3');

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { intentosFallidos: 0, bloqueadoHasta: null } }),
      );
    });
  });
});
