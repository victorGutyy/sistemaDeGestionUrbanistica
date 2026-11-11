import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { TipoNovedad } from '../generated/prisma/enums.js';

export interface NovedadParaCalculo {
  tipo: TipoNovedad;
  valor: Prisma.Decimal;
}

// Horas extra suman al pago; descuentos, anticipos e incapacidades restan (todo lo que no sea horas extra resta). Todo en
// pesos (no horas x tarifa) — ver el comentario en schema.prisma sobre
// por qué no se liquidan aquí las reglas legales completas de nómina.
export function calcularValorPagado(salarioBase: Prisma.Decimal, novedades: NovedadParaCalculo[]): Prisma.Decimal {
  return novedades.reduce((valorPagado, novedad) => {
    const signo = novedad.tipo === TipoNovedad.HORAS_EXTRA ? 1 : -1;
    return valorPagado.plus(novedad.valor.mul(signo));
  }, salarioBase);
}

// ---- CC-05: pago por día trabajado (un pago por trabajador, obra y quincena) ----------------------------------------
//
// Topes de digitación, no reglas legales: evitan que un error de tecleo (un cero de más) llegue a pagarse.
export const MAXIMO_DIAS_POR_PAGO = 31;
export const MAXIMO_HORAS_EXTRA_POR_PAGO = 300;

export interface EntradaPagoPorDias {
  /** Días trabajados en la obra durante el período; admite medios días (0,5). */
  dias: Prisma.Decimal;
  /** Valor del día con el que se liquida (foto del valor del trabajador en ese momento). */
  valorDia: Prisma.Decimal;
  horasExtra?: Prisma.Decimal;
  /** Valor de UNA hora extra, digitado por quien liquida (no se calcula con recargos). */
  valorHoraExtra?: Prisma.Decimal;
  /** Descuentos, anticipos o incapacidades (restan) y horas extra en pesos de pagos anteriores (suman). */
  novedades?: NovedadParaCalculo[];
}

export interface ResultadoPagoPorDias {
  /** Días x valor día, en pesos enteros. */
  valorDias: Prisma.Decimal;
  /** Horas extra x valor de la hora, en pesos enteros. */
  valorHorasExtra: Prisma.Decimal;
  /** Días + horas extra: el costo que se carga a la obra. */
  valorDevengado: Prisma.Decimal;
  /** Lo que sale de caja: el devengado menos descuentos y anticipos. */
  valorPagado: Prisma.Decimal;
}

// Todo valor de nómina se paga en pesos enteros: se redondea al peso más cercano (la mitad hacia arriba).
function aPesos(valor: Prisma.Decimal): Prisma.Decimal {
  return valor.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
}

export function calcularPagoPorDias(entrada: EntradaPagoPorDias): ResultadoPagoPorDias {
  const { dias, valorDia } = entrada;
  const horasExtra = entrada.horasExtra ?? new Prisma.Decimal(0);
  const valorHoraExtra = entrada.valorHoraExtra ?? new Prisma.Decimal(0);

  if (dias.lessThanOrEqualTo(0)) throw new BadRequestException('Los días trabajados deben ser mayores a cero');
  if (dias.greaterThan(MAXIMO_DIAS_POR_PAGO)) throw new BadRequestException(`Los días trabajados no pueden pasar de ${MAXIMO_DIAS_POR_PAGO}`);
  if (!dias.mul(2).isInteger()) throw new BadRequestException('Los días se escriben enteros o con medio día (por ejemplo 7 o 7,5)');
  if (valorDia.lessThanOrEqualTo(0)) throw new BadRequestException('El valor del día debe ser mayor a cero');

  if (horasExtra.lessThan(0)) throw new BadRequestException('Las horas extra no pueden ser negativas');
  if (horasExtra.greaterThan(MAXIMO_HORAS_EXTRA_POR_PAGO)) throw new BadRequestException(`Las horas extra no pueden pasar de ${MAXIMO_HORAS_EXTRA_POR_PAGO}`);
  if (horasExtra.decimalPlaces() > 1) throw new BadRequestException('Las horas extra admiten un solo decimal');
  if (valorHoraExtra.lessThan(0)) throw new BadRequestException('El valor de la hora extra no puede ser negativo');
  if (horasExtra.greaterThan(0) && valorHoraExtra.lessThanOrEqualTo(0)) {
    throw new BadRequestException('Indica el valor de la hora extra: hay horas extra sin tarifa');
  }

  const valorDias = aPesos(dias.mul(valorDia));
  const valorHorasExtra = aPesos(horasExtra.mul(valorHoraExtra));
  const valorDevengado = valorDias.plus(valorHorasExtra);
  const valorPagado = calcularValorPagado(valorDevengado, entrada.novedades ?? []);
  if (valorPagado.lessThan(0)) {
    throw new BadRequestException('Los descuentos y anticipos superan lo devengado: el pago no puede quedar negativo');
  }
  return { valorDias, valorHorasExtra, valorDevengado, valorPagado };
}

// El costo que un pago de nómina carga a su obra (CC-05, RF-PER-09 y RF-PER-10): lo devengado (días más horas extra). El anticipo
// y el descuento reducen lo que sale de caja, no lo que cuesta la obra. Un pago anterior a CC-05 no tiene devengado: su costo es lo
// que se pagó.
export function costoDelPago(pago: { valorDevengado: Prisma.Decimal | null; valorPagado: Prisma.Decimal }): Prisma.Decimal {
  return pago.valorDevengado ?? pago.valorPagado;
}
