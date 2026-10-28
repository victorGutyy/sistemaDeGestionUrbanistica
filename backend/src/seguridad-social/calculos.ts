import { Prisma } from '../generated/prisma/client.js';

// Cálculos de apoyo de la seguridad social (RF-PER-18, CC-03). Son funciones puras: reciben los valores del
// parámetro legal del año y devuelven el resultado, sin tocar la base de datos. Ningún número legal vive aquí.
// No sustituyen a la nómina: el asesor laboral valida las cifras y las reglas.

type Valor = Prisma.Decimal | string | number;

export interface ParametrosAuxilio {
  smmlv: Valor;
  auxilioTransporte: Valor;
  // El auxilio aplica si el salario no supera este número de salarios mínimos.
  topeAuxilioSmmlv: Valor;
}

export interface TramosDeDias {
  diasEmpleador: number;
  diasTramo1Hasta: number;
  diasTramo2Hasta: number;
}

const aPesosEnteros = (valor: Prisma.Decimal) => valor.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);

// El salario máximo con derecho al auxilio de transporte: tope x salario mínimo.
export function salarioMaximoConAuxilio(parametros: ParametrosAuxilio): Prisma.Decimal {
  return new Prisma.Decimal(parametros.smmlv).mul(parametros.topeAuxilioSmmlv);
}

// Un salario igual al tope sí tiene derecho al auxilio.
export function auxilioTransporteAplica(salario: Valor, parametros: ParametrosAuxilio): boolean {
  return new Prisma.Decimal(salario).lessThanOrEqualTo(salarioMaximoConAuxilio(parametros));
}

// Valor mensual del auxilio para ese salario: el del parámetro, o cero si el salario supera el tope.
export function auxilioTransporteDe(salario: Valor, parametros: ParametrosAuxilio): Prisma.Decimal {
  return auxilioTransporteAplica(salario, parametros) ? new Prisma.Decimal(parametros.auxilioTransporte) : new Prisma.Decimal(0);
}

// Aporte a la ARL: base de cotización x tasa de su clase de riesgo (la tasa viene como porcentaje: 0,522 = 0,522 %).
// Se redondea a pesos enteros.
export function aporteArl(baseCotizacion: Valor, tasaPorcentaje: Valor): Prisma.Decimal {
  return aPesosEnteros(new Prisma.Decimal(baseCotizacion).mul(tasaPorcentaje).div(100));
}

// Los tramos de una incapacidad deben ir en orden: empleador < primer tramo < segundo tramo.
// Devuelve el mensaje del error, o null si están bien.
export function errorEnTramos(tramos: TramosDeDias): string | null {
  const { diasEmpleador, diasTramo1Hasta, diasTramo2Hasta } = tramos;
  if (diasEmpleador < 0) return 'Los días a cargo del empleador no pueden ser negativos';
  if (diasEmpleador >= diasTramo1Hasta) return 'Los días a cargo del empleador deben ser menos que los del primer tramo';
  if (diasTramo1Hasta >= diasTramo2Hasta) return 'El primer tramo debe terminar antes que el segundo';
  return null;
}
