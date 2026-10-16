// Pruebas de RNF-SEG-04: un usuario limitado a un proyecto no puede ver ni tocar
// datos de otros proyectos por ningún camino. Cada prueba usa a "el socio de La
// Floresta" (alcance = ['p-floresta']) y revisa que cada consulta lleve el filtro
// de alcance, o que la acción se rechace antes de tocar la base de datos.
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AbonosService } from './abonos/abonos.service.js';
import type { ConfiguracionService } from './configuracion/configuracion.service.js';
import { CarteraService } from './cartera/cartera.service.js';
import { ClientesService } from './clientes/clientes.service.js';
import { FinanzasService } from './finanzas/finanzas.service.js';
import { LotesService } from './lotes/lotes.service.js';
import type { PrismaService } from './prisma/prisma.service.js';
import { ProyectosService } from './proyectos/proyectos.service.js';
import type { StorageService } from './storage/storage.service.js';
import { usuarioDePrueba } from './test-utils/usuario-prueba.js';
import { VentasService } from './ventas/ventas.service.js';

const SOCIO = usuarioDePrueba(['p-floresta']);
const TOTAL = usuarioDePrueba();
const ALCANCE_PROYECTO = { id: { in: ['p-floresta'] } };
const ALCANCE_VENTA = { lote: { proyectoId: { in: ['p-floresta'] } } };

