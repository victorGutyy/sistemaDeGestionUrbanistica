import { describe, expect, it, vi } from 'vitest';
import type { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import { CarteraService } from './cartera.service.js';

const D = (valor: number) => new Prisma.Decimal(valor);
const dentroDe = (dias: number) => new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + dias);

function servicio(cuotas: object[]) {
  const prisma = { proyecto: { findMany: vi.fn().mockResolvedValue([{ id: 'p1', nombre: 'Proyecto Uno', lotes: [{ ventas: [{ cuotas }] }] }]) } };
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
