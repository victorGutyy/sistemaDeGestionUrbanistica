import { describe, expect, it } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';
import type { SeccionReporte } from '../modelo.js';
import { MAXIMO_FILAS_DE_DETALLE } from '../modelo.js';
import { construirCarteraPorEdades, tramoDeMora } from './cartera-edades.js';
import { construirEgresos, NOMBRE_SIN_PROYECTO } from './egresos.js';
import { bloquesDeFlujo, construirFlujoDeCaja, type PartidaDeCaja } from './flujo-caja.js';
import { construirInventario } from './inventario.js';
import { construirRecaudo, type AbonoParaRecaudo } from './recaudo.js';

const D = (valor: number | string) => new Prisma.Decimal(valor);
const seccion = (secciones: SeccionReporte[], titulo: string) => secciones.find((s) => s.titulo === titulo)!;

describe('construirRecaudo (RF-REP-04)', () => {
  const abono = (extra: Partial<AbonoParaRecaudo>): AbonoParaRecaudo => ({
    fecha: '2026-10-05',
    recibo: 'RC-000001',
    cliente: 'Cliente Inventado',
    proyecto: 'Proyecto Uno',
    lote: 'A-1',
    medioPago: 'EFECTIVO',
    cuenta: null,
    referencia: null,
    valor: D(1_000_000),
    registradoPor: 'Ana Admin',
    ...extra,
  });
  const abonos = [
    abono({ valor: D(1_000_000) }),
    abono({ fecha: '2026-10-03', recibo: 'RC-000002', medioPago: 'TRANSFERENCIA', cuenta: 'Bancolombia ahorros', referencia: 'T-1', valor: D(3_000_000), registradoPor: 'Beto Gerente' }),
    abono({ fecha: '2026-10-04', recibo: 'RC-000003', medioPago: 'TRANSFERENCIA', cuenta: 'Bancolombia ahorros', valor: D(500_000), registradoPor: 'Ana Admin' }),
  ];
  const secciones = construirRecaudo(abonos);

  it('totaliza por medio de pago, de mayor a menor', () => {
    const porMedio = seccion(secciones, 'Por medio de pago');
    expect(porMedio.filas).toEqual([
      { nombre: 'Transferencia', cantidad: 2, total: '3500000' },
      { nombre: 'Efectivo', cantidad: 1, total: '1000000' },
    ]);
    expect(porMedio.totales).toEqual({ nombre: 'Total', cantidad: 3, total: '4500000' });
  });

  it('el efectivo va como "sin cuenta" y cada cuenta suma lo suyo', () => {
    const porCuenta = seccion(secciones, 'Por cuenta');
    expect(porCuenta.filas.map((f) => [f.nombre, f.total])).toEqual([
      ['Bancolombia ahorros', '3500000'],
      ['Efectivo (sin cuenta)', '1000000'],
    ]);
  });

  it('totaliza por el usuario que registró cada abono', () => {
    const porUsuario = seccion(secciones, 'Por usuario que lo registró');
    expect(porUsuario.filas.map((f) => [f.nombre, f.cantidad, f.total])).toEqual([
      ['Beto Gerente', 1, '3000000'],
      ['Ana Admin', 2, '1500000'],
    ]);
  });

  it('el detalle sale por fecha y trae el recibo, con el total al pie', () => {
    const detalle = seccion(secciones, 'Detalle de abonos');
    expect(detalle.filas.map((f) => f.recibo)).toEqual(['RC-000002', 'RC-000003', 'RC-000001']);
    expect(detalle.totales).toMatchObject({ valor: '4500000' });
  });

  it('un detalle muy largo se recorta pero el total sigue siendo el de todas las filas', () => {
    const muchos = Array.from({ length: MAXIMO_FILAS_DE_DETALLE + 10 }, () => abono({ valor: D(1000) }));
    const detalle = seccion(construirRecaudo(muchos), 'Detalle de abonos');
    expect(detalle.filas).toHaveLength(MAXIMO_FILAS_DE_DETALLE);
    expect(detalle.filasTotales).toBe(MAXIMO_FILAS_DE_DETALLE + 10);
    expect(detalle.totales?.valor).toBe(String((MAXIMO_FILAS_DE_DETALLE + 10) * 1000));
  });

  it('sin abonos, las tablas salen vacías con total cero', () => {
    const vacio = construirRecaudo([]);
    expect(seccion(vacio, 'Por medio de pago').filas).toEqual([]);
    expect(seccion(vacio, 'Por medio de pago').totales).toMatchObject({ cantidad: 0, total: '0' });
  });
});

