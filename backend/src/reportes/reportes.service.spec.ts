import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import { ReportesService } from './reportes.service.js';

const D = (valor: number) => new Prisma.Decimal(valor);
const EMPRESA = { nombreComercial: 'Empresa de Prueba', razonSocial: 'Empresa de Prueba SAS', nit: '900000000', logoRuta: null, colorPrimario: '#1e3a8a', tasaMoraMensual: null, diasGraciaMora: 0 };
const UUID_PROYECTO = '11111111-1111-4111-8111-111111111111';

const GERENTE = { ...usuarioDePrueba(), permisos: ['reportes.ver', 'finanzas.ver', 'comisiones.ver'] };
const SOCIO = { ...usuarioDePrueba([UUID_PROYECTO]), permisos: ['reportes.ver', 'finanzas.ver'] };

function crearPrismaFalso() {
  return {
    proyecto: { findMany: vi.fn().mockResolvedValue([{ id: UUID_PROYECTO, nombre: 'Proyecto Uno' }]), findUnique: vi.fn().mockResolvedValue({ nombre: 'Proyecto Uno' }) },
    cuentaBancaria: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue({ alias: 'Bancolombia ahorros' }) },
    usuario: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue({ nombre: 'Ana Admin' }) },
    categoriaGasto: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue({ nombre: 'Materiales' }) },
    abono: { findMany: vi.fn().mockResolvedValue([]) },
    venta: { findMany: vi.fn().mockResolvedValue([]) },
    movimientoFinanciero: { findMany: vi.fn().mockResolvedValue([]) },
    pagoNomina: { findMany: vi.fn().mockResolvedValue([]) },
    lote: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

