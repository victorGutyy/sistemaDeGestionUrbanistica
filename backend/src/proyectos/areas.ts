import { Prisma } from '../generated/prisma/client.js';

type Cantidad = Prisma.Decimal | string | number;

export interface ResumenAreas {
  areaTotal: Prisma.Decimal;
  // Suma del área de todos los lotes creados (incluye vendidos y desistidos: siguen ocupando terreno).
  areaSubdividida: Prisma.Decimal;
  // Puede ser negativa si los lotes ya superan el área del proyecto: se muestra tal cual para que se note.
  areaDisponible: Prisma.Decimal;
}

export function calcularResumenAreas(areaTotal: Cantidad, areasDeLotes: Cantidad[]): ResumenAreas {
  const total = new Prisma.Decimal(areaTotal);
  const subdividida = areasDeLotes.reduce<Prisma.Decimal>((suma, area) => suma.plus(area), new Prisma.Decimal(0));
  return { areaTotal: total, areaSubdividida: subdividida, areaDisponible: total.minus(subdividida) };
}