describe('construirCarteraPorEdades (RF-REP-05 y RF-CAR-05)', () => {
  const hoy = new Date(2026, 9, 21);
  const haceDias = (dias: number) => new Date(2026, 9, 21 - dias);
  const MORA = { tasaMoraMensual: D(2), diasGracia: 0 };
  const cuota = (dias: number, valor = 1_000_000) => ({ estado: 'PENDIENTE' as const, fechaVencimiento: haceDias(dias), valor: D(valor), abonado: [] });

  it('clasifica los días de atraso en los tramos de 1–30, 31–60, 61–90 y más de 90 (con sus bordes)', () => {
    expect([0, -5].map(tramoDeMora)).toEqual(['porVencer', 'porVencer']);
    expect([1, 30].map(tramoDeMora)).toEqual(['tramo1', 'tramo1']);
    expect([31, 60].map(tramoDeMora)).toEqual(['tramo2', 'tramo2']);
    expect([61, 90].map(tramoDeMora)).toEqual(['tramo3', 'tramo3']);
    expect([91, 400].map(tramoDeMora)).toEqual(['tramo4', 'tramo4']);
  });

  it('pone el saldo de cada cuota en su tramo y suma el interés de mora', () => {
    const secciones = construirCarteraPorEdades(
      [{ cliente: 'Cliente Uno', proyecto: 'Proyecto Uno', lote: 'A-1', cuotas: [cuota(-10), cuota(15), cuota(45), cuota(75), cuota(120)] }],
      hoy,
      MORA,
    );
    const resumen = seccion(secciones, 'Resumen por edad de mora');
    expect(resumen.filas.map((f) => [f.tramo, f.saldo])).toEqual([
      ['Por vencer', '1000000'],
      ['1–30 días', '1000000'],
      ['31–60 días', '1000000'],
      ['61–90 días', '1000000'],
      ['Más de 90 días', '1000000'],
      ['Total vencido', '4000000'],
    ]);
    expect(resumen.totales).toMatchObject({ tramo: 'Total cartera', saldo: '5000000', ventas: 1 });
    const detalle = seccion(secciones, 'Detalle por venta');
    expect(detalle.filas[0]).toMatchObject({ vencido: '4000000', dias: 120 });
    // Interés simple: saldo × 2 % × días / 30 → 15, 45, 75 y 120 días.
    expect(detalle.totales?.interes).toBe(String(1_000_000 * 0.02 * ((15 + 45 + 75 + 120) / 30)));
  });

  it('las cuotas pagadas no cuentan y el abono parcial descuenta del saldo', () => {
    const secciones = construirCarteraPorEdades(
      [
        {
          cliente: 'Cliente Uno',
          proyecto: 'Proyecto Uno',
          lote: 'A-1',
          cuotas: [
            { estado: 'PAGADA', fechaVencimiento: haceDias(100), valor: D(1_000_000), abonado: [{ valor: D(1_000_000) }] },
            { estado: 'PARCIAL', fechaVencimiento: haceDias(10), valor: D(1_000_000), abonado: [{ valor: D(400_000) }] },
          ],
        },
      ],
      hoy,
      MORA,
    );
    expect(seccion(secciones, 'Resumen por edad de mora').totales).toMatchObject({ saldo: '600000' });
  });

  it('una venta al día aparece solo en "por vencer", y la que no debe nada no aparece', () => {
    const secciones = construirCarteraPorEdades(
      [
        { cliente: 'Al día', proyecto: 'P', lote: '1', cuotas: [cuota(-20)] },
        { cliente: 'Liquidada', proyecto: 'P', lote: '2', cuotas: [{ estado: 'PAGADA', fechaVencimiento: haceDias(50), valor: D(1000), abonado: [{ valor: D(1000) }] }] },
      ],
      hoy,
      MORA,
    );
    const detalle = seccion(secciones, 'Detalle por venta');
    expect(detalle.filas).toHaveLength(1);
    expect(detalle.filas[0]).toMatchObject({ cliente: 'Al día', porVencer: '1000000', vencido: '0' });
  });

  it('ordena por lo que más deben vencido y sin tasa de mora no hay interés', () => {
    const secciones = construirCarteraPorEdades(
      [
        { cliente: 'Debe poco', proyecto: 'P', lote: '1', cuotas: [cuota(10, 100_000)] },
        { cliente: 'Debe mucho', proyecto: 'P', lote: '2', cuotas: [cuota(10, 900_000)] },
      ],
      hoy,
      { tasaMoraMensual: null, diasGracia: 0 },
    );
    const detalle = seccion(secciones, 'Detalle por venta');
    expect(detalle.filas.map((f) => f.cliente)).toEqual(['Debe mucho', 'Debe poco']);
    expect(detalle.totales?.interes).toBe('0');
  });

  it('los días de gracia retrasan el interés', () => {
    const conGracia = construirCarteraPorEdades([{ cliente: 'C', proyecto: 'P', lote: '1', cuotas: [cuota(10)] }], hoy, { tasaMoraMensual: D(3), diasGracia: 10 });
    expect(seccion(conGracia, 'Detalle por venta').totales?.interes).toBe('0');
  });
});

