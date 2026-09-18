import type { Prisma } from '../generated/prisma/client.js';
import type { FilaResumenProyecto } from './resumen.js';

export interface ResumenDashboard {
  periodo: { desde: string | null; hasta: string | null };
  finanzas: {
    ingresosPorVentas: Prisma.Decimal;
    ingresosGenerales: Prisma.Decimal;
    gastos: Prisma.Decimal;
    totalIngresos: Prisma.Decimal;
    cajaNeta: Prisma.Decimal;
  };
  cartera: {
    saldoVencido: Prisma.Decimal;
    interesMora: Prisma.Decimal;
    saldoPorVencer: Prisma.Decimal;
  };
  porProyecto: FilaResumenProyecto[];
}
