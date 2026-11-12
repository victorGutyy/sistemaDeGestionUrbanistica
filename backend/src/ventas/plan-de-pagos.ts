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
  /**
   * Fecha de la primera cuota, si el contrato la fija ("a partir de febrero, los 5 de cada mes"). Las demás caen el mismo
   * día de cada mes siguiente. Sin ella, la cuota n vence n meses después de la fecha de venta.
   */
  fechaPrimeraCuota?: Date | null;
  /**
   * Una fecha por cada cuota (la 1.ª en el índice 0), cuando el contrato las fija una por una (p. ej. "15 de agosto y 15 de
   * diciembre"). Tiene que traer exactamente numeroCuotas fechas, en orden. Si viene, manda sobre fechaPrimeraCuota.
   */
  fechasCuotas?: Date[] | null;
}

export class FechasDeCuotasInvalidas extends Error {}

const dia = (f: Date) => new Date(f.getFullYear(), f.getMonth(), f.getDate());

/**
 * Las fechas de las cuotas elegidas una por una: la cantidad exacta, en orden (puede haber dos el mismo día) y ninguna anterior
 * a la fecha de la venta. Lanza FechasDeCuotasInvalidas con un mensaje para mostrar a la persona.
 */
export function validarFechasDeCuotas(fechas: Date[], numeroCuotas: number, fechaVenta: Date): void {
  if (fechas.length !== numeroCuotas) {
    throw new FechasDeCuotasInvalidas(`Hacen falta ${numeroCuotas} fechas (una por cuota) y llegaron ${fechas.length}`);
  }
  const limite = dia(fechaVenta).getTime();
  fechas.forEach((fecha, i) => {
    if (Number.isNaN(fecha.getTime())) throw new FechasDeCuotasInvalidas(`La fecha de la cuota ${i + 1} no es válida`);
    if (dia(fecha).getTime() < limite) throw new FechasDeCuotasInvalidas(`La cuota ${i + 1} no puede vencer antes de la fecha de la venta`);
    if (i > 0 && dia(fecha).getTime() < dia(fechas[i - 1]).getTime()) {
      throw new FechasDeCuotasInvalidas(`La cuota ${i + 1} no puede vencer antes que la cuota ${i}: las fechas van en orden`);
    }
  });
}

// Interés simple sobre saldo inicial: el capital financiado se reparte en
// partes iguales entre las cuotas, y el interés se calcula una sola vez
// sobre ese saldo inicial (no sobre el saldo que va quedando) y se suma
// igual a cada cuota. Es el método que ya usan en el Excel actual.
export function generarPlanDePagos(params: ParametrosPlanDePagos): CuotaPlanificada[] {
  const { valorTotal, cuotaInicial, numeroCuotas, tasaInteres, fechaVenta, fechaPrimeraCuota, fechasCuotas } = params;
  if (fechasCuotas) validarFechasDeCuotas(fechasCuotas, numeroCuotas, fechaVenta);

  if (numeroCuotas <= 0) {
    throw new Error('numeroCuotas debe ser mayor a cero para generar un plan de pagos');
  }

  const capitalFinanciado = valorTotal.minus(cuotaInicial);
  const interesPorCuota = tasaInteres
    ? capitalFinanciado.mul(tasaInteres).div(100).toDecimalPlaces(0)
    : new Prisma.Decimal(0);
  const capitalPorCuotaBase = capitalFinanciado.div(numeroCuotas).toDecimalPlaces(0);

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
      // Cada fecha se calcula desde la base (no desde la anterior): así un día 31 vuelve a 31 en los meses que lo tienen.
      fechaVencimiento: fechasCuotas
        ? dia(fechasCuotas[numero - 1])
        : fechaPrimeraCuota
          ? sumarMeses(fechaPrimeraCuota, numero - 1)
          : sumarMeses(fechaVenta, numero),
      valor: capitalDeEstaCuota.plus(interesPorCuota),
    });
  }

  return cuotas;
}

// Suma "meses" a "fecha" conservando el día del mes cuando es posible, y
// recortándolo al último día del mes destino cuando no cabe (31 de enero
// + 1 mes = 28 o 29 de febrero, no 3 de marzo como haría un setMonth ingenuo).
export function sumarMeses(fecha: Date, meses: number): Date {
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