describe('construirEgresos (RF-REP-06)', () => {
  const egresos = [
    { categoria: 'Materiales', proyecto: 'Proyecto Uno', valor: D(4_000_000) },
    { categoria: 'Materiales', proyecto: 'Proyecto Dos', valor: D(1_000_000) },
    { categoria: 'Transporte', proyecto: 'Proyecto Uno', valor: D(500_000) },
    { categoria: 'Nómina', proyecto: null, valor: D(2_000_000) },
  ];
  const secciones = construirEgresos(egresos);

  it('totaliza por categoría con su porcentaje', () => {
    const porCategoria = seccion(secciones, 'Por categoría');
    expect(porCategoria.filas.map((f) => [f.nombre, f.cantidad, f.total, f.porcentaje])).toEqual([
      ['Materiales', 2, '5000000', '66,7 %'],
      ['Nómina', 1, '2000000', '26,7 %'],
      ['Transporte', 1, '500000', '6,7 %'],
    ]);
    expect(porCategoria.totales).toMatchObject({ total: '7500000', porcentaje: '100 %' });
  });

  it('totaliza por proyecto y deja lo general en su propia fila', () => {
    const porProyecto = seccion(secciones, 'Por proyecto');
    expect(porProyecto.filas.map((f) => [f.nombre, f.total])).toEqual([
      ['Proyecto Uno', '4500000'],
      [NOMBRE_SIN_PROYECTO, '2000000'],
      ['Proyecto Dos', '1000000'],
    ]);
  });

  it('la tabla cruzada tiene una columna por proyecto (el general al final) y los totales cuadran', () => {
    const cruzada = seccion(secciones, 'Categoría por proyecto');
    expect(cruzada.columnas.map((c) => c.encabezado)).toEqual(['Categoría', 'Proyecto Dos', 'Proyecto Uno', NOMBRE_SIN_PROYECTO, 'Total']);
    const materiales = cruzada.filas.find((f) => f.categoria === 'Materiales')!;
    expect([materiales.p0, materiales.p1, materiales.p2, materiales.total]).toEqual(['1000000', '4000000', '0', '5000000']);
    expect(cruzada.totales).toMatchObject({ p0: '1000000', p1: '4500000', p2: '2000000', total: '7500000' });
  });

  it('sin egresos todo queda en cero', () => {
    const vacio = construirEgresos([]);
    expect(seccion(vacio, 'Por categoría').totales).toMatchObject({ cantidad: 0, total: '0', porcentaje: '0 %' });
  });
});

describe('construirInventario (RF-REP-07)', () => {
  const lote = (proyecto: string, numero: string, estado: 'DISPONIBLE' | 'SEPARADO' | 'VENDIDO' | 'ESCRITURADO' | 'DESISTIDO', valor = 50_000_000, manzana: string | null = 'A') => ({
    proyecto,
    manzana,
    numero,
    area: D(100),
    valorVenta: D(valor),
    estado,
  });
  const lotes = [lote('Proyecto Uno', '1', 'DISPONIBLE'), lote('Proyecto Uno', '2', 'VENDIDO'), lote('Proyecto Uno', '10', 'VENDIDO'), lote('Proyecto Dos', '1', 'DESISTIDO', 40_000_000, null)];

  it('cuenta los lotes de cada proyecto por estado', () => {
    const porProyecto = seccion(construirInventario(lotes), 'Lotes por proyecto y estado');
    expect(porProyecto.filas[0]).toMatchObject({ proyecto: 'Proyecto Dos', DESISTIDO: 1, total: 1 });
    expect(porProyecto.filas[1]).toMatchObject({ proyecto: 'Proyecto Uno', DISPONIBLE: 1, VENDIDO: 2, total: 3 });
    expect(porProyecto.totales).toMatchObject({ DISPONIBLE: 1, VENDIDO: 2, DESISTIDO: 1, total: 4 });
  });

  it('suma el valor de lista y el área por estado', () => {
    const porEstado = seccion(construirInventario(lotes), 'Valor de lista por estado');
    expect(porEstado.filas.find((f) => f.estado === 'Vendido')).toMatchObject({ lotes: 2, area: 200, valor: '100000000' });
    expect(porEstado.totales).toMatchObject({ lotes: 4, valor: '190000000' });
  });

  it('el detalle solo sale si se pide un estado, con los números de lote en orden natural', () => {
    expect(construirInventario(lotes).map((s) => s.titulo)).toEqual(['Lotes por proyecto y estado', 'Valor de lista por estado']);
    const detalle = seccion(construirInventario(lotes, 'VENDIDO'), 'Lotes vendidos');
    expect(detalle.filas.map((f) => f.lote)).toEqual(['A-2', 'A-10']);
  });
});

