import { describe, expect, it, vi } from 'vitest';
import type { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import { CarteraService } from './cartera.service.js';

const D = (valor: number) => new Prisma.Decimal(valor);
const dentroDe = (dias: number) => new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + dias);

function servicio(cuotas: object[]) {
  const prisma = { proyecto: { findMany: vi.fn().mockResolvedValue([{ id: 'p1', nombre: 'Proyecto Uno', lotes: [{ ventas: [{ cuotas, acuerdosPago: [] }] }] }]) } };
  const configuracion = { obtenerEmpresa: vi.fn().mockResolvedValue({ tasaMoraMensual: null, diasGraciaMora: 0, diasSemaforoAmarillo: 5 }) };
  return new CarteraService(prisma as unknown as PrismaService, configuracion as unknown as ConfiguracionService);
}

const cuota = (dias: number, valor: number, estado = 'PENDIENTE') => ({ estado, fechaVencimiento: dentroDe(dias), valor: D(valor), aplicaciones: [] });

describe('CarteraService.reportePorProyecto', () => {
  it('separa lo vencido de lo por vencer y, dentro de lo por vencer, lo que vence en los próximos días del semáforo', async () => {
    const reporte = await servicio([cuota(-10, 1_000_000), cuota(3, 2_000_000), cuota(30, 3_000_000), cuota(-60, 500_000, 'PAGADA')]).reportePorProyecto(usuarioDePrueba());

    expect(reporte.diasAlerta).toBe(5);
    expect(reporte.consolidado.saldoVencido.toString()).toBe('1000000');
    expect(reporte.consolidado.saldoPorVencer.toString()).toBe('5000000');
    expect(reporte.consolidado.saldoProximoAVencer.toString()).toBe('2000000');
    expect(reporte.porProyecto[0]).toMatchObject({ nombre: 'Proyecto Uno' });
    expect(reporte.porProyecto[0].saldoProximoAVencer.toString()).toBe('2000000');
  });

  it('una cuota que vence hoy cuenta como próxima a vencer, y una que vence justo después de la ventana, no', async () => {
    const reporte = await servicio([cuota(0, 100_000), cuota(5, 200_000), cuota(6, 400_000)]).reportePorProyecto(usuarioDePrueba());
    expect(reporte.consolidado.saldoProximoAVencer.toString()).toBe('300000');
    expect(reporte.consolidado.saldoPorVencer.toString()).toBe('700000');
  });

  it('sin cuotas pendientes todo es cero', async () => {
    const reporte = await servicio([]).reportePorProyecto(usuarioDePrueba());
    expect(reporte.consolidado.saldoVencido.toString()).toBe('0');
    expect(reporte.consolidado.saldoProximoAVencer.toString()).toBe('0');
  });
});

describe('CarteraService.listarPorCliente', () => {
  it('marca por venta si está en mora, para elegir entre aviso de mora y recordatorio', async () => {
    const venta = (id: string, cuotas: object[], acuerdosPago: object[] = []) => ({ id, cuotas, acuerdosPago, lote: { numero: `L-${id}`, proyecto: { nombre: 'Proyecto Uno' } } });
    const prisma = {
      cliente: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'c1', nombre: 'Ana', documento: '1', ventas: [venta('v-mora', [cuota(-10, 1_000_000), cuota(20, 1_000_000)]), venta('v-dia', [cuota(20, 1_000_000)])] },
        ]),
      },
    };
    const configuracion = { obtenerEmpresa: vi.fn().mockResolvedValue({ tasaMoraMensual: null, diasGraciaMora: 0, diasSemaforoAmarillo: 5 }) };
    const servicioClientes = new CarteraService(prisma as unknown as PrismaService, configuracion as unknown as ConfiguracionService);

    const filas = await servicioClientes.listarPorCliente(usuarioDePrueba());

    expect(filas[0].ventas.map((v) => [v.id, v.enMora])).toEqual([
      ['v-mora', true],
      ['v-dia', false],
    ]);
  });

  describe('acuerdo de pago vigente (CC-07)', () => {
    const acuerdo = { motivo: 'Acuerdo de prueba', desde: dentroDe(-40), hastaPrevista: null, finalizadoEn: null };
    const venta = (id: string, acuerdosPago: object[]) => ({
      id,
      acuerdosPago,
      cuotas: [cuota(-10, 1_000_000)],
      lote: { numero: `L-${id}`, proyecto: { nombre: 'Proyecto Uno' } },
    });
    // Tasa de 3 % mensual: $1.000 por día sobre $1.000.000.
    const servicioConTasa = (ventas: object[]) => {
      const prisma = { cliente: { findMany: vi.fn().mockResolvedValue([{ id: 'c1', nombre: 'Ana', documento: '1', ventas }]) } };
      const configuracion = { obtenerEmpresa: vi.fn().mockResolvedValue({ tasaMoraMensual: D(3), diasGraciaMora: 0, diasSemaforoAmarillo: 5 }) };
      return new CarteraService(prisma as unknown as PrismaService, configuracion as unknown as ConfiguracionService);
    };

    it('sin acuerdo cobra el interés; con acuerdo vigente no, pero la deuda y la mora siguen iguales', async () => {
      const [fila] = await servicioConTasa([venta('v-normal', [])]).listarPorCliente(usuarioDePrueba());
      expect(fila.interesMora.toNumber()).toBe(10_000);
      expect(fila.saldoVencido.toNumber()).toBe(1_000_000);

      const [conAcuerdo] = await servicioConTasa([venta('v-acuerdo', [acuerdo])]).listarPorCliente(usuarioDePrueba());
      expect(conAcuerdo.interesMora.toNumber()).toBe(0);
      expect(conAcuerdo.saldoVencido.toNumber()).toBe(1_000_000);
      expect(conAcuerdo.ventas[0]).toMatchObject({ enMora: true, acuerdoVigente: true });
    });

    it('el acuerdo de una venta no exime el interés de otra del mismo cliente', async () => {
      const [fila] = await servicioConTasa([venta('v-acuerdo', [acuerdo]), venta('v-normal', [])]).listarPorCliente(usuarioDePrueba());
      expect(fila.interesMora.toNumber()).toBe(10_000);
      expect(fila.ventas.map((v) => [v.id, v.acuerdoVigente])).toEqual([
        ['v-acuerdo', true],
        ['v-normal', false],
      ]);
    });

    it('un acuerdo ya terminado deja de eximir los días posteriores a su fin', async () => {
      // Cuota vencida hace 10 días; acuerdo hasta hace 6 días (inclusive): quedan 6 días con interés.
      const terminado = { motivo: 'Acuerdo de prueba', desde: dentroDe(-40), hastaPrevista: dentroDe(-6), finalizadoEn: null };
      const [fila] = await servicioConTasa([venta('v-fin', [terminado])]).listarPorCliente(usuarioDePrueba());
      expect(fila.interesMora.toNumber()).toBe(6_000);
      expect(fila.ventas[0].acuerdoVigente).toBe(false);
    });
  });
});
