import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoLote, EstadoProyecto, TipoEventoLote, TipoProyecto } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import { LotesService } from './lotes.service.js';

const USUARIO = usuarioDePrueba();
const D = (valor: string) => new Prisma.Decimal(valor);

const PROYECTO = {
  id: 'p-1',
  nombre: 'Proyecto Test',
  tipo: TipoProyecto.LOTES,
  estado: EstadoProyecto.ACTIVO,
  areaTotal: D('10000'),
};

const DTO = { proyectoId: 'p-1', numero: 'L-1', area: '500', valorVenta: '80000000' };

function crearPrismaFalso() {
  const prisma = {
    proyecto: { findUnique: vi.fn() },
    manzana: { findFirst: vi.fn() },
    lote: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      aggregate: vi.fn().mockResolvedValue({ _sum: { area: null } }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    loteHistorial: { create: vi.fn() },
    separacion: { create: vi.fn(), updateMany: vi.fn() },
    cliente: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation((accion: (tx: typeof prisma) => unknown) => accion(prisma));
  return prisma;
}

describe('LotesService.crear', () => {
  let prisma: ReturnType<typeof crearPrismaFalso>;
  let service: LotesService;

  beforeEach(() => {
    prisma = crearPrismaFalso();
    service = new LotesService(prisma as unknown as PrismaService);
    prisma.proyecto.findUnique.mockResolvedValue(PROYECTO);
    prisma.lote.findFirst.mockResolvedValue(null);
    prisma.lote.create.mockResolvedValue({ id: 'lote-nuevo', estado: EstadoLote.DISPONIBLE, valorVenta: D('80000000') });
  });

  it('rechaza si el proyecto no existe', async () => {
    prisma.proyecto.findUnique.mockResolvedValue(null);
    await expect(service.crear(DTO, USUARIO)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rechaza lotes en un proyecto que no es de venta de lotes (remodelación o maquinaria)', async () => {
    prisma.proyecto.findUnique.mockResolvedValue({ ...PROYECTO, tipo: TipoProyecto.REMODELACION });
    await expect(service.crear(DTO, USUARIO)).rejects.toThrow(/no es de venta de lotes/);
    expect(prisma.lote.create).not.toHaveBeenCalled();
  });

  it('rechaza agregar un lote a un proyecto ya finalizado', async () => {
    prisma.proyecto.findUnique.mockResolvedValue({ ...PROYECTO, estado: EstadoProyecto.FINALIZADO });
    await expect(service.crear(DTO, USUARIO)).rejects.toThrow(/finalizado/);
  });

  it('rechaza una manzana que no es de ese proyecto', async () => {
    prisma.manzana.findFirst.mockResolvedValue(null);
    await expect(service.crear({ ...DTO, manzanaId: 'm-ajena' }, USUARIO)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.manzana.findFirst).toHaveBeenCalledWith({ where: { id: 'm-ajena', proyectoId: 'p-1' } });
  });

  it('el número no se repite dentro de la misma manzana, pero sí puede repetirse en otra manzana', async () => {
    prisma.manzana.findFirst.mockResolvedValue({ id: 'm-A' });
    prisma.lote.findFirst.mockResolvedValue({ id: 'existente' });
    await expect(service.crear({ ...DTO, manzanaId: 'm-A' }, USUARIO)).rejects.toThrow(/Esa manzana ya tiene/);
    expect(prisma.lote.findFirst).toHaveBeenCalledWith({ where: { proyectoId: 'p-1', manzanaId: 'm-A', numero: 'L-1' } });

    // Mismo número en otra manzana: la búsqueda va filtrada por manzana, así que no choca.
    prisma.lote.findFirst.mockResolvedValue(null);
    prisma.manzana.findFirst.mockResolvedValue({ id: 'm-B' });
    await expect(service.crear({ ...DTO, manzanaId: 'm-B' }, USUARIO)).resolves.toBeDefined();
  });

  it('en un proyecto sin manzanas el número no se repite dentro del proyecto', async () => {
    prisma.lote.findFirst.mockResolvedValue({ id: 'existente' });
    await expect(service.crear(DTO, USUARIO)).rejects.toThrow(/El proyecto ya tiene un lote/);
    expect(prisma.lote.findFirst).toHaveBeenCalledWith({ where: { proyectoId: 'p-1', manzanaId: null, numero: 'L-1' } });
  });

  it('crea el lote y deja el primer registro del historial', async () => {
    await service.crear({ ...DTO, linderos: 'Norte: vía', valorPorM2: '160000' }, USUARIO);

    expect(prisma.lote.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ proyectoId: 'p-1', manzanaId: null, numero: 'L-1', linderos: 'Norte: vía', valorPorM2: '160000' }),
    });
    expect(prisma.loteHistorial.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tipo: TipoEventoLote.CREACION, usuarioId: USUARIO.id }),
    });
  });

  it('avisa (409 con código) si el lote supera el área disponible, y lo crea si se confirma', async () => {
    prisma.lote.aggregate.mockResolvedValue({ _sum: { area: D('9800') } }); // quedan 200 m²

    const error = await service.crear(DTO, USUARIO).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ codigo: 'AREA_EXCEDIDA', areaDisponible: '200' });
    expect(prisma.lote.create).not.toHaveBeenCalled();

    await expect(service.crear({ ...DTO, confirmarExcesoArea: true }, USUARIO)).resolves.toBeDefined();
  });

  it('un lote que cabe exactamente en el área disponible no genera aviso', async () => {
    prisma.lote.aggregate.mockResolvedValue({ _sum: { area: D('9500') } }); // quedan 500 m²
    await expect(service.crear(DTO, USUARIO)).resolves.toBeDefined();
  });

  it('si la base de datos detecta un número repetido (dos personas a la vez), responde conflicto', async () => {
    prisma.lote.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint', { code: 'P2002', clientVersion: 'test' }),
    );
    await expect(service.crear(DTO, USUARIO)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('LotesService.actualizar (precio y área)', () => {
  let prisma: ReturnType<typeof crearPrismaFalso>;
  let service: LotesService;
  const LOTE = {
    id: 'lote-1',
    numero: 'L-1',
    estado: EstadoLote.DISPONIBLE,
    area: D('500'),
    valorVenta: D('80000000'),
    proyecto: PROYECTO,
  };

  beforeEach(() => {
    prisma = crearPrismaFalso();
    service = new LotesService(prisma as unknown as PrismaService);
    prisma.lote.findFirst.mockResolvedValue(LOTE);
    prisma.lote.update.mockResolvedValue({ ...LOTE, valorVenta: D('90000000') });
  });

  it('un cambio de precio deja el valor anterior, el nuevo, el motivo y el usuario en el historial', async () => {
    await service.actualizar('lote-1', { valorVenta: '90000000', motivo: 'Ajuste de lista' }, USUARIO);

    expect(prisma.loteHistorial.create).toHaveBeenCalledWith({
      data: {
        loteId: 'lote-1',
        tipo: TipoEventoLote.CAMBIO_PRECIO,
        valorAnterior: LOTE.valorVenta,
        valorNuevo: D('90000000'),
        motivo: 'Ajuste de lista',
        usuarioId: USUARIO.id,
      },
    });
  });

  it('si el precio no cambia (mismo valor), no se registra un evento de precio', async () => {
    prisma.lote.update.mockResolvedValue(LOTE);
    await service.actualizar('lote-1', { valorVenta: '80000000.00', linderos: 'Nuevo texto' }, USUARIO);
    expect(prisma.loteHistorial.create).not.toHaveBeenCalled();
  });

  it.each([EstadoLote.VENDIDO, EstadoLote.ESCRITURADO])('un lote %s ya no admite cambiar precio ni área', async (estado) => {
    prisma.lote.findFirst.mockResolvedValue({ ...LOTE, estado });
    await expect(service.actualizar('lote-1', { valorVenta: '90000000' }, USUARIO)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.actualizar('lote-1', { area: '600' }, USUARIO)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.lote.update).not.toHaveBeenCalled();
  });

  it('un lote vendido sí admite corregir los linderos', async () => {
    prisma.lote.findFirst.mockResolvedValue({ ...LOTE, estado: EstadoLote.VENDIDO });
    await expect(service.actualizar('lote-1', { linderos: 'Texto corregido' }, USUARIO)).resolves.toBeDefined();
  });

  it('agrandar un lote más allá del área disponible pide confirmación', async () => {
    prisma.lote.aggregate.mockResolvedValue({ _sum: { area: D('9600') } }); // sin contar este lote; quedan 400
    await expect(service.actualizar('lote-1', { area: '500' }, USUARIO)).resolves.toBeDefined(); // no cambia el área
    await expect(service.actualizar('lote-1', { area: '700' }, USUARIO)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.lote.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { not: 'lote-1' } }) }),
    );
  });
});

