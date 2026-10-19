import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { auditoriaDe, auditoriasDe } from '../test-utils/auditoria.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import { EquiposService } from './equipos.service.js';

const D = (valor: number) => new Prisma.Decimal(valor);

function crearPrismaFalso() {
  const tablas = {
    proyecto: { findUnique: vi.fn() },
    tipoEquipo: { findUnique: vi.fn(), findMany: vi.fn() },
    equipo: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    movimientoFinanciero: { findMany: vi.fn().mockResolvedValue([]) },
    registroAuditoria: { create: vi.fn() },
  };
  return { ...tablas, $transaction: vi.fn((accion: (tx: typeof tablas) => unknown) => accion(tablas)) };
}

const PROYECTO_MAQUINARIA = { id: 'p-1', nombre: 'Maquinaria de Prueba', tipo: 'MAQUINARIA', estado: 'ACTIVO' };
const TIPO = { id: 't-1', nombre: 'Excavadora', activo: true };
const EQUIPO = {
  id: 'e-1',
  proyectoId: 'p-1',
  nombre: 'Excavadora 320',
  tipoEquipoId: 't-1',
  tipoEquipo: { id: 't-1', nombre: 'Excavadora' },
  proyecto: { id: 'p-1', nombre: 'Maquinaria de Prueba' },
  marca: 'Marca de Prueba',
  modelo: 'M-1',
  anio: 2020,
  placaSerie: 'ABC123',
  estado: 'ACTIVO',
  bajaEn: null,
  bajaMotivo: null,
  bajaPorId: null,
  bajaPor: null,
};
const DTO = { proyectoId: 'p-1', nombre: 'Excavadora 320', tipoEquipoId: 't-1', marca: 'Marca de Prueba', placaSerie: 'ABC123' };

const servicio = (prisma: ReturnType<typeof crearPrismaFalso>) => new EquiposService(prisma as unknown as PrismaService);

function prismaConEquipo(equipo: object = EQUIPO) {
  const prisma = crearPrismaFalso();
  prisma.equipo.findFirst.mockResolvedValue(equipo);
  prisma.equipo.updateMany.mockResolvedValue({ count: 1 });
  return prisma;
}

describe('EquiposService.crear (RF-MAQ-01)', () => {
  it('registra el equipo en un proyecto de maquinaria y lo deja en la auditoría', async () => {
    const prisma = crearPrismaFalso();
    prisma.proyecto.findUnique.mockResolvedValue(PROYECTO_MAQUINARIA);
    prisma.tipoEquipo.findUnique.mockResolvedValue(TIPO);
    prisma.equipo.findFirst.mockResolvedValue(null);
    prisma.equipo.create.mockResolvedValue(EQUIPO);
    const usuario = usuarioDePrueba();

    await servicio(prisma).crear(DTO, usuario);

    expect(prisma.equipo.create.mock.calls[0][0].data).toMatchObject({ proyectoId: 'p-1', nombre: 'Excavadora 320', placaSerie: 'ABC123', estado: 'ACTIVO' });
    expect(auditoriaDe(prisma.registroAuditoria.create, 'EQUIPO_CREAR')).toMatchObject({ entidad: 'EQUIPO', entidadId: 'e-1', usuarioId: usuario.id, despues: { nombre: 'Excavadora 320' } });
  });

  it('rechaza un proyecto que no es de maquinaria, uno finalizado y uno que no existe', async () => {
    const prisma = crearPrismaFalso();
    prisma.tipoEquipo.findUnique.mockResolvedValue(TIPO);
    prisma.proyecto.findUnique.mockResolvedValue({ ...PROYECTO_MAQUINARIA, tipo: 'LOTES' });
    await expect(servicio(prisma).crear(DTO, usuarioDePrueba())).rejects.toThrow(/no es de maquinaria/);
    prisma.proyecto.findUnique.mockResolvedValue({ ...PROYECTO_MAQUINARIA, estado: 'FINALIZADO' });
    await expect(servicio(prisma).crear(DTO, usuarioDePrueba())).rejects.toThrow(/finalizado/);
    prisma.proyecto.findUnique.mockResolvedValue(null);
    await expect(servicio(prisma).crear(DTO, usuarioDePrueba())).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.equipo.create).not.toHaveBeenCalled();
  });

  it('rechaza un tipo desactivado o inexistente y una placa repetida', async () => {
    const prisma = crearPrismaFalso();
    prisma.proyecto.findUnique.mockResolvedValue(PROYECTO_MAQUINARIA);
    prisma.tipoEquipo.findUnique.mockResolvedValue({ ...TIPO, activo: false });
    await expect(servicio(prisma).crear(DTO, usuarioDePrueba())).rejects.toThrow(/desactivado/);
    prisma.tipoEquipo.findUnique.mockResolvedValue(null);
    await expect(servicio(prisma).crear(DTO, usuarioDePrueba())).rejects.toThrow(/no existe/);

    prisma.tipoEquipo.findUnique.mockResolvedValue(TIPO);
    prisma.equipo.findFirst.mockResolvedValue({ id: 'otro', nombre: 'Volqueta 1' });
    await expect(servicio(prisma).crear(DTO, usuarioDePrueba())).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.equipo.create).not.toHaveBeenCalled();
    expect(auditoriasDe(prisma.registroAuditoria.create)).toEqual([]);
  });

  it('un usuario restringido a otro proyecto no puede registrar equipos en este (404)', async () => {
    const prisma = crearPrismaFalso();
    await expect(servicio(prisma).crear(DTO, usuarioDePrueba(['otro-proyecto']))).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.proyecto.findUnique).not.toHaveBeenCalled();
  });
});