// Tablas falsas: cada método devuelve vacío/nulo y los registramos para revisar con qué filtro se llamó.
function crearPrismaFalso() {
  const tabla = () => ({
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  });
  const prisma = {
    proyecto: tabla(),
    lote: tabla(),
    cliente: tabla(),
    venta: tabla(),
    abono: tabla(),
    movimientoFinanciero: tabla(),
    pagoNomina: tabla(),
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation((accion: (tx: typeof prisma) => unknown) => accion(prisma));
  return prisma;
}

describe('alcance por proyecto en los servicios', () => {
  let prisma: ReturnType<typeof crearPrismaFalso>;
  const p = () => prisma as unknown as PrismaService;

  beforeEach(() => {
    prisma = crearPrismaFalso();
  });

  describe('proyectos', () => {
    it('lista solo los proyectos del alcance', async () => {
      await new ProyectosService(p()).listar(SOCIO);
      expect(prisma.proyecto.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: ALCANCE_PROYECTO }));
    });

    it('el detalle de un proyecto ajeno responde 404', async () => {
      await expect(new ProyectosService(p()).buscarPorId('p-arboleda', SOCIO)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.proyecto.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'p-arboleda', AND: [ALCANCE_PROYECTO] } }),
      );
    });

    it('no puede crear proyectos ni cambiar el estado de uno ajeno', async () => {
      const servicio = new ProyectosService(p());
      expect(() => servicio.crear({ nombre: 'Nuevo', areaTotal: '1000' }, SOCIO)).toThrow(ForbiddenException);
      await expect(servicio.actualizarEstado('p-arboleda', { estado: 'FINALIZADO' }, SOCIO)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.proyecto.update).not.toHaveBeenCalled();
    });
  });

  describe('lotes', () => {
    it('la lista se combina con el alcance: pedir un proyecto ajeno no devuelve lotes', async () => {
      await new LotesService(p()).listar({ proyectoId: 'p-arboleda' }, SOCIO);
      expect(prisma.lote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ proyectoId: 'p-arboleda', AND: [{ proyectoId: { in: ['p-floresta'] } }] }),
        }),
      );
    });

    it('un lote ajeno responde 404 y no se puede crear un lote en un proyecto ajeno', async () => {
      const servicio = new LotesService(p());
      await expect(servicio.buscarPorId('lote-x', SOCIO)).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        servicio.crear({ proyectoId: 'p-arboleda', numero: 'L-1', area: '100', valorVenta: '1000' }, SOCIO),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.proyecto.findUnique).not.toHaveBeenCalled();
      expect(prisma.lote.create).not.toHaveBeenCalled();
    });
  });

  describe('clientes', () => {
    it('solo se ven los clientes con ventas en el alcance, y no se pueden crear clientes sueltos', async () => {
      const servicio = new ClientesService(p());
      await servicio.listar(SOCIO);
      expect(prisma.cliente.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { ventas: { some: ALCANCE_VENTA } } }),
      );
      await expect(servicio.buscarPorId('cliente-x', SOCIO)).rejects.toBeInstanceOf(NotFoundException);
      await expect(servicio.crear({ nombre: 'Ana', documento: '1' }, SOCIO)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('ventas', () => {
    it('lista y detalle limitados al alcance; una venta ajena responde 404', async () => {
      const servicio = new VentasService(p());
      await servicio.listar(SOCIO);
      expect(prisma.venta.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: ALCANCE_VENTA }));
      await expect(servicio.buscarPorId('venta-x', SOCIO)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.venta.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'venta-x', ...ALCANCE_VENTA } }),
      );
    });

    it('no se puede vender un lote de otro proyecto', async () => {
      prisma.lote.findUnique.mockResolvedValue({ id: 'lote-1', proyectoId: 'p-arboleda', estado: 'DISPONIBLE', numero: '1' });

      await expect(
        new VentasService(p()).crear(
          { loteId: 'lote-1', clienteId: 'c-1', formaPago: 'CONTADO', valorTotal: '100', cuotaInicial: '100' } as never,
          SOCIO,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.venta.create).not.toHaveBeenCalled();
    });
  });

  describe('abonos y comprobantes', () => {
    function crearAbonos() {
      const configuracion = { exigirMedioPagoActivo: vi.fn() } as unknown as ConfiguracionService;
      return new AbonosService(p(), { guardar: vi.fn(), leer: vi.fn() } as unknown as StorageService, configuracion);
    }

    it('no se pueden ver los abonos de una venta ajena', async () => {
      await expect(crearAbonos().listarPorVenta('venta-x', SOCIO)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.venta.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'venta-x', ...ALCANCE_VENTA } }),
      );
      expect(prisma.abono.findMany).not.toHaveBeenCalled();
    });

    it('el comprobante de un abono ajeno responde 404 sin leer el archivo (RNF-SEG-05)', async () => {
      await expect(crearAbonos().obtenerComprobante('abono-x', SOCIO)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.abono.findFirst).toHaveBeenCalledWith({ where: { id: 'abono-x', venta: ALCANCE_VENTA } });
    });

    it('no se puede registrar un abono en una venta ajena', async () => {
      await expect(
        crearAbonos().crear({ ventaId: 'venta-x', fecha: '2026-01-01', valor: '100', medioPago: 'EFECTIVO' } as never, SOCIO),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('cartera', () => {
    function crearCartera() {
      const configuracion = {
        obtenerEmpresa: vi.fn().mockResolvedValue({ tasaMoraMensual: null, diasGraciaMora: 0, diasSemaforoAmarillo: 5 }),
      } as unknown as ConfiguracionService;
      return new CarteraService(p(), configuracion);
    }

    it('por cliente: solo clientes y ventas del alcance (un cliente con ventas en otro proyecto no las muestra)', async () => {
      await crearCartera().listarPorCliente(SOCIO);
      expect(prisma.cliente.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ventas: { some: ALCANCE_VENTA } },
          include: expect.objectContaining({
            ventas: expect.objectContaining({ where: expect.objectContaining(ALCANCE_VENTA) }),
          }),
        }),
      );
    });

    it('por proyecto: solo los proyectos del alcance', async () => {
      await crearCartera().reportePorProyecto(SOCIO);
      expect(prisma.proyecto.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: ALCANCE_PROYECTO }));
    });
  });

  describe('finanzas', () => {
    it('lista solo movimientos de sus proyectos', async () => {
      await new FinanzasService(p()).listar({}, SOCIO);
      expect(prisma.movimientoFinanciero.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ AND: [{ proyectoId: { in: ['p-floresta'] } }] }) }),
      );
    });

    it('no puede registrar movimientos generales ni de un proyecto ajeno', () => {
      const servicio = new FinanzasService(p());
      const base = { tipo: 'GASTO', fecha: '2026-01-01', valor: '100', concepto: 'x' } as const;
      expect(() => servicio.crear({ ...base }, SOCIO)).toThrow(ForbiddenException);
      expect(() => servicio.crear({ ...base, proyectoId: 'p-arboleda' }, SOCIO)).toThrow(NotFoundException);
      expect(prisma.movimientoFinanciero.create).not.toHaveBeenCalled();
    });

    it('el consolidado no incluye la nómina (no es de ningún proyecto) y filtra todo por alcance', async () => {
      await new FinanzasService(p()).consolidado({}, SOCIO);

      expect(prisma.pagoNomina.findMany).not.toHaveBeenCalled();
      expect(prisma.movimientoFinanciero.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ proyectoId: { in: ['p-floresta'] } }),
      });
      expect(prisma.venta.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining(ALCANCE_VENTA) }),
      );
      expect(prisma.proyecto.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: ALCANCE_PROYECTO }));
    });

    it('con alcance total el consolidado sí incluye la nómina y no filtra nada', async () => {
      await new FinanzasService(p()).consolidado({}, TOTAL);

      expect(prisma.pagoNomina.findMany).toHaveBeenCalled();
      expect(prisma.proyecto.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    });
  });
});
