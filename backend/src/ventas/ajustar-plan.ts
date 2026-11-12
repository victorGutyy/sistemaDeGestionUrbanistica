import { EstadoCuota } from '../generated/prisma/enums.js';
import { sumarMeses } from './plan-de-pagos.js';

// Reprogramar las fechas del plan de una venta ya registrada (CC-08). Funciones puras, sin base de datos.
//
// Solo cambian fechas de cuotas que todavía no están pagadas: lo pagado, los valores y el total de la venta no se tocan.
// Las cuotas siguientes a la primera pendiente caen el mismo día de cada mes, igual que al registrar la venta.

export interface CuotaDelPlan {
  id: string;
  numero: number;
  fechaVencimiento: Date;
  estado: EstadoCuota;
}

export interface CambioDeFecha {
  cuotaId: string;
  numero: number;
  antes: Date;
  despues: Date;
}

export interface ReprogramacionPedida {
  /** Nueva fecha límite de la cuota inicial (cuota 0), si todavía no está pagada. */
  fechaCuotaInicial?: Date | null;
  /** Fecha de la primera cuota pendiente (numero >= 1); las siguientes caen el mismo día de cada mes. */
  fechaPrimeraCuotaPendiente?: Date | null;
  /** Fecha de cada cuota que se quiere mover (numero >= 1), cuando el contrato las fija una por una. No se combina con la anterior. */
  fechasPorCuota?: { numero: number; fecha: Date }[] | null;
}

export class ReprogramacionInvalida extends Error {}

const mismoDia = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const dia = (fecha: Date) => new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());

export function calcularReprogramacion(cuotas: CuotaDelPlan[], pedida: ReprogramacionPedida): CambioDeFecha[] {
  const porCuota = pedida.fechasPorCuota?.length ? pedida.fechasPorCuota : null;
  if (!pedida.fechaCuotaInicial && !pedida.fechaPrimeraCuotaPendiente && !porCuota) {
    throw new ReprogramacionInvalida('Indica la nueva fecha de la cuota inicial, la de la primera cuota pendiente o las fechas de las cuotas');
  }
  if (pedida.fechaPrimeraCuotaPendiente && porCuota) {
    throw new ReprogramacionInvalida('Envía las fechas de las cuotas una por una o la fecha de la primera cuota pendiente, no las dos');
  }
  const cambios: CambioDeFecha[] = [];

  if (pedida.fechaCuotaInicial) {
    const cuotaCero = cuotas.find((c) => c.numero === 0);
    if (!cuotaCero) throw new ReprogramacionInvalida('La venta no tiene cuota inicial');
    if (cuotaCero.estado === EstadoCuota.PAGADA) throw new ReprogramacionInvalida('La cuota inicial ya está pagada: no se le cambia la fecha');
    if (!mismoDia(cuotaCero.fechaVencimiento, pedida.fechaCuotaInicial)) {
      cambios.push({ cuotaId: cuotaCero.id, numero: 0, antes: cuotaCero.fechaVencimiento, despues: dia(pedida.fechaCuotaInicial) });
    }
  }

  if (pedida.fechaPrimeraCuotaPendiente) {
    const mensuales = cuotas.filter((c) => c.numero >= 1).sort((a, b) => a.numero - b.numero);
    const pendientes = mensuales.filter((c) => c.estado !== EstadoCuota.PAGADA);
    if (pendientes.length === 0) throw new ReprogramacionInvalida('No quedan cuotas pendientes por reprogramar');
    const base = dia(pedida.fechaPrimeraCuotaPendiente);
    const primera = pendientes[0];
    // Una cuota pagada anterior no puede quedar con fecha posterior a la nueva primera pendiente (el plan se leería al revés).
    const pagadaPosterior = mensuales.find((c) => c.estado === EstadoCuota.PAGADA && c.numero < primera.numero && dia(c.fechaVencimiento).getTime() > base.getTime());
    if (pagadaPosterior) {
      throw new ReprogramacionInvalida(`La fecha no puede ser anterior a la de la cuota ${pagadaPosterior.numero}, que ya está pagada`);
    }
    for (const cuota of pendientes) {
      const despues = sumarMeses(base, cuota.numero - primera.numero);
      if (!mismoDia(cuota.fechaVencimiento, despues)) {
        cambios.push({ cuotaId: cuota.id, numero: cuota.numero, antes: cuota.fechaVencimiento, despues });
      }
    }
  }

  if (porCuota) {
    const mensuales = cuotas.filter((c) => c.numero >= 1).sort((a, b) => a.numero - b.numero);
    const nuevas = new Map<number, Date>();
    for (const { numero, fecha } of porCuota) {
      if (nuevas.has(numero)) throw new ReprogramacionInvalida(`La cuota ${numero} viene repetida`);
      const cuota = mensuales.find((c) => c.numero === numero);
      if (!cuota) throw new ReprogramacionInvalida(`No existe la cuota ${numero}`);
      if (cuota.estado === EstadoCuota.PAGADA) throw new ReprogramacionInvalida(`La cuota ${numero} ya está pagada: no se le cambia la fecha`);
      if (Number.isNaN(fecha.getTime())) throw new ReprogramacionInvalida(`La fecha de la cuota ${numero} no es válida`);
      nuevas.set(numero, dia(fecha));
    }
    // El plan resultante (con lo pagado como está) tiene que seguir en orden: cada cuota vence igual o después que la anterior.
    let anterior: { numero: number; fecha: Date } | null = null;
    for (const cuota of mensuales) {
      const fecha = nuevas.get(cuota.numero) ?? dia(cuota.fechaVencimiento);
      if (anterior && fecha.getTime() < anterior.fecha.getTime()) {
        throw new ReprogramacionInvalida(`La cuota ${cuota.numero} no puede vencer antes que la cuota ${anterior.numero}: las fechas van en orden`);
      }
      anterior = { numero: cuota.numero, fecha };
    }
    for (const [numero, despues] of nuevas) {
      const cuota = mensuales.find((c) => c.numero === numero)!;
      if (!mismoDia(cuota.fechaVencimiento, despues)) cambios.push({ cuotaId: cuota.id, numero, antes: cuota.fechaVencimiento, despues });
    }
  }

  if (cambios.length === 0) throw new ReprogramacionInvalida('Esas fechas ya son las del plan: no hay nada que cambiar');
  return cambios.sort((a, b) => a.numero - b.numero);
}
