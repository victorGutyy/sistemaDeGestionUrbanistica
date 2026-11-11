import { Prisma } from '../generated/prisma/client.js';
import type { EstadoMovimiento, MedioPago, TipoMovimiento } from '../generated/prisma/enums.js';

// Una línea del detalle de finanzas de un proyecto (RF-EGR-08): puede ser un movimiento registrado a mano
// o un abono de un cliente (que aparece como ingreso por venta de lotes, con su número de recibo).
export interface FilaFinanza {
  origen: 'ABONO' | 'MOVIMIENTO' | 'NOMINA';
  id: string;
  fecha: Date;
  tipo: TipoMovimiento;
  categoria: string;
  descripcion: string;
  valor: Prisma.Decimal;
  // Null en la nómina: un mismo grupo de pagos puede haberse hecho por varios medios.
  medioPago: MedioPago | null;
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

export interface PagoNominaParaFila {
  periodoInicio: Date;
  periodoFin: Date;
  fechaPago: Date;
  valorDevengado: Prisma.Decimal | null;
  valorPagado: Prisma.Decimal;
}

const dia = (fecha: Date) => `${String(fecha.getDate()).padStart(2, '0')}/${String(fecha.getMonth() + 1).padStart(2, '0')}/${fecha.getFullYear()}`;

// La nómina de una obra entra a sus finanzas como un gasto por cada quincena y día de pago (no uno por trabajador): lo que cuesta la
// obra se ve completo, sin mostrar cuánto ganó cada persona. El costo es lo devengado (CC-05).
export function filasDeNomina(pagos: PagoNominaParaFila[]): FilaFinanza[] {
  const grupos = new Map<string, { periodoInicio: Date; periodoFin: Date; fechaPago: Date; cantidad: number; valor: Prisma.Decimal }>();
  for (const pago of pagos) {
    const clave = `${pago.periodoInicio.getTime()}|${pago.periodoFin.getTime()}|${pago.fechaPago.getTime()}`;
    const grupo = grupos.get(clave) ?? { periodoInicio: pago.periodoInicio, periodoFin: pago.periodoFin, fechaPago: pago.fechaPago, cantidad: 0, valor: CERO() };
    grupo.cantidad += 1;
    grupo.valor = grupo.valor.plus(pago.valorDevengado ?? pago.valorPagado);
    grupos.set(clave, grupo);
  }
  return [...grupos.entries()].map(([clave, grupo]) => ({
    origen: 'NOMINA' as const,
    id: `nomina-${clave}`,
    fecha: grupo.fechaPago,
    tipo: 'GASTO' as TipoMovimiento,
    categoria: 'Nómina',
    descripcion: `Nómina del ${dia(grupo.periodoInicio)} al ${dia(grupo.periodoFin)} · ${grupo.cantidad} trabajador${grupo.cantidad === 1 ? '' : 'es'}`,
    valor: grupo.valor,
    medioPago: null,
    cuenta: null,
    referencia: null,
    tercero: null,
    numeroDocumento: null,
    tieneSoporte: false,
    registradoPor: null,
    estado: 'ACTIVO' as EstadoMovimiento,
    recibo: null,
    ventaId: null,
    equipo: null,
  }));
}

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
