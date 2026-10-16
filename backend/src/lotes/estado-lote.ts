import { ConflictException } from '@nestjs/common';
import { EstadoLote } from '../generated/prisma/enums.js';

// Máquina de estados del lote (RF-PRY-05 y RF-PRY-06).
//
// El estado de un lote NUNCA se cambia escribiendo el campo directamente: solo
// mediante una de estas acciones, que valida la transición, registra quién y
// cuándo (LoteHistorial) y falla si otro usuario cambió el lote en el mismo instante.
//
//   DISPONIBLE --separar--> SEPARADO --liberar--> DISPONIBLE
//   DISPONIBLE / SEPARADO --vender--> VENDIDO --escriturar--> ESCRITURADO
//   VENDIDO --desistir--> DESISTIDO --reponer (solo gerente)--> DISPONIBLE

export type AccionLote = 'SEPARAR' | 'LIBERAR' | 'VENDER' | 'ESCRITURAR' | 'DESISTIR' | 'REPONER';

interface Transicion {
  desde: EstadoLote[];
  hacia: EstadoLote;
  verbo: string;
}

export const TRANSICIONES: Record<AccionLote, Transicion> = {
  SEPARAR: { desde: [EstadoLote.DISPONIBLE], hacia: EstadoLote.SEPARADO, verbo: 'separar' },
  LIBERAR: { desde: [EstadoLote.SEPARADO], hacia: EstadoLote.DISPONIBLE, verbo: 'liberar la separación de' },
  VENDER: { desde: [EstadoLote.DISPONIBLE, EstadoLote.SEPARADO], hacia: EstadoLote.VENDIDO, verbo: 'vender' },
  ESCRITURAR: { desde: [EstadoLote.VENDIDO], hacia: EstadoLote.ESCRITURADO, verbo: 'escriturar' },
  DESISTIR: { desde: [EstadoLote.VENDIDO], hacia: EstadoLote.DESISTIDO, verbo: 'registrar el desistimiento de' },
  REPONER: { desde: [EstadoLote.DESISTIDO], hacia: EstadoLote.DISPONIBLE, verbo: 'volver a poner a la venta' },
};

export const ETIQUETA_ESTADO_LOTE: Record<EstadoLote, string> = {
  DISPONIBLE: 'Disponible',
  SEPARADO: 'Separado',
  VENDIDO: 'Vendido',
  ESCRITURADO: 'Escriturado',
  DESISTIDO: 'Desistido',
};

// Un lote vendido o escriturado ya tiene una venta con su propio valor: su precio y área no se editan.
export const ESTADOS_CON_VENTA: EstadoLote[] = [EstadoLote.VENDIDO, EstadoLote.ESCRITURADO];

// Acciones que una persona ejecuta desde la ficha del lote. Vender y desistir las hacen la venta y el desistimiento.
export const ACCIONES_MANUALES: AccionLote[] = ['SEPARAR', 'LIBERAR', 'ESCRITURAR', 'REPONER'];

export function puedeAplicar(estado: EstadoLote, accion: AccionLote): boolean {
  return TRANSICIONES[accion].desde.includes(estado);
}

export function estadoResultante(estado: EstadoLote, accion: AccionLote, numeroLote: string): EstadoLote {
  const transicion = TRANSICIONES[accion];
  if (!transicion.desde.includes(estado)) {
    throw new ConflictException(
      `No se puede ${transicion.verbo} el lote ${numeroLote}: está ${ETIQUETA_ESTADO_LOTE[estado].toLowerCase()}`,
    );
  }
  return transicion.hacia;
}

// Acciones manuales que tienen sentido para el estado actual (para mostrar los botones de la ficha).
export function accionesDisponibles(estado: EstadoLote): AccionLote[] {
  return ACCIONES_MANUALES.filter((accion) => puedeAplicar(estado, accion));
}