describe('LotesService: acciones de estado', () => {
  let prisma: ReturnType<typeof crearPrismaFalso>;
  let service: LotesService;

  beforeEach(() => {
    prisma = crearPrismaFalso();
    service = new LotesService(prisma as unknown as PrismaService);
    prisma.lote.findUniqueOrThrow.mockResolvedValue({ id: 'lote-1' });
  });

  it('separar un lote disponible lo pasa a SEPARADO con historial', async () => {
    prisma.lote.findFirst.mockResolvedValue({ id: 'lote-1', numero: 'L-1', estado: EstadoLote.DISPONIBLE, proyecto: PROYECTO });

    await service.separar('lote-1', { motivo: 'Cliente interesado' }, USUARIO);

    expect(prisma.lote.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { estado: EstadoLote.SEPARADO } }),
    );
    expect(prisma.loteHistorial.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ estadoAnterior: 'DISPONIBLE', estadoNuevo: 'SEPARADO', motivo: 'Cliente interesado', usuarioId: USUARIO.id }),
    });
  });

  describe('separación (RF-VEN-01)', () => {
    const DISPONIBLE = { id: 'lote-1', numero: 'L-1', estado: EstadoLote.DISPONIBLE, proyecto: PROYECTO };

    beforeEach(() => {
      prisma.lote.findFirst.mockResolvedValue(DISPONIBLE);
    });

    it('registra quién separa, cuánto dejó y hasta cuándo, además del cambio de estado', async () => {
      const manana = new Date();
      manana.setDate(manana.getDate() + 1);
      const fecha = `${manana.getFullYear()}-${String(manana.getMonth() + 1).padStart(2, '0')}-${String(manana.getDate()).padStart(2, '0')}`;

      await service.separar(
        'lote-1',
        { nombreInteresado: '  Ana Pérez  ', telefonoInteresado: '3000000000', valor: '5000000', fechaLimite: fecha, motivo: 'Dejó una consignación' },
        USUARIO,
      );

      expect(prisma.lote.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { estado: EstadoLote.SEPARADO } }));
      const { data } = prisma.separacion.create.mock.calls[0][0];
      expect(data).toMatchObject({
        loteId: 'lote-1',
        nombreInteresado: 'Ana Pérez',
        telefonoInteresado: '3000000000',
        valor: '5000000',
        registradaPorId: USUARIO.id,
      });
      expect(data.fechaLimite).toBeInstanceOf(Date);
    });

    it('una separación sin datos extra también es válida (valor y fecha límite son opcionales)', async () => {
      await service.separar('lote-1', {}, USUARIO);
      expect(prisma.separacion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ loteId: 'lote-1', valor: undefined, fechaLimite: null }) });
    });

    it('si hay un valor debe saberse de quién es', async () => {
      await expect(service.separar('lote-1', { valor: '1000000' }, USUARIO)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.lote.updateMany).not.toHaveBeenCalled();
    });

    it('indica un cliente registrado o un nombre, no ambos', async () => {
      await expect(service.separar('lote-1', { clienteId: 'c-1', nombreInteresado: 'Ana' }, USUARIO)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('un cliente que no existe (o fuera del alcance) responde 404', async () => {
      prisma.cliente.findFirst.mockResolvedValue(null);
      await expect(service.separar('lote-1', { clienteId: 'c-x' }, USUARIO)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rechaza una fecha límite en el pasado', async () => {
      await expect(service.separar('lote-1', { fechaLimite: '2020-01-01' }, USUARIO)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('un lote que no está disponible no se puede separar y no deja registro de separación', async () => {
      prisma.lote.findFirst.mockResolvedValue({ ...DISPONIBLE, estado: EstadoLote.VENDIDO });
      await expect(service.separar('lote-1', {}, USUARIO)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.separacion.create).not.toHaveBeenCalled();
    });

    it('liberar la separación cierra el registro (queda LIBERADA, no se borra)', async () => {
      prisma.lote.findFirst.mockResolvedValue({ ...DISPONIBLE, estado: EstadoLote.SEPARADO });

      await service.liberar('lote-1', { motivo: 'El cliente se arrepintió' }, USUARIO);

      expect(prisma.lote.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { estado: EstadoLote.DISPONIBLE } }));
      expect(prisma.separacion.updateMany).toHaveBeenCalledWith({ where: { loteId: 'lote-1', estado: 'ACTIVA' }, data: { estado: 'LIBERADA' } });
    });
  });

  it('no se puede separar un lote vendido ni escriturar uno disponible', async () => {
    prisma.lote.findFirst.mockResolvedValue({ id: 'lote-1', numero: 'L-1', estado: EstadoLote.VENDIDO, proyecto: PROYECTO });
    await expect(service.separar('lote-1', {}, USUARIO)).rejects.toBeInstanceOf(ConflictException);

    prisma.lote.findFirst.mockResolvedValue({ id: 'lote-1', numero: 'L-1', estado: EstadoLote.DISPONIBLE, proyecto: PROYECTO });
    await expect(service.escriturar('lote-1', { numero: '1', fecha: '2026-10-01' }, USUARIO)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.lote.updateMany).not.toHaveBeenCalled();
  });

  it('escriturar guarda número, notaría y fecha de la escritura', async () => {
    prisma.lote.findFirst.mockResolvedValue({ id: 'lote-1', numero: 'L-1', estado: EstadoLote.VENDIDO, proyecto: PROYECTO });

    await service.escriturar('lote-1', { numero: '1234', notaria: 'Notaría 2', fecha: '2026-10-01' }, USUARIO);

    const { data } = prisma.lote.updateMany.mock.calls[0][0];
    expect(data).toMatchObject({ estado: EstadoLote.ESCRITURADO, escrituraNumero: '1234', escrituraNotaria: 'Notaría 2' });
    expect(data.escrituraFecha).toBeInstanceOf(Date);
  });

  it('reponer devuelve un lote desistido a DISPONIBLE y deja el motivo', async () => {
    prisma.lote.findFirst.mockResolvedValue({ id: 'lote-1', numero: 'L-1', estado: EstadoLote.DESISTIDO, proyecto: PROYECTO });

    await service.reponer('lote-1', { motivo: 'Se devolvió el dinero' }, USUARIO);

    expect(prisma.loteHistorial.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ estadoAnterior: 'DESISTIDO', estadoNuevo: 'DISPONIBLE', motivo: 'Se devolvió el dinero' }),
    });
  });

  it('un lote que no existe (o es de otro proyecto del alcance) responde 404', async () => {
    prisma.lote.findFirst.mockResolvedValue(null);
    await expect(service.separar('x', {}, USUARIO)).rejects.toBeInstanceOf(NotFoundException);
  });
});