describe('construirFlujoDeCaja (RF-REP-11)', () => {
  const partida = (dia: string, tipo: PartidaDeCaja['tipo'], valor: number): PartidaDeCaja => ({ dia, tipo, valor: D(valor) });

  it('agrupa por mes, quincena, semana y día con los bordes de cada período', () => {
    expect(bloquesDeFlujo('2026-10-01', '2026-12-10', 'MES')).toEqual([
      { desde: '2026-10-01', hasta: '2026-10-31' },
      { desde: '2026-11-01', hasta: '2026-11-30' },
      { desde: '2026-12-01', hasta: '2026-12-10' },
    ]);
    expect(bloquesDeFlujo('2026-10-10', '2026-11-02', 'QUINCENA')).toEqual([
      { desde: '2026-10-10', hasta: '2026-10-15' },
      { desde: '2026-10-16', hasta: '2026-10-31' },
      { desde: '2026-11-01', hasta: '2026-11-02' },
    ]);
    // El 1 de octubre de 2026 es jueves: la primera semana va hasta el domingo 4.
    expect(bloquesDeFlujo('2026-10-01', '2026-10-12', 'SEMANA')).toEqual([
      { desde: '2026-10-01', hasta: '2026-10-04' },
      { desde: '2026-10-05', hasta: '2026-10-11' },
      { desde: '2026-10-12', hasta: '2026-10-12' },
    ]);
    expect(bloquesDeFlujo('2026-10-01', '2026-10-03', 'DIA')).toHaveLength(3);
  });

  it('calcula ingresos, egresos, neto y saldo acumulado, con el saldo inicial de todo lo anterior al rango', () => {
    const [flujo] = construirFlujoDeCaja(
      [
        partida('2026-09-20', 'INGRESO_VENTA', 10_000_000),
        partida('2026-09-25', 'EGRESO', 3_000_000),
        partida('2026-10-02', 'INGRESO_VENTA', 2_000_000),
        partida('2026-10-03', 'INGRESO_OTRO', 500_000),
        partida('2026-10-20', 'EGRESO', 4_000_000),
      ],
      { desde: '2026-10-01', hasta: '2026-10-31', granularidad: 'QUINCENA' },
    );
    expect(flujo.nota).toContain('7000000');
    expect(flujo.filas).toEqual([
      { periodo: '01/10/2026 – 15/10/2026', ventas: '2000000', otros: '500000', egresos: '0', neto: '2500000', saldo: '9500000' },
      { periodo: '16/10/2026 – 31/10/2026', ventas: '0', otros: '0', egresos: '4000000', neto: '-4000000', saldo: '5500000' },
    ]);
    expect(flujo.totales).toMatchObject({ ventas: '2000000', otros: '500000', egresos: '4000000', neto: '-1500000', saldo: '5500000' });
  });

  it('lo posterior al rango no entra', () => {
    const [flujo] = construirFlujoDeCaja([partida('2026-11-05', 'INGRESO_VENTA', 9_000_000)], { desde: '2026-10-01', hasta: '2026-10-31', granularidad: 'MES' });
    expect(flujo.totales).toMatchObject({ ventas: '0', saldo: '0' });
  });

  it('rechaza un rango al revés o con demasiados períodos', () => {
    expect(() => construirFlujoDeCaja([], { desde: '2026-10-10', hasta: '2026-10-01', granularidad: 'DIA' })).toThrow(/no puede ser posterior/);
    expect(() => construirFlujoDeCaja([], { desde: '2024-01-01', hasta: '2026-10-01', granularidad: 'DIA' })).toThrow(/más de 400 períodos/);
  });
});