describe('ReportesService', () => {
  let prisma: ReturnType<typeof crearPrismaFalso>;
  let service: ReportesService;

  beforeEach(() => {
    prisma = crearPrismaFalso();
    const configuracion = { obtenerEmpresa: vi.fn().mockResolvedValue(EMPRESA) };
    const storage = { leer: vi.fn() };
    service = new ReportesService(prisma as unknown as PrismaService, configuracion as unknown as ConfiguracionService, storage as unknown as StorageService);
  });

  describe('catalogo', () => {
    it('ofrece los reportes con las opciones de los filtros a quien tiene alcance total', async () => {
      prisma.cuentaBancaria.findMany.mockResolvedValue([{ id: 'c1', alias: 'Bancolombia ahorros', banco: 'Bancolombia' }]);
      const catalogo = await service.catalogo(GERENTE);
      expect(catalogo.reportes.map((r) => r.clave)).toEqual(['recaudo', 'cartera-edades', 'egresos', 'inventario-lotes', 'flujo-caja']);
      expect(catalogo.opciones.cuentas).toHaveLength(1);
      expect(catalogo.opciones.mediosPago.map((m) => m.valor)).toContain('TRANSFERENCIA');
    });

    it('a quien está limitado a proyectos no le ofrece las cuentas, los usuarios ni las categorías de la empresa', async () => {
      const catalogo = await service.catalogo(SOCIO);
      expect(catalogo.opciones.cuentas).toEqual([]);
      expect(catalogo.opciones.usuarios).toEqual([]);
      expect(prisma.cuentaBancaria.findMany).not.toHaveBeenCalled();
      expect(prisma.proyecto.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: [UUID_PROYECTO] } } }));
    });

    it('el flujo de caja exige además el permiso de finanzas', async () => {
      const sinFinanzas = { ...usuarioDePrueba(), permisos: ['reportes.ver'] };
      expect((await service.catalogo(sinFinanzas)).reportes.map((r) => r.clave)).not.toContain('flujo-caja');
    });
  });

  describe('generar', () => {
    it('un reporte que no existe responde 404 y uno sin permiso, 403', async () => {
      await expect(service.generar('no-existe', {}, GERENTE)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.generar('flujo-caja', { desde: '2026-10-01', hasta: '2026-10-31' }, { ...usuarioDePrueba(), permisos: ['reportes.ver'] })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('pedir un proyecto fuera del alcance responde 404', async () => {
      await expect(service.generar('recaudo', { proyectoId: '22222222-2222-4222-8222-222222222222' }, SOCIO)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('un rango de fechas al revés se rechaza', async () => {
      await expect(service.generar('recaudo', { desde: '2026-10-31', hasta: '2026-10-01' }, GERENTE)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('el recaudo consulta solo abonos vigentes, dentro del alcance, y arma el reporte con sus filtros en palabras', async () => {
      prisma.abono.findMany.mockResolvedValue([
        {
          fecha: new Date(2026, 9, 5),
          valor: D(1_000_000),
          medioPago: 'TRANSFERENCIA',
          referencia: 'T-1',
          recibo: { numeroTexto: 'RC-000001' },
          cuentaDestino: { alias: 'Bancolombia ahorros' },
          registradoPor: { nombre: 'Ana Admin' },
          venta: { cliente: { nombre: 'Cliente Inventado' }, lote: { numero: '3', manzana: { nombre: 'A' }, proyecto: { nombre: 'Proyecto Uno' } } },
        },
      ]);
      const reporte = await service.generar('recaudo', { desde: '2026-10-01', hasta: '2026-10-31', proyectoId: UUID_PROYECTO, medioPago: 'TRANSFERENCIA' }, SOCIO);

      const { where } = prisma.abono.findMany.mock.calls[0][0];
      expect(where).toMatchObject({ estado: 'ACTIVO', medioPago: 'TRANSFERENCIA' });
      expect(JSON.stringify(where)).toContain(`"proyectoId":"${UUID_PROYECTO}"`);
      expect(JSON.stringify(where)).toContain('"proyectoId":{"in":');
      expect(reporte.filtros).toEqual([
        { etiqueta: 'Período', valor: '01/10/2026 a 31/10/2026' },
        { etiqueta: 'Proyecto', valor: 'Proyecto Uno' },
        { etiqueta: 'Medio de pago', valor: 'Transferencia' },
      ]);
      expect(reporte.secciones.find((s) => s.titulo === 'Detalle de abonos')?.filas[0]).toMatchObject({ recibo: 'RC-000001', lote: 'A-3', valor: '1000000' });
    });

    it('los egresos suman la nómina como categoría Nómina, pero no cuando se limita a un proyecto o se tiene alcance restringido', async () => {
      prisma.movimientoFinanciero.findMany.mockResolvedValue([{ valor: D(500_000), categoriaGasto: { nombre: 'Materiales' }, proyecto: { nombre: 'Proyecto Uno' } }]);
      prisma.pagoNomina.findMany.mockResolvedValue([{ fechaPago: new Date(2026, 9, 5), valorPagado: D(2_000_000) }]);

      const total = await service.generar('egresos', {}, GERENTE);
      expect(total.secciones[0].totales).toMatchObject({ total: '2500000' });

      prisma.pagoNomina.findMany.mockClear();
      await service.generar('egresos', { proyectoId: UUID_PROYECTO }, GERENTE);
      await service.generar('egresos', {}, SOCIO);
      expect(prisma.pagoNomina.findMany).not.toHaveBeenCalled();
    });

    it('el flujo de caja exige las fechas y trae todo lo anterior al rango para el saldo inicial', async () => {
      await expect(service.generar('flujo-caja', {}, GERENTE)).rejects.toBeInstanceOf(BadRequestException);

      prisma.abono.findMany.mockResolvedValue([{ fecha: new Date(2026, 8, 20), valor: D(10_000_000) }]);
      prisma.movimientoFinanciero.findMany.mockResolvedValue([{ fecha: new Date(2026, 9, 3), valor: D(1_000_000), tipo: 'GASTO' }]);
      const reporte = await service.generar('flujo-caja', { desde: '2026-10-01', hasta: '2026-10-31', granularidad: 'MES' }, GERENTE);

      expect(JSON.stringify(prisma.abono.findMany.mock.calls[0][0].where.fecha)).not.toContain('gte');
      expect(reporte.secciones[0].filas).toEqual([{ periodo: '01/10/2026 – 31/10/2026', ventas: '0', otros: '0', egresos: '1000000', neto: '-1000000', saldo: '9000000' }]);
    });

    it('el inventario cuenta todos los lotes del alcance y el detalle sigue el estado pedido', async () => {
      prisma.lote.findMany.mockResolvedValue([
        { numero: '1', area: D(100), valorVenta: D(50_000_000), estado: 'DISPONIBLE', manzana: { nombre: 'A' }, proyecto: { nombre: 'Proyecto Uno' } },
        { numero: '2', area: D(100), valorVenta: D(50_000_000), estado: 'VENDIDO', manzana: null, proyecto: { nombre: 'Proyecto Uno' } },
      ]);
      const reporte = await service.generar('inventario-lotes', { estadoLote: 'VENDIDO' }, SOCIO);
      expect(reporte.secciones[0].totales).toMatchObject({ total: 2 });
      expect(reporte.secciones[2].filas).toHaveLength(1);
      expect(JSON.stringify(prisma.lote.findMany.mock.calls[0][0].where)).toContain('"proyectoId":{"in":');
    });
  });

  describe('exportar', () => {
    it('entrega un PDF con su nombre de archivo', async () => {
      const { buffer, contentType, nombreArchivo } = await service.exportar('inventario-lotes', { formato: 'pdf' }, GERENTE);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      expect(contentType).toBe('application/pdf');
      expect(nombreArchivo).toBe('inventario-lotes.pdf');
    });

    it('entrega un Excel con el rango en el nombre del archivo', async () => {
      const { buffer, contentType, nombreArchivo } = await service.exportar('recaudo', { formato: 'excel', desde: '2026-10-01', hasta: '2026-10-31' }, GERENTE);
      expect(buffer.subarray(0, 2).toString('ascii')).toBe('PK');
      expect(contentType).toContain('spreadsheetml');
      expect(nombreArchivo).toBe('recaudo-2026-10-01-a-2026-10-31.xlsx');
    });
  });
});
