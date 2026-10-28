import { Prisma } from '../generated/prisma/client.js';
import { EntidadRecobro, EstadoRecobro } from '../generated/prisma/enums.js';

// Seguimiento del cobro de una incapacidad a la entidad que la reconoce (RF-SST-09). El sistema solo lleva el seguimiento:
// no transmite nada a la EPS, la ARL ni el fondo de pensiones. Funciones puras.

export interface DatosDeRecobro {
  estado: EstadoRecobro;
  valorReconocido?: string | null;
  fechaRadicacion?: Date | null;
  fechaPago?: Date | null;
  observaciones?: string | null;
}

// Cómo se nombra la entidad en una frase: "a cargo de la EPS", "el recobro a la EPS" (con "de" y "a" ya contraídos).
export const ETIQUETA_ENTIDAD_RECOBRO: Record<EntidadRecobro, { de: string; a: string }> = {
  EPS: { de: 'de la EPS', a: 'a la EPS' },
  ARL: { de: 'de la ARL', a: 'a la ARL' },
  AFP: { de: 'del fondo de pensiones', a: 'al fondo de pensiones' },
};

const SIN_HORA = (fecha: Date) => new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()).getTime();

// Cada estado exige sus datos (la base de datos lo exige igual). Devuelve el primer error, o null si está bien:
//  - pendiente: todavía no se ha radicado, sin fechas;
//  - radicada: con la fecha en que se radicó y sin fecha de pago;
//  - pagada: con las dos fechas (el pago no es anterior a la radicación) y el valor reconocido;
//  - rechazada: con la fecha de radicación y el motivo del rechazo en las observaciones.
export function errorEnRecobro(datos: DatosDeRecobro): string | null {
  const { estado, valorReconocido, fechaRadicacion, fechaPago, observaciones } = datos;
  if (valorReconocido !== undefined && valorReconocido !== null && new Prisma.Decimal(valorReconocido).lessThan(0)) {
    return 'El valor reconocido no puede ser negativo';
  }
  switch (estado) {
    case EstadoRecobro.PENDIENTE:
      if (fechaRadicacion || fechaPago) return 'Un recobro pendiente no tiene fechas: si ya se radicó, márcalo como radicado';
      return null;
    case EstadoRecobro.RADICADA:
      if (!fechaRadicacion) return 'Indica la fecha en que se radicó el cobro';
      if (fechaPago) return 'Un recobro radicado no tiene fecha de pago: si ya pagaron, márcalo como pagado';
      return null;
    case EstadoRecobro.PAGADA:
      if (!fechaRadicacion) return 'Indica la fecha en que se radicó el cobro';
      if (!fechaPago) return 'Indica la fecha en que pagaron';
      if (SIN_HORA(fechaPago) < SIN_HORA(fechaRadicacion)) return 'La fecha de pago no puede ser anterior a la de radicación';
      if (valorReconocido === undefined || valorReconocido === null) return 'Indica el valor que reconoció la entidad';
      return null;
    case EstadoRecobro.RECHAZADA:
      if (!fechaRadicacion) return 'Indica la fecha en que se radicó el cobro';
      if (fechaPago) return 'Un recobro rechazado no tiene fecha de pago';
      if (!observaciones || observaciones.trim() === '') return 'Escribe el motivo del rechazo en las observaciones';
      return null;
  }
}

// Lo que se espera cobrar a una entidad: la suma de lo que le corresponde pagar en cada mes de la liquidación vigente.
export function valorEsperadoPara(
  entidad: EntidadRecobro,
  periodos: readonly { valorEps: Prisma.Decimal; valorArl: Prisma.Decimal; valorAfp: Prisma.Decimal }[],
): Prisma.Decimal {
  const campo = entidad === EntidadRecobro.EPS ? 'valorEps' : entidad === EntidadRecobro.ARL ? 'valorArl' : 'valorAfp';
  return periodos.reduce((suma, periodo) => suma.plus(periodo[campo]), new Prisma.Decimal(0));
}

// Días que le tocan a una entidad en la liquidación vigente: sin ellos no tiene sentido hacerle un recobro.
export function diasDeLaEntidad(
  entidad: EntidadRecobro,
  periodos: readonly { diasEps: number; diasArl: number; diasAfp: number }[],
): number {
  const campo = entidad === EntidadRecobro.EPS ? 'diasEps' : entidad === EntidadRecobro.ARL ? 'diasArl' : 'diasAfp';
  return periodos.reduce((suma, periodo) => suma + periodo[campo], 0);
}
