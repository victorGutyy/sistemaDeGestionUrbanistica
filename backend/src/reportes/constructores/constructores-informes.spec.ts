import { describe, expect, it } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';
import type { SeccionReporte } from '../modelo.js';
import { construirComisiones, type ComisionParaReporte } from './comisiones.js';
import { construirInformeProyecto } from './informe-proyecto.js';
import { construirMaquinariaPorEquipo } from './maquinaria.js';

const D = (valor: number | string) => new Prisma.Decimal(valor);
const seccion = (secciones: SeccionReporte[], titulo: string) => secciones.find((s) => s.titulo === titulo)!;

describe('construirComisiones (RF-REP-08)', () => {
  const comision = (extra: Partial<ComisionParaReporte>): ComisionParaReporte => ({
    fechaVenta: '2026-10-05',
    proyecto: 'Proyecto Uno',
    lote: 'A-1',
    cliente: 'Cliente Inventado',
    vendedor: 'Luis Gómez',
    tipoVendedor: 'ASESOR_INMOBILIARIO',
    valor: D(1_000_000),
    estado: 'PENDIENTE',
    fechaPago: null,
    medioPago: null,
    motivoAnulacion: null,
    ...extra,
  });
  const comisiones = [
    comision({}),
    comision({ lote: 'A-2', estado: 'PAGADA', fechaPago: '2026-10-10', medioPago: 'TRANSFERENCIA' }),
    comision({ lote: 'B-1', vendedor: 'Marcela Ríos', valor: D(500_000), tipoVendedor: 'REFERIDO', estado: 'ANULADA', motivoAnulacion: 'La venta se cayó' }),
  ];
  const secciones = construirComisiones(comisiones);

  it('totaliza por estado', () => {
    expect(seccion(secciones, 'Por estado').filas).toEqual([
      { estado: 'pendiente', cantidad: 1, valor: '1000000' },
      { estado: 'pagada', cantidad: 1, valor: '1000000' },
      { estado: 'anulada', cantidad: 1, valor: '500000' },
    ]);
    expect(seccion(secciones, 'Por estado').totales).toMatchObject({ cantidad: 3, valor: '2500000' });
  });

  it('separa por vendedor lo que falta por pagar, lo pagado y lo anulado', () => {
    const porVendedor = seccion(secciones, 'Por vendedor');
    expect(porVendedor.filas).toEqual([
      { vendedor: 'Luis Gómez', tipo: 'Asesor inmobiliario', cantidad: 2, pendiente: '1000000', pagada: '1000000', anulada: '0' },
      { vendedor: 'Marcela Ríos', tipo: 'Referido', cantidad: 1, pendiente: '0', pagada: '0', anulada: '500000' },
    ]);
  });

  it('el detalle trae la fecha y el medio de pago de las pagadas y el motivo de las anuladas', () => {
    const detalle = seccion(secciones, 'Detalle de comisiones');
    expect(detalle.filas.find((f) => f.lote === 'A-2')).toMatchObject({ estado: 'pagada', fechaPago: '2026-10-10', medio: 'Transferencia' });
    expect(detalle.filas.find((f) => f.lote === 'B-1')).toMatchObject({ motivo: 'La venta se cayó' });
  });

  it('sin comisiones salen las tablas vacías', () => {
    const vacio = construirComisiones([]);
    expect(seccion(vacio, 'Por vendedor').filas).toEqual([]);
    expect(seccion(vacio, 'Por estado').totales).toMatchObject({ cantidad: 0, valor: '0' });
  });
});

