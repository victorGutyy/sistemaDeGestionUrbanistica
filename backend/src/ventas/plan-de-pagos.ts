import { Prisma } from '../generated/prisma/client.js';

export interface CuotaPlanificada {
  numero: number;
  fechaVencimiento: Date;
  valor: Prisma.Decimal;
}

export interface ParametrosPlanDePagos {
  valorTotal: Prisma.Decimal;
  cuotaInicial: Prisma.Decimal;
  numeroCuotas: number;
  /** Tasa mensual en porcentaje (ej. 1.5 = 1.5% mensual), o null si no hay interés. */
  tasaInteres: Prisma.Decimal | null;
  fechaVenta: Date;
}

// Interés simple sobre saldo inicial: el capital financiado se reparte en
// partes iguales entre las cuotas, y el interés se calcula una sola vez
// sobre ese saldo inicial (no sobre el saldo que va quedando) y se suma
// igual a cada cuota. Es el método que ya usan en el Excel actual.
export function generarPlanDePagos(params: ParametrosPlanDePagos): CuotaPlanificada[] {
  const { valorTotal, cuotaInicial, numeroCuotas, tasaInteres, fechaVenta } = params;

  if (numeroCuotas <= 0) {
    throw new Error('numeroCuotas debe ser mayor a cero para generar un plan de pagos');
  }

  const capitalFinanciado = valorTotal.minus(cuotaInicial);
  const interesPorCuota = tasaInteres
    ? capitalFinanciado.mul(tasaInteres).div(100).toDecimalPlaces(2)
    : new Prisma.Decimal(0);
  const capitalPorCuotaBase = capitalFinanciado.div(numeroCuotas).toDecimalPlaces(2);

  const cuotas: CuotaPlanificada[] = [];
  let capitalAcumulado = new Prisma.Decimal(0);

  for (let numero = 1; numero <= numeroCuotas; numero++) {
    const esUltimaCuota = numero === numeroCuotas;
    // La última cuota absorbe el residuo de redondeo de las anteriores,
    // para que la suma de capital de todas las cuotas cuadre exacto con
    // capitalFinanciado (nunca "se pierden" centavos por la división).
    const capitalDeEstaCuota = esUltimaCuota
      ? capitalFinanciado.minus(capitalAcumulado)
      : capitalPorCuotaBase;

    capitalAcumulado = capitalAcumulado.plus(capitalDeEstaCuota);

    cuotas.push({
      numero,
      fechaVencimiento: sumarMeses(fechaVenta, numero),
      valor: capitalDeEstaCuota.plus(interesPorCuota),
    });
  }

  return cuotas;
}

// Suma "meses" a "fecha" conservando el día del mes cuando es posible, y
// recortándolo al último día del mes destino cuando no cabe (31 de enero
// + 1 mes = 28 o 29 de febrero, no 3 de marzo como haría un setMonth ingenuo).
function sumarMeses(fecha: Date, meses: number): Date {
  const resultado = new Date(fecha);
  const diaOriginal = resultado.getDate();

  resultado.setDate(1);
  resultado.setMonth(resultado.getMonth() + meses);

  const ultimoDiaDelMesDestino = new Date(
    resultado.getFullYear(),
    resultado.getMonth() + 1,
    0,
  ).getDate();
  resultado.setDate(Math.min(diaOriginal, ultimoDiaDelMesDestino));

  return resultado;
}
