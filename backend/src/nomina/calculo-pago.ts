import { Prisma } from '../generated/prisma/client.js';
import { TipoNovedad } from '../generated/prisma/enums.js';

export interface NovedadParaCalculo {
  tipo: TipoNovedad;
  valor: Prisma.Decimal;
}

// Horas extra suman al pago; descuentos e incapacidades restan. Todo en
// pesos (no horas x tarifa) — ver el comentario en schema.prisma sobre
// por qué no se liquidan aquí las reglas legales completas de nómina.
export function calcularValorPagado(salarioBase: Prisma.Decimal, novedades: NovedadParaCalculo[]): Prisma.Decimal {
  return novedades.reduce((valorPagado, novedad) => {
    const signo = novedad.tipo === TipoNovedad.HORAS_EXTRA ? 1 : -1;
    return valorPagado.plus(novedad.valor.mul(signo));
  }, salarioBase);
}