describe('construirMaquinariaPorEquipo (RF-MAQ-05)', () => {
  const equipo = (id: string, nombre: string, extra = {}) => ({ id, proyecto: 'Maquinaria Uno', nombre, placaSerie: null, tipo: 'Excavadora', estado: 'ACTIVO' as const, baja: false, ...extra });
  const mov = (equipoId: string | null, tipo: 'INGRESO' | 'GASTO', valor: number) => ({ equipoId, proyecto: 'Maquinaria Uno', tipo, valor: D(valor) });

  it('calcula ingresos, egresos y utilidad de cada equipo y los ordena por utilidad', () => {
    const [tabla] = construirMaquinariaPorEquipo(
      [equipo('e1', 'Excavadora 1', { placaSerie: 'EXC-1' }), equipo('e2', 'Volqueta 1', { tipo: 'Volqueta', estado: 'EN_MANTENIMIENTO' })],
      [mov('e1', 'INGRESO', 5_000_000), mov('e1', 'GASTO', 1_000_000), mov('e2', 'INGRESO', 800_000), mov('e2', 'GASTO', 1_500_000)],
    );
    expect(tabla.filas.map((f) => [f.equipo, f.ingresos, f.egresos, f.utilidad])).toEqual([
      ['Excavadora 1 (EXC-1)', '5000000', '1000000', '4000000'],
      ['Volqueta 1', '800000', '1500000', '-700000'],
    ]);
    expect(tabla.filas[1]).toMatchObject({ estado: 'En mantenimiento', tipo: 'Volqueta' });
  });

  it('los gastos generales de la flota salen en su propia fila y el total cuadra con todo lo del proyecto', () => {
    const [tabla] = construirMaquinariaPorEquipo([equipo('e1', 'Excavadora 1')], [mov('e1', 'INGRESO', 2_000_000), mov(null, 'GASTO', 300_000)]);
    expect(tabla.filas.find((f) => f.equipo === 'Flota (gastos generales)')).toMatchObject({ egresos: '300000', utilidad: '-300000' });
    expect(tabla.totales).toMatchObject({ ingresos: '2000000', egresos: '300000', utilidad: '1700000' });
  });

  it('un equipo sin movimientos aparece en cero; uno dado de baja solo aparece si movió dinero en el rango', () => {
    const [sinBaja] = construirMaquinariaPorEquipo([equipo('e1', 'Quieto'), equipo('e2', 'Viejo', { baja: true })], []);
    expect(sinBaja.filas.map((f) => f.equipo)).toEqual(['Quieto']);
    const [conBaja] = construirMaquinariaPorEquipo([equipo('e2', 'Viejo', { baja: true })], [mov('e2', 'GASTO', 100_000)]);
    expect(conBaja.filas[0]).toMatchObject({ equipo: 'Viejo', estado: 'Dado de baja', utilidad: '-100000' });
  });
});

describe('construirInformeProyecto (RF-REP-09)', () => {
  const hoy = new Date(2026, 9, 21);
  const informe = construirInformeProyecto({
    lotes: [
      { proyecto: 'La Floresta', manzana: 'A', numero: '1', area: D(100), valorVenta: D(50_000_000), estado: 'VENDIDO' },
      { proyecto: 'La Floresta', manzana: 'A', numero: '2', area: D(100), valorVenta: D(50_000_000), estado: 'DISPONIBLE' },
    ],
    ventas: [{ valorTotal: D(50_000_000), pagado: D(20_000_000) }],
    ingresosPorVentas: D(6_000_000),
    otrosIngresos: D(1_000_000),
    egresos: [
      { categoria: 'Materiales', proyecto: 'La Floresta', valor: D(2_000_000) },
      { categoria: 'Transporte', proyecto: 'La Floresta', valor: D(500_000) },
    ],
    ventasParaEdades: [
      {
        cliente: 'Cliente Inventado',
        proyecto: 'La Floresta',
        lote: 'A-1',
        cuotas: [{ estado: 'PENDIENTE', fechaVencimiento: new Date(2026, 8, 1), valor: D(2_000_000), abonado: [] }],
      },
    ],
    hoy,
    mora: { tasaMoraMensual: null, diasGracia: 0 },
  });

  it('muestra lo vendido, lo recaudado y lo que falta por cobrar', () => {
    const ventas = seccion(informe, 'Ventas y cobros (a hoy)');
    expect(ventas.filas.map((f) => [f.concepto, f.cantidad, f.valor])).toEqual([
      ['Valor vendido', 1, '50000000'],
      ['Recaudado de esas ventas', null, '20000000'],
      ['Saldo por cobrar', null, '30000000'],
    ]);
  });

  it('calcula los ingresos, los egresos y la utilidad del período', () => {
    const resultado = seccion(informe, 'Ingresos, egresos y utilidad del período');
    expect(resultado.filas.map((f) => f.valor)).toEqual(['6000000', '1000000', '7000000', '2500000']);
    expect(resultado.totales).toEqual({ concepto: 'Utilidad del período', valor: '4500000' });
  });

  it('trae los egresos por categoría, la cartera por edades y el inventario del proyecto', () => {
    expect(informe.map((s) => s.titulo)).toEqual([
      'Ventas y cobros (a hoy)',
      'Ingresos, egresos y utilidad del período',
      'Egresos por categoría',
      'Cartera por edad de mora (a hoy)',
      'Lotes por estado',
      'Valor de lista por estado',
    ]);
    expect(seccion(informe, 'Egresos por categoría').totales).toMatchObject({ total: '2500000' });
    expect(seccion(informe, 'Cartera por edad de mora (a hoy)').totales).toMatchObject({ saldo: '2000000' });
    expect(seccion(informe, 'Lotes por estado').totales).toMatchObject({ total: 2, VENDIDO: 1, DISPONIBLE: 1 });
  });

  it('un proyecto sin movimientos da todo en cero', () => {
    const vacio = construirInformeProyecto({ lotes: [], ventas: [], ingresosPorVentas: D(0), otrosIngresos: D(0), egresos: [], ventasParaEdades: [], hoy, mora: { tasaMoraMensual: null, diasGracia: 0 } });
    expect(seccion(vacio, 'Ingresos, egresos y utilidad del período').totales).toMatchObject({ valor: '0' });
  });
});
