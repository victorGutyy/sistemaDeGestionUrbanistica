import { Prisma } from '../generated/prisma/client.js';
import { EstadoComision } from '../generated/prisma/enums.js';

// Reglas puras de la comisión de una venta (RF-COM-01 y 02), sin base de datos: se prueban solas.

// Egreso que se crea al pagar la comisión. Es una categoría "del sistema": el gerente no la puede renombrar ni desactivar.
export const CATEGORIA_COMISIONES = 'Comisiones';

// El valor de la comisión sale de la configuración del tipo de vendedor, en pesos enteros. Si el tipo no tiene valor
// configurado (cero o ninguno) no hay comisión que generar: devuelve null.
export function valorDeLaComision(configurado: Prisma.Decimal | null | undefined): Prisma.Decimal | null {
  if (!configurado) return null;
  const enPesos = configurado.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
  return enPesos.greaterThan(0) ? enPesos : null;
}

// Pendiente → pagada o anulada; pagada → anulada; anulada no cambia.
const TRANSICIONES: Record<EstadoComision, EstadoComision[]> = {
  [EstadoComision.PENDIENTE]: [EstadoComision.PAGADA, EstadoComision.ANULADA],
  [EstadoComision.PAGADA]: [EstadoComision.ANULADA],
  [EstadoComision.ANULADA]: [],
};

export function puedeCambiar(desde: EstadoComision, hacia: EstadoComision): boolean {
  return TRANSICIONES[desde].includes(hacia);
}

export const ETIQUETA_ESTADO_COMISION: Record<EstadoComision, string> = {
  [EstadoComision.PENDIENTE]: 'pendiente',
  [EstadoComision.PAGADA]: 'pagada',
  [EstadoComision.ANULADA]: 'anulada',
};

export function descripcionDelPago(datos: { numeroLote: string; nombreVendedor: string }): string {
  return `Comisión de venta · Lote ${datos.numeroLote} · ${datos.nombreVendedor}`;
}
