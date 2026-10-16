import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { FormaPago } from '../generated/prisma/enums.js';

// Reglas de dinero de una venta (RF-VEN-03 y RF-VEN-05). Son funciones puras: no tocan la
// base de datos, así que se prueban sin ella y son la única fuente de estas cuentas.

export interface ParametrosVenta {
  /** Porcentaje de cuota inicial por defecto, p. ej. 30 = 30 %. */
  porcentajeCuotaInicial: Prisma.Decimal;
  plazoMaximoMeses: number;
  /** Tasa de financiación mensual en porcentaje; 0 = sin interés. */
  tasaFinanciacionMensual: Prisma.Decimal;
}

// Todo valor de venta es en pesos enteros: la cuota inicial y las cuotas no llevan centavos.
export function aPesos(valor: Prisma.Decimal): Prisma.Decimal {
  return valor.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
}

// Cuota inicial mínima que no exige excepción.
export function cuotaInicialMinima(valorTotal: Prisma.Decimal, parametros: ParametrosVenta): Prisma.Decimal {
  return aPesos(valorTotal.mul(parametros.porcentajeCuotaInicial).div(100));
}

interface EntradaCuotaInicial {
  formaPago: FormaPago;
  valorTotal: Prisma.Decimal;
  cuotaInicial?: Prisma.Decimal;
  cuotaInicialPorcentaje?: Prisma.Decimal;
}

// La cuota inicial puede darse en valor o en porcentaje (no ambos). Si no se da, se usa el
// porcentaje configurado. En una venta de contado, la "cuota inicial" es el valor total.
export function calcularCuotaInicial(entrada: EntradaCuotaInicial, parametros: ParametrosVenta): Prisma.Decimal {
  if (entrada.formaPago === FormaPago.CONTADO) {
    return entrada.valorTotal;
  }
  if (entrada.cuotaInicial && entrada.cuotaInicialPorcentaje) {
    throw new BadRequestException('Indica la cuota inicial en valor o en porcentaje, no en ambos');
  }
  if (entrada.cuotaInicial) {
    return aPesos(entrada.cuotaInicial);
  }
  const porcentaje = entrada.cuotaInicialPorcentaje ?? parametros.porcentajeCuotaInicial;
  return aPesos(entrada.valorTotal.mul(porcentaje).div(100));
}

export interface EvaluacionExcepcion {
  esExcepcion: boolean;
  /** Qué regla se rompe, en lenguaje para el usuario. */
  razones: string[];
}

// Una venta financiada es excepción si la cuota inicial queda por debajo de la configurada
// o si el plazo supera el máximo. La venta de contado nunca es excepción.
export function evaluarExcepcion(
  venta: { formaPago: FormaPago; valorTotal: Prisma.Decimal; cuotaInicial: Prisma.Decimal; numeroCuotas?: number | null },
  parametros: ParametrosVenta,
): EvaluacionExcepcion {
  const razones: string[] = [];

  if (venta.formaPago === FormaPago.FINANCIADO) {
    const minima = cuotaInicialMinima(venta.valorTotal, parametros);
    if (venta.cuotaInicial.lessThan(minima)) {
      razones.push(
        `La cuota inicial es menor al ${parametros.porcentajeCuotaInicial.toString()} % configurado (mínimo ${minima.toString()}).`,
      );
    }
    if (venta.numeroCuotas && venta.numeroCuotas > parametros.plazoMaximoMeses) {
      razones.push(`El plazo (${venta.numeroCuotas} cuotas) supera el máximo de ${parametros.plazoMaximoMeses} meses.`);
    }
  }

  return { esExcepcion: razones.length > 0, razones };
}
