import { evaluarCuotaPendiente, type ParametrosMora } from '../../cartera/mora.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { EstadoCuota } from '../../generated/prisma/enums.js';
import { pesos, porcentaje, recortarDetalle, type FilaReporte, type SeccionReporte } from '../modelo.js';

export interface VentaParaEdades {
  cliente: string;
  proyecto: string;
  lote: string;
  cuotas: {
    estado: EstadoCuota;
    fechaVencimiento: Date;
    valor: Prisma.Decimal;
    // Solo lo aplicado por abonos vigentes.
    abonado: { valor: Prisma.Decimal }[];
  }[];
}

// Los tramos de la edad de mora (RF-CAR-05): días de atraso de cada cuota vencida.
export const TRAMOS = [
  { clave: 'porVencer', etiqueta: 'Por vencer' },
  { clave: 'tramo1', etiqueta: '1–30 días' },
  { clave: 'tramo2', etiqueta: '31–60 días' },
  { clave: 'tramo3', etiqueta: '61–90 días' },
  { clave: 'tramo4', etiqueta: 'Más de 90 días' },
] as const;

type ClaveTramo = (typeof TRAMOS)[number]['clave'];

export function tramoDeMora(diasAtraso: number): ClaveTramo {
  if (diasAtraso <= 0) return 'porVencer';
  if (diasAtraso <= 30) return 'tramo1';
  if (diasAtraso <= 60) return 'tramo2';
  if (diasAtraso <= 90) return 'tramo3';
  return 'tramo4';
}

const CERO = () => new Prisma.Decimal(0);

interface FilaVenta {
  cliente: string;
  proyecto: string;
  lote: string;
  tramos: Record<ClaveTramo, Prisma.Decimal>;
  interes: Prisma.Decimal;
  diasMaximos: number;
}

