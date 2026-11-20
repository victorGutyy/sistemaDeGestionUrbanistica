import { sumarMeses } from './plan-de-pagos.js';

// Ampliar el plazo de una venta ya registrada agregando cuotas mensuales al final (CC-08, RF-VEN-17). Funciones puras, sin base de datos.
//
// Solo se AGREGAN cuotas: las que ya existen (pagadas o no) conservan su número y su historial. Reducir el plazo no se hace aquí
// porque una cuota con avisos enviados no se puede borrar sin perder su historial.

/** Tope de digitación para el número de cuotas de un plan (no es una regla del negocio). */
export const MAXIMO_CUOTAS_DEL_PLAN = 240;

export interface CuotaMensualActual {
  numero: number;
  fechaVencimiento: Date;
}

export interface CuotaNueva {
  numero: number;
  fecha: Date;
}

export class AmpliacionInvalida extends Error {}

const dia = (fecha: Date) => new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
const mismoOAnterior = (a: Date, b: Date) => a.getTime() <= b.getTime();

// Las cuotas nuevas desde la última existente hasta `numeroCuotas`. Si no se indica la fecha de una, cae el mismo día de cada mes siguiendo
// la serie de la primera cuota (así un día 30 sigue siendo 30 después de febrero); si eso la dejaría antes de la anterior, un mes después.
// Las fechas ya van con los cambios de fecha de esa misma operación aplicados.
export function calcularCuotasNuevas(cuotasMensuales: CuotaMensualActual[], numeroCuotas: number, fechasPorCuota: { numero: number; fecha: Date }[] = []): CuotaNueva[] {
  if (!Number.isInteger(numeroCuotas) || numeroCuotas < 1) throw new AmpliacionInvalida('El número de cuotas debe ser un entero mayor a cero');
  if (numeroCuotas > MAXIMO_CUOTAS_DEL_PLAN) throw new AmpliacionInvalida(`Un plan no puede pasar de ${MAXIMO_CUOTAS_DEL_PLAN} cuotas`);

  const existentes = cuotasMensuales.filter((c) => c.numero >= 1).sort((a, b) => a.numero - b.numero);
  if (existentes.length === 0) throw new AmpliacionInvalida('La venta no tiene cuotas mensuales a las que agregarles más');
  const primera = existentes[0];
  const ultima = existentes[existentes.length - 1];
  if (numeroCuotas <= ultima.numero) {
    throw new AmpliacionInvalida(`El plan ya tiene ${ultima.numero} cuotas: para ampliar el plazo escribe un número mayor (reducirlo no se hace desde aquí)`);
  }

  const elegidas = new Map<number, Date>();
  for (const { numero, fecha } of fechasPorCuota) {
    if (numero <= ultima.numero || numero > numeroCuotas) {
      throw new AmpliacionInvalida(`La cuota ${numero} no es una de las cuotas nuevas (de la ${ultima.numero + 1} a la ${numeroCuotas})`);
    }
    if (elegidas.has(numero)) throw new AmpliacionInvalida(`La cuota ${numero} viene repetida`);
    if (Number.isNaN(fecha.getTime())) throw new AmpliacionInvalida(`La fecha de la cuota ${numero} no es válida`);
    elegidas.set(numero, dia(fecha));
  }

  const nuevas: CuotaNueva[] = [];
  let previa = dia(ultima.fechaVencimiento);
  for (let numero = ultima.numero + 1; numero <= numeroCuotas; numero++) {
    let fecha = elegidas.get(numero);
    if (fecha) {
      if (!mismoOAnterior(previa, fecha)) {
        throw new AmpliacionInvalida(`La cuota ${numero} no puede vencer antes que la cuota ${numero - 1}: las fechas van en orden`);
      }
    } else {
      fecha = sumarMeses(dia(primera.fechaVencimiento), numero - primera.numero);
      if (!mismoOAnterior(previa, fecha)) fecha = sumarMeses(previa, 1);
    }
    nuevas.push({ numero, fecha });
    previa = fecha;
  }
  return nuevas;
}
