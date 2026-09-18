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
  cuotaInicial: Prisma.Decimal;
  abonos: { valor: Prisma.Decimal }[];
  cuotas: CuotaParaEstadoCuenta[];
}

// La cuota inicial se paga en el momento de la venta y no queda registrada
// como un Abono aparte, así que cuenta como ya pagada desde el día uno.
export function calcularEstadoCuenta(params: ParametrosEstadoCuenta): EstadoCuenta {
  const totalAbonado = params.abonos.reduce(
    (acumulado, abono) => acumulado.plus(abono.valor),
    new Prisma.Decimal(0),
  );
  const totalPagado = params.cuotaInicial.plus(totalAbonado);
  const saldoPendiente = params.valorTotal.minus(totalPagado);

  const cuotasPendientes = params.cuotas
    .filter((cuota) => cuota.estado !== EstadoCuota.PAGADA)
    .sort((a, b) => a.fechaVencimiento.getTime() - b.fechaVencimiento.getTime());

  return {
    totalPagado,
    saldoPendiente,
    proximaCuota: cuotasPendientes[0] ?? null,
  };
}
