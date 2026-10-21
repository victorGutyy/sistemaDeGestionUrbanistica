import type { ParametrosMora } from '../../cartera/mora.js';
import { Prisma } from '../../generated/prisma/client.js';
import { pesos, type FilaReporte, type SeccionReporte } from '../modelo.js';
import { construirCarteraPorEdades, type VentaParaEdades } from './cartera-edades.js';
import { construirEgresos, type EgresoParaReporte } from './egresos.js';
import { construirInventario, type LoteParaInventario } from './inventario.js';

export interface DatosInformeProyecto {
  lotes: LoteParaInventario[];
  // Ventas activas del proyecto: lo pactado y lo que lleva pagado (solo abonos vigentes).
  ventas: { valorTotal: Prisma.Decimal; pagado: Prisma.Decimal }[];
  // Del período pedido.
  ingresosPorVentas: Prisma.Decimal;
  otrosIngresos: Prisma.Decimal;
  egresos: EgresoParaReporte[];
  ventasParaEdades: VentaParaEdades[];
  hoy: Date;
  mora: ParametrosMora;
}

const CERO = () => new Prisma.Decimal(0);

// Informe de un proyecto para el socio (RF-REP-09): ventas y cobros, ingresos, egresos y utilidad del período, egresos por
// categoría, cartera por edades e inventario de lotes, todo de un solo proyecto. Las ventas, la cartera y el inventario
// son "a hoy"; los ingresos y egresos son del período que se pida.
export function construirInformeProyecto(datos: DatosInformeProyecto): SeccionReporte[] {
  const valorVendido = datos.ventas.reduce((suma, venta) => suma.plus(venta.valorTotal), CERO());
  const recaudado = datos.ventas.reduce((suma, venta) => suma.plus(venta.pagado), CERO());
  const totalIngresos = datos.ingresosPorVentas.plus(datos.otrosIngresos);
  const totalEgresos = datos.egresos.reduce((suma, egreso) => suma.plus(egreso.valor), CERO());

  const ventasYCobros: SeccionReporte = {
    titulo: 'Ventas y cobros (a hoy)',
    nota: 'Solo ventas activas: lo pactado, lo que los clientes llevan pagado y lo que falta por cobrar.',
    columnas: [
      { clave: 'concepto', encabezado: 'Concepto', tipo: 'texto', peso: 3 },
      { clave: 'cantidad', encabezado: 'Ventas', tipo: 'entero' },
      { clave: 'valor', encabezado: 'Valor', tipo: 'pesos', peso: 1.5 },
    ],
    filas: [
      { concepto: 'Valor vendido', cantidad: datos.ventas.length, valor: pesos(valorVendido) },
      { concepto: 'Recaudado de esas ventas', cantidad: null, valor: pesos(recaudado) },
      { concepto: 'Saldo por cobrar', cantidad: null, valor: pesos(valorVendido.minus(recaudado)) },
    ],
  };

  const resultado: SeccionReporte = {
    titulo: 'Ingresos, egresos y utilidad del período',
    columnas: [
      { clave: 'concepto', encabezado: 'Concepto', tipo: 'texto', peso: 3 },
      { clave: 'valor', encabezado: 'Valor', tipo: 'pesos', peso: 1.5 },
    ],
    filas: [
      { concepto: 'Ingresos por ventas (abonos de clientes)', valor: pesos(datos.ingresosPorVentas) },
      { concepto: 'Otros ingresos', valor: pesos(datos.otrosIngresos) },
      { concepto: 'Total de ingresos', valor: pesos(totalIngresos) },
      { concepto: 'Egresos', valor: pesos(totalEgresos) },
    ] satisfies FilaReporte[],
    totales: { concepto: 'Utilidad del período', valor: pesos(totalIngresos.minus(totalEgresos)) },
  };

  const egresosPorCategoria = { ...construirEgresos(datos.egresos)[0], titulo: 'Egresos por categoría' };
  const cartera = { ...construirCarteraPorEdades(datos.ventasParaEdades, datos.hoy, datos.mora)[0], titulo: 'Cartera por edad de mora (a hoy)' };
  const [lotesPorEstado, valorPorEstado] = construirInventario(datos.lotes);

  return [ventasYCobros, resultado, egresosPorCategoria, cartera, { ...lotesPorEstado, titulo: 'Lotes por estado' }, valorPorEstado];
}
