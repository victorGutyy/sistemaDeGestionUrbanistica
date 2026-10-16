import { Prisma } from '../generated/prisma/client.js';
import { EstadoCuota } from '../generated/prisma/enums.js';

export interface ProximaCuota {
  numero: number;
  fechaVencimiento: Date;
  valor: Prisma.Decimal;
}

export interface EstadoCuenta {
  totalPagado: Prisma.Decimal;
  saldoPendiente: Prisma.Decimal;
  proximaCuota: ProximaCuota | null;
}

interface CuotaParaEstadoCuenta extends ProximaCuota {
  estado: EstadoCuota;
}

interface ParametrosEstadoCuenta {
  valorTotal: Prisma.Decimal;
  abonos: { valor: Prisma.Decimal }[];
  cuotas: CuotaParaEstadoCuenta[];
}

// La cuota inicial es la cuota número 0 y se paga con abonos como cualquier otra, así que
// lo pagado es simplemente la suma de los abonos (ya no se da por pagada de entrada).
export function calcularEstadoCuenta(params: ParametrosEstadoCuenta): EstadoCuenta {
  const totalPagado = params.abonos.reduce(
    (acumulado, abono) => acumulado.plus(abono.valor),
    new Prisma.Decimal(0),
  );
  const saldoPendiente = params.valorTotal.minus(totalPagado);

  const cuotasPendientes = params.cuotas
    .filter((cuota) => cuota.estado !== EstadoCuota.PAGADA)
    .sort((a, b) => a.fechaVencimiento.getTime() - b.fechaVencimiento.getTime() || a.numero - b.numero);

  return {
    totalPagado,
    saldoPendiente,
    proximaCuota: cuotasPendientes[0] ?? null,
  };
}