// Cartera por edades de mora (RF-REP-05 y RF-CAR-05): lo que deben los clientes en la fecha dada, cuota por cuota, en
// el tramo de atraso que le toca a cada una. Las cuotas pagadas no cuentan; el interés es el mismo de la cartera.
export function construirCarteraPorEdades(ventas: VentaParaEdades[], hoy: Date, mora: ParametrosMora): SeccionReporte[] {
  const filas: FilaVenta[] = [];
  for (const venta of ventas) {
    const fila: FilaVenta = {
      cliente: venta.cliente,
      proyecto: venta.proyecto,
      lote: venta.lote,
      tramos: { porVencer: CERO(), tramo1: CERO(), tramo2: CERO(), tramo3: CERO(), tramo4: CERO() },
      interes: CERO(),
      diasMaximos: 0,
    };
    let conSaldo = false;
    for (const cuota of venta.cuotas) {
      const evaluacion = evaluarCuotaPendiente(cuota, cuota.abonado, hoy, mora);
      if (!evaluacion || evaluacion.saldo.isZero()) continue;
      conSaldo = true;
      const tramo = tramoDeMora(evaluacion.vencida ? evaluacion.diasAtraso : 0);
      fila.tramos[tramo] = fila.tramos[tramo].plus(evaluacion.saldo);
      fila.interes = fila.interes.plus(evaluacion.interesMora);
      if (evaluacion.vencida) fila.diasMaximos = Math.max(fila.diasMaximos, evaluacion.diasAtraso);
    }
    if (conSaldo) filas.push(fila);
  }

  const vencidoDe = (fila: FilaVenta) => fila.tramos.tramo1.plus(fila.tramos.tramo2).plus(fila.tramos.tramo3).plus(fila.tramos.tramo4);
  // Primero los que más deben vencido; a igual valor, por cliente.
  filas.sort((a, b) => vencidoDe(b).comparedTo(vencidoDe(a)) || a.cliente.localeCompare(b.cliente, 'es') || a.lote.localeCompare(b.lote, 'es'));

  const totalTramo = (clave: ClaveTramo) => filas.reduce((suma, fila) => suma.plus(fila.tramos[clave]), CERO());
  const totalVencido = filas.reduce((suma, fila) => suma.plus(vencidoDe(fila)), CERO());
  const totalCartera = totalVencido.plus(totalTramo('porVencer'));
  const totalInteres = filas.reduce((suma, fila) => suma.plus(fila.interes), CERO());

  const resumen: SeccionReporte = {
    titulo: 'Resumen por edad de mora',
    nota: 'Cada cuota pendiente se clasifica por los días que lleva vencida. El interés de mora usa la tasa y los días de gracia configurados.',
    columnas: [
      { clave: 'tramo', encabezado: 'Edad', tipo: 'texto', peso: 2 },
      { clave: 'ventas', encabezado: 'Ventas', tipo: 'entero' },
      { clave: 'saldo', encabezado: 'Saldo', tipo: 'pesos', peso: 1.5 },
      { clave: 'porcentaje', encabezado: '% de la cartera', tipo: 'texto' },
    ],
    filas: [
      ...TRAMOS.map(
        (tramo): FilaReporte => ({
          tramo: tramo.etiqueta,
          ventas: filas.filter((fila) => fila.tramos[tramo.clave].greaterThan(0)).length,
          saldo: pesos(totalTramo(tramo.clave)),
          porcentaje: porcentaje(totalTramo(tramo.clave), totalCartera),
        }),
      ),
      { tramo: 'Total vencido', ventas: filas.filter((fila) => vencidoDe(fila).greaterThan(0)).length, saldo: pesos(totalVencido), porcentaje: porcentaje(totalVencido, totalCartera) },
    ],
    totales: { tramo: 'Total cartera', ventas: filas.length, saldo: pesos(totalCartera), porcentaje: totalCartera.isZero() ? '0 %' : '100 %' },
  };

  const detalle = recortarDetalle(
    filas.map(
      (fila): FilaReporte => ({
        cliente: fila.cliente,
        proyecto: fila.proyecto,
        lote: fila.lote,
        porVencer: pesos(fila.tramos.porVencer),
        tramo1: pesos(fila.tramos.tramo1),
        tramo2: pesos(fila.tramos.tramo2),
        tramo3: pesos(fila.tramos.tramo3),
        tramo4: pesos(fila.tramos.tramo4),
        vencido: pesos(vencidoDe(fila)),
        interes: pesos(fila.interes),
        dias: fila.diasMaximos,
      }),
    ),
  );

  return [
    resumen,
    {
      titulo: 'Detalle por venta',
      columnas: [
        { clave: 'cliente', encabezado: 'Cliente', tipo: 'texto', peso: 3 },
        { clave: 'proyecto', encabezado: 'Proyecto', tipo: 'texto', peso: 2 },
        { clave: 'lote', encabezado: 'Lote', tipo: 'texto', peso: 0.8 },
        { clave: 'porVencer', encabezado: 'Por vencer', tipo: 'pesos', peso: 1.4 },
        { clave: 'tramo1', encabezado: '1–30', tipo: 'pesos', peso: 1.2 },
        { clave: 'tramo2', encabezado: '31–60', tipo: 'pesos', peso: 1.2 },
        { clave: 'tramo3', encabezado: '61–90', tipo: 'pesos', peso: 1.2 },
        { clave: 'tramo4', encabezado: '+90', tipo: 'pesos', peso: 1.2 },
        { clave: 'vencido', encabezado: 'Total vencido', tipo: 'pesos', peso: 1.4 },
        { clave: 'interes', encabezado: 'Interés de mora', tipo: 'pesos', peso: 1.3 },
        { clave: 'dias', encabezado: 'Días máx.', tipo: 'entero', peso: 0.8 },
      ],
      filas: detalle.filas,
      filasTotales: detalle.filasTotales,
      totales: {
        cliente: 'Total',
        porVencer: pesos(totalTramo('porVencer')),
        tramo1: pesos(totalTramo('tramo1')),
        tramo2: pesos(totalTramo('tramo2')),
        tramo3: pesos(totalTramo('tramo3')),
        tramo4: pesos(totalTramo('tramo4')),
        vencido: pesos(totalVencido),
        interes: pesos(totalInteres),
      },
    },
  ];
}