describe('EquiposService.actualizar', () => {
  it('cambia solo lo enviado y audita el valor anterior, en especial el cambio de estado', async () => {
    const prisma = prismaConEquipo();
    prisma.equipo.update.mockResolvedValue({ ...EQUIPO, estado: 'EN_MANTENIMIENTO', marca: 'Otra Marca' });
    prisma.movimientoFinanciero.findMany.mockResolvedValue([]);
    const usuario = usuarioDePrueba();

    await servicio(prisma).actualizar('e-1', { estado: 'EN_MANTENIMIENTO', marca: 'Otra Marca', nombre: 'Excavadora 320' }, usuario);

    expect(prisma.equipo.update.mock.calls[0][0].data).toEqual({ estado: 'EN_MANTENIMIENTO', marca: 'Otra Marca' });
    const registro = auditoriaDe(prisma.registroAuditoria.create, 'EQUIPO_EDITAR');
    expect(registro).toMatchObject({ antes: { estado: 'ACTIVO', marca: 'Marca de Prueba' }, despues: { estado: 'EN_MANTENIMIENTO', marca: 'Otra Marca' } });
    expect(registro.resumen).toMatch(/Activo → En mantenimiento/);
  });

  it('un texto vacío borra la marca y null borra el año', async () => {
    const prisma = prismaConEquipo();
    prisma.equipo.update.mockResolvedValue({ ...EQUIPO, marca: null, anio: null });
    await servicio(prisma).actualizar('e-1', { marca: '', anio: null }, usuarioDePrueba());
    expect(prisma.equipo.update.mock.calls[0][0].data).toEqual({ marca: null, anio: null });
  });

  it('sin cambios no escribe ni audita', async () => {
    const prisma = prismaConEquipo();
    await servicio(prisma).actualizar('e-1', { nombre: 'Excavadora 320', estado: 'ACTIVO' }, usuarioDePrueba());
    expect(prisma.equipo.update).not.toHaveBeenCalled();
    expect(auditoriasDe(prisma.registroAuditoria.create)).toEqual([]);
  });

  it('un equipo dado de baja no se edita', async () => {
    const prisma = prismaConEquipo({ ...EQUIPO, bajaEn: new Date(), bajaMotivo: 'Vendido' });
    await expect(servicio(prisma).actualizar('e-1', { nombre: 'Otro Nombre' }, usuarioDePrueba())).rejects.toThrow(/dado de baja/);
    expect(prisma.equipo.update).not.toHaveBeenCalled();
  });

  it('una placa que ya tiene otro equipo se rechaza', async () => {
    const prisma = prismaConEquipo();
    prisma.equipo.findFirst.mockResolvedValueOnce(EQUIPO).mockResolvedValueOnce({ id: 'otro', nombre: 'Volqueta 1' });
    await expect(servicio(prisma).actualizar('e-1', { placaSerie: 'XYZ999' }, usuarioDePrueba())).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.equipo.update).not.toHaveBeenCalled();
  });

  it('un equipo ajeno al alcance responde 404', async () => {
    const prisma = crearPrismaFalso();
    prisma.equipo.findFirst.mockResolvedValue(null);
    await expect(servicio(prisma).actualizar('e-x', { nombre: 'Otro Nombre' }, usuarioDePrueba(['p-2']))).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.equipo.findFirst.mock.calls[0][0].where.AND).toEqual([{ proyectoId: { in: ['p-2'] } }]);
  });
});

