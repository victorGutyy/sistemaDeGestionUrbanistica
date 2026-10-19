import { Prisma } from '../generated/prisma/client.js';
import type { EstadoMovimiento, MedioPago, TipoMovimiento } from '../generated/prisma/enums.js';

// Una línea del detalle de finanzas de un proyecto (RF-EGR-08): puede ser un movimiento registrado a mano
// o un abono de un cliente (que aparece como ingreso por venta de lotes, con su número de recibo).
export interface FilaFinanza {
  origen: 'ABONO' | 'MOVIMIENTO';
  id: string;
  fecha: Date;
  tipo: TipoMovimiento;
  categoria: string;
  descripcion: string;
  valor: Prisma.Decimal;
  medioPago: MedioPago;
  cuenta: string | null;
  referencia: string | null;
  tercero: string | null;
  numeroDocumento: string | null;
  tieneSoporte: boolean;
  registradoPor: string | null;
  estado: EstadoMovimiento;
  // Solo en abonos: número del recibo y venta a la que pertenece.
  recibo: string | null;
  ventaId: string | null;
  // Solo en proyectos de maquinaria: el equipo del movimiento, o "Flota (general)".
  equipo: string | null;
}

export interface ResumenFinanzasProyecto {
  ingresosPorVentas: Prisma.Decimal;
  otrosIngresos: Prisma.Decimal;
  totalIngresos: Prisma.Decimal;
  egresos: Prisma.Decimal;
  utilidad: Prisma.Decimal;
  // Del proyecto completo (no dependen del período): lo vendido, lo recaudado de esas ventas y lo que falta cobrar.
  valorVendido: Prisma.Decimal;
  recaudadoVentas: Prisma.Decimal;
  saldoPorCobrar: Prisma.Decimal;
}

interface VentaParaResumen {
  valorTotal: Prisma.Decimal;
  // Solo abonos vigentes.
  pagado: Prisma.Decimal;
}

const CERO = () => new Prisma.Decimal(0);

// La utilidad de un proyecto es lo recaudado menos lo gastado (RF-EGR-05). Los movimientos y abonos
// anulados se muestran en el detalle, pero no suman en ningún total.
export function resumirFinanzasProyecto(filas: FilaFinanza[], ventasActivas: VentaParaResumen[]): ResumenFinanzasProyecto {
  let ingresosPorVentas = CERO();
  let otrosIngresos = CERO();
  let egresos = CERO();

  for (const fila of filas) {
    if (fila.estado !== 'ACTIVO') continue;
    if (fila.tipo === 'GASTO') {
      egresos = egresos.plus(fila.valor);
    } else if (fila.origen === 'ABONO') {
      ingresosPorVentas = ingresosPorVentas.plus(fila.valor);
    } else {
      otrosIngresos = otrosIngresos.plus(fila.valor);
    }
  }

  const valorVendido = ventasActivas.reduce((total, venta) => total.plus(venta.valorTotal), CERO());
  const recaudadoVentas = ventasActivas.reduce((total, venta) => total.plus(venta.pagado), CERO());
  const totalIngresos = ingresosPorVentas.plus(otrosIngresos);

  return {
    ingresosPorVentas,
    otrosIngresos,
    totalIngresos,
    egresos,
    utilidad: totalIngresos.minus(egresos),
    valorVendido,
    recaudadoVentas,
    saldoPorCobrar: valorVendido.minus(recaudadoVentas),
  };
}
