import { Prisma } from '../generated/prisma/client.js';

export interface FilaFinanzasPorProyecto {
  proyectoId: string;
  nombre: string;
  ingresosPorVentas: Prisma.Decimal;
  ingresosGenerales: Prisma.Decimal;
  gastos: Prisma.Decimal;
  cajaNeta: Prisma.Decimal;
}

export interface FilaCarteraPorProyecto {
  proyectoId: string;
  nombre: string;
  saldoVencido: Prisma.Decimal;
  interesMora: Prisma.Decimal;
  saldoPorVencer: Prisma.Decimal;
}

export interface FilaResumenProyecto {
  proyectoId: string;
  nombre: string;
  ingresosPorVentas: Prisma.Decimal;
  ingresosGenerales: Prisma.Decimal;
  gastos: Prisma.Decimal;
  cajaNeta: Prisma.Decimal;
  saldoVencido: Prisma.Decimal;
  interesMora: Prisma.Decimal;
  saldoPorVencer: Prisma.Decimal;
}

const CERO = new Prisma.Decimal(0);

// Finanzas y Cartera calculan "por proyecto" cada uno por su lado (con
// consultas y filtros distintos); esta función solo los cruza por
// proyectoId en una fila única para el dashboard. Un proyecto puede
// aparecer en una lista y no en la otra (p.ej. gastos sin ventas todavía).
export function combinarPorProyecto(
  finanzasPorProyecto: FilaFinanzasPorProyecto[],
  carteraPorProyecto: FilaCarteraPorProyecto[],
): FilaResumenProyecto[] {
  const filas = new Map<string, FilaResumenProyecto>();

  function obtenerFila(proyectoId: string, nombre: string): FilaResumenProyecto {
    let fila = filas.get(proyectoId);
    if (!fila) {
      fila = {
        proyectoId,
        nombre,
        ingresosPorVentas: CERO,
        ingresosGenerales: CERO,
        gastos: CERO,
        cajaNeta: CERO,
        saldoVencido: CERO,
        interesMora: CERO,
        saldoPorVencer: CERO,
      };
      filas.set(proyectoId, fila);
    }
    return fila;
  }

  for (const finanzas of finanzasPorProyecto) {
    const fila = obtenerFila(finanzas.proyectoId, finanzas.nombre);
    fila.ingresosPorVentas = finanzas.ingresosPorVentas;
    fila.ingresosGenerales = finanzas.ingresosGenerales;
    fila.gastos = finanzas.gastos;
    fila.cajaNeta = finanzas.cajaNeta;
  }

  for (const cartera of carteraPorProyecto) {
    const fila = obtenerFila(cartera.proyectoId, cartera.nombre);
    fila.saldoVencido = cartera.saldoVencido;
    fila.interesMora = cartera.interesMora;
    fila.saldoPorVencer = cartera.saldoPorVencer;
  }

  return Array.from(filas.values());
}
