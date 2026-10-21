import type { Prisma } from '../generated/prisma/client.js';
import type { EstadoLote } from '../generated/prisma/enums.js';
import type { FilaResumenProyecto } from './resumen.js';

export interface ResumenDashboard {
  periodo: { desde: string | null; hasta: string | null };
  // El proyecto al que se limitó el panel, o null si es de todos.
  proyecto: { id: string; nombre: string } | null;
  finanzas: {
    ingresosPorVentas: Prisma.Decimal;
    ingresosGenerales: Prisma.Decimal;
    gastos: Prisma.Decimal;
    totalIngresos: Prisma.Decimal;
    // Utilidad del período: lo que entró menos lo que salió.
    cajaNeta: Prisma.Decimal;
  };
  cartera: {
    saldoVencido: Prisma.Decimal;
    interesMora: Prisma.Decimal;
    // Todo lo que aún no vence (al día y próximo a vencer).
    saldoPorVencer: Prisma.Decimal;
    // La parte de lo anterior que vence en los próximos `diasAlerta` días.
    saldoProximoAVencer: Prisma.Decimal;
    diasAlerta: number;
  };
  // Cuántos lotes hay en cada estado (de todo el alcance o del proyecto elegido).
  lotesPorEstado: Record<EstadoLote, number>;
  porProyecto: FilaResumenProyecto[];
  // Comisiones por pagar (RF-REP-02); solo viene para quien tiene permiso de ver comisiones.
  comisionesPendientes?: { cantidad: number; valor: Prisma.Decimal };
  // Cierres de caja cerrados que esperan la aprobación del gerente (RF-REP-02); solo para quien ve la caja.
  cierresPorAprobar?: number;
  // Pagos por consignación o transferencia que esperan confirmarse contra el extracto; solo para quien puede verificarlos.
  consignacionesPorVerificar?: { cantidad: number; valor: Prisma.Decimal; masAntiguaDias: number; enAlerta: boolean };
}
