import { parsearFechaLocal } from '../common/fecha.util.js';
import { Prisma } from '../generated/prisma/client.js';
import { TipoMovimiento } from '../generated/prisma/enums.js';
import type { FiltroPeriodoDto } from './dto/filtro-periodo.dto.js';

// Compara contra el mismo rango [desde, hasta] que usan las consultas a
// Prisma (ambos extremos inclusive), para filtrar en JS lo que no se pudo
// filtrar en la consulta (la cuota inicial de la Venta, ver más abajo).
export function fechaEnRango(fecha: Date, filtro: FiltroPeriodoDto): boolean {
  if (filtro.desde && fecha < parsearFechaLocal(filtro.desde)) return false;
  if (filtro.hasta && fecha > parsearFechaLocal(filtro.hasta)) return false;
  return true;
}

export interface ResumenCaja {
  ingresosPorVentas: Prisma.Decimal;
  ingresosGenerales: Prisma.Decimal;
  gastos: Prisma.Decimal;
  totalIngresos: Prisma.Decimal;
  cajaNeta: Prisma.Decimal;
}

export interface ResumenPorProyecto extends ResumenCaja {
  proyectoId: string;
  nombre: string;
}

export interface ConsolidadoCaja extends ResumenCaja {
  porProyecto: ResumenPorProyecto[];
}

interface MovimientoParaConsolidado {
  tipo: TipoMovimiento;
  valor: Prisma.Decimal;
  proyectoId: string | null;
}

interface AbonoParaConsolidado {
  valor: Prisma.Decimal;
  proyectoId: string;
}

interface ParametrosConsolidado {
  movimientos: MovimientoParaConsolidado[];
  abonos: AbonoParaConsolidado[];
  proyectos: { id: string; nombre: string }[];
}

interface Acumulador {
  ingresosPorVentas: Prisma.Decimal;
  ingresosGenerales: Prisma.Decimal;
  gastos: Prisma.Decimal;
}

function nuevoAcumulador(): Acumulador {
  return {
    ingresosPorVentas: new Prisma.Decimal(0),
    ingresosGenerales: new Prisma.Decimal(0),
    gastos: new Prisma.Decimal(0),
  };
}

function cerrar(acumulador: Acumulador): ResumenCaja {
  const totalIngresos = acumulador.ingresosPorVentas.plus(acumulador.ingresosGenerales);
  return { ...acumulador, totalIngresos, cajaNeta: totalIngresos.minus(acumulador.gastos) };
}

// Suma los MovimientoFinanciero (ingresos/gastos manuales) y los Abono
// (ingresos reales por venta de lotes) en un solo consolidado, total y por
// proyecto. Los dos vienen de tablas distintas — ver el comentario en
// schema.prisma sobre por qué no se duplican los abonos aquí.
export function calcularConsolidado(params: ParametrosConsolidado): ConsolidadoCaja {
  const total = nuevoAcumulador();
  const porProyectoMap = new Map<string, Acumulador>();

  function acumuladorDeProyecto(proyectoId: string): Acumulador {
    let acumulador = porProyectoMap.get(proyectoId);
    if (!acumulador) {
      acumulador = nuevoAcumulador();
      porProyectoMap.set(proyectoId, acumulador);
    }
    return acumulador;
  }

  for (const movimiento of params.movimientos) {
    const campo: 'ingresosGenerales' | 'gastos' =
      movimiento.tipo === TipoMovimiento.INGRESO ? 'ingresosGenerales' : 'gastos';

    total[campo] = total[campo].plus(movimiento.valor);
    if (movimiento.proyectoId) {
      const acumulador = acumuladorDeProyecto(movimiento.proyectoId);
      acumulador[campo] = acumulador[campo].plus(movimiento.valor);
    }
  }

  for (const abono of params.abonos) {
    total.ingresosPorVentas = total.ingresosPorVentas.plus(abono.valor);
    const acumulador = acumuladorDeProyecto(abono.proyectoId);
    acumulador.ingresosPorVentas = acumulador.ingresosPorVentas.plus(abono.valor);
  }

  const nombresPorId = new Map(params.proyectos.map((proyecto) => [proyecto.id, proyecto.nombre]));

  const porProyecto: ResumenPorProyecto[] = Array.from(porProyectoMap.entries()).map(
    ([proyectoId, acumulador]) => ({
      proyectoId,
      nombre: nombresPorId.get(proyectoId) ?? 'Proyecto eliminado',
      ...cerrar(acumulador),
    }),
  );

  return { ...cerrar(total), porProyecto };
}