describe('EquiposService · baja y reactivación (RF-MAQ-07)', () => {
  it('dar de baja guarda fecha, motivo y quién, y lo audita', async () => {
    const prisma = prismaConEquipo();
    const usuario = usuarioDePrueba();

    await servicio(prisma).darDeBaja('e-1', { motivo: '  Vendido a un tercero  ' }, usuario);

    const { where, data } = prisma.equipo.updateMany.mock.calls[0][0];
    expect(where).toEqual({ id: 'e-1', bajaEn: null });
    expect(data).toMatchObject({ bajaMotivo: 'Vendido a un tercero', bajaPorId: usuario.id });
    expect(data.bajaEn).toBeInstanceOf(Date);
    expect(auditoriaDe(prisma.registroAuditoria.create, 'EQUIPO_BAJA')).toMatchObject({ entidadId: 'e-1', despues: { deBaja: true, motivo: 'Vendido a un tercero' } });
  });

  it('un equipo ya dado de baja no se da de baja otra vez, y no queda auditoría', async () => {
    const prisma = prismaConEquipo();
    prisma.equipo.updateMany.mockResolvedValue({ count: 0 });
    await expect(servicio(prisma).darDeBaja('e-1', { motivo: 'Vendido a un tercero' }, usuarioDePrueba())).rejects.toBeInstanceOf(ConflictException);
    expect(auditoriasDe(prisma.registroAuditoria.create)).toEqual([]);
  });

  it('reactivar borra la baja y deja en la auditoría el motivo anterior', async () => {
    const bajaEn = new Date(2026, 9, 1);
    const prisma = prismaConEquipo({ ...EQUIPO, bajaEn, bajaMotivo: 'Dado de baja por error' });

    await servicio(prisma).reactivar('e-1', usuarioDePrueba());

    expect(prisma.equipo.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'e-1', bajaEn: { not: null } }, data: { bajaEn: null, bajaMotivo: null, bajaPorId: null } });
    expect(auditoriaDe(prisma.registroAuditoria.create, 'EQUIPO_REACTIVAR')).toMatchObject({ antes: { deBaja: true, motivo: 'Dado de baja por error' }, despues: { deBaja: false } });
  });

  it('reactivar un equipo que no está dado de baja es un conflicto', async () => {
    const prisma = prismaConEquipo();
    prisma.equipo.updateMany.mockResolvedValue({ count: 0 });
    await expect(servicio(prisma).reactivar('e-1', usuarioDePrueba())).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('EquiposService.obtener y listar', () => {
  const movimiento = (id: string, tipo: 'INGRESO' | 'GASTO', valor: number, estado: 'ACTIVO' | 'ANULADO' = 'ACTIVO') => ({
    id,
    fecha: new Date(2026, 9, 1),
    tipo,
    valor: D(valor),
    estado,
    descripcion: id,
    terceroNombre: null,
    categoriaGasto: tipo === 'GASTO' ? { nombre: 'Combustible' } : null,
    categoriaIngreso: tipo === 'INGRESO' ? { nombre: 'Alquiler' } : null,
    periodoDesde: null,
    periodoHasta: null,
  });

  it('la ficha suma ingresos y egresos de los movimientos vigentes; los anulados se muestran pero no suman', async () => {
    const prisma = prismaConEquipo();
    prisma.movimientoFinanciero.findMany.mockResolvedValue([
      movimiento('a', 'INGRESO', 5_000_000),
      movimiento('b', 'GASTO', 1_200_000),
      movimiento('c', 'GASTO', 900_000, 'ANULADO'),
      movimiento('d', 'INGRESO', 2_000_000, 'ANULADO'),
    ]);

    const ficha = await servicio(prisma).obtener('e-1', usuarioDePrueba());

    expect(ficha.totales.ingresos.toString()).toBe('5000000');
    expect(ficha.totales.egresos.toString()).toBe('1200000');
    expect(ficha.totales.utilidad.toString()).toBe('3800000');
    expect(ficha.movimientos).toHaveLength(4);
    expect(ficha.deBaja).toBe(false);
  });

  it('un equipo dado de baja se marca como tal y su historial se conserva', async () => {
    const prisma = prismaConEquipo({ ...EQUIPO, bajaEn: new Date(), bajaMotivo: 'Vendido' });
    prisma.movimientoFinanciero.findMany.mockResolvedValue([movimiento('a', 'GASTO', 100_000)]);
    const ficha = await servicio(prisma).obtener('e-1', usuarioDePrueba());
    expect(ficha.deBaja).toBe(true);
    expect(ficha.movimientos).toHaveLength(1);
  });

  it('la lista oculta las bajas por defecto, las incluye si se pide, y respeta el alcance', async () => {
    const prisma = crearPrismaFalso();
    prisma.equipo.findMany.mockResolvedValue([EQUIPO]);
    await servicio(prisma).listar({}, usuarioDePrueba(['p-1']));
    expect(prisma.equipo.findMany.mock.calls[0][0].where).toMatchObject({ bajaEn: null, AND: [{ proyectoId: { in: ['p-1'] } }] });
    await servicio(prisma).listar({ incluirBajas: 'true', proyectoId: 'p-1' }, usuarioDePrueba());
    const { where } = prisma.equipo.findMany.mock.calls[1][0];
    expect(where).not.toHaveProperty('bajaEn');
    expect(where.proyectoId).toBe('p-1');
  });
});
