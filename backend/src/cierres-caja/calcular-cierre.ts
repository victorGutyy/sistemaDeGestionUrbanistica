import { Prisma } from '../generated/prisma/client.js';
import type { EstadoAbono, EstadoMovimiento, MedioPago, TipoMovimiento } from '../generated/prisma/enums.js';
import { diaEnBogota, diaLocal } from './periodo.js';

// ---------------------------------------------------------------------------------------------
// Cálculo del cierre de caja (RF-CAJ-02, 03 y 05). Es una función pura: recibe las filas ya leídas de la base
// de datos y devuelve los totales; la misma función arma el borrador en vivo y la fotografía al cerrar.
//
// La regla de las anulaciones (RF-CAJ-05) es la que lo hace distinto de un simple "sumar lo vigente":
//   - Todo movimiento cuenta como entrada o salida en SU fecha (cuando se registró).
//   - Si después se anula, la anulación es un movimiento contrario que cuenta en la fecha en que se anuló.
// Así, anular algo que ya estaba en un cierre aprobado no cambia ese cierre: la reversa aparece en el cierre
// del período en que se anuló. Algo registrado y anulado dentro del mismo período queda neto en cero, pero ambos
// pasos se ven en la lista.
// ---------------------------------------------------------------------------------------------

export interface CuentaCaja {
  id: string;
  alias: string;
  banco: string;
}

export interface AbonoCaja {
  id: string;
  fecha: Date;
  valor: Prisma.Decimal;
  medioPago: MedioPago;
  cuenta: CuentaCaja | null;
  estado: EstadoAbono;
  anuladoEn: Date | null;
  recibo: string | null;
  cliente: string;
  lote: string;
  proyecto: string;
}

export interface MovimientoCaja {
  id: string;
  tipo: TipoMovimiento;
  fecha: Date;
  valor: Prisma.Decimal;
  medioPago: MedioPago;
  cuenta: CuentaCaja | null;
  estado: EstadoMovimiento;
  anuladoEn: Date | null;
  descripcion: string;
  categoria: string;
  proyecto: string | null;
}

export interface PagoNominaCaja {
  id: string;
  fechaPago: Date;
  valorPagado: Prisma.Decimal;
  medioPago: MedioPago;
  cuenta: CuentaCaja | null;
  trabajador: string;
}

export interface DatosCierre {
  abonos: AbonoCaja[];
  movimientos: MovimientoCaja[];
  nominas: PagoNominaCaja[];
}

export type OrigenEvento = 'ABONO' | 'INGRESO' | 'EGRESO' | 'NOMINA';

// Una línea de la lista del cierre. "valor" es siempre positivo: el sentido y la clase dicen si suma o resta.
export interface EventoCaja {
  origen: OrigenEvento;
  id: string;
  fecha: string;
  clase: 'REGISTRO' | 'ANULACION';
  sentido: 'ENTRADA' | 'SALIDA';
  valor: string;
  medioPago: MedioPago;
  cuenta: string | null;
  descripcion: string;
  detalle: string | null;
}

export interface TotalesCaja {
  entradasBrutas: string;
  reversasEntradas: string;
  entradas: string;
  salidasBrutas: string;
  reversasSalidas: string;
  salidas: string;
  neto: string;
}

export interface FilaPorMedio {
  medioPago: MedioPago;
  entradas: string;
  salidas: string;
  neto: string;
}

export interface FilaPorCuenta {
  cuentaId: string | null;
  // El efectivo no entra por una cuenta: se agrupa aparte.
  nombre: string;
  entradas: string;
  salidas: string;
  neto: string;
}

export interface ResultadoCierre {
  desde: string;
  hasta: string;
  eventos: EventoCaja[];
  totales: TotalesCaja;
  porMedio: FilaPorMedio[];
  porCuenta: FilaPorCuenta[];
  efectivo: { inicial: string; entradas: string; salidas: string; esperado: string };
}

const CERO = () => new Prisma.Decimal(0);

interface EventoInterno {
  origen: OrigenEvento;
  id: string;
  fecha: string;
  clase: 'REGISTRO' | 'ANULACION';
  sentido: 'ENTRADA' | 'SALIDA';
  valor: Prisma.Decimal;
  medioPago: MedioPago;
  cuenta: CuentaCaja | null;
  descripcion: string;
  detalle: string | null;
}

export function calcularCierre(
  periodo: { desde: string; hasta: string; efectivoInicial: Prisma.Decimal },
  datos: DatosCierre,
): ResultadoCierre {
  const { desde, hasta } = periodo;
  const enPeriodo = (dia: string) => dia >= desde && dia <= hasta;
  const eventos: EventoInterno[] = [];

  // Agrega el registro y, si la fila fue anulada, la anulación; cada uno solo si cae dentro del período.
  function agregar(
    base: Omit<EventoInterno, 'fecha' | 'clase'>,
    fechaRegistro: Date,
    anulada: boolean,
    anuladoEn: Date | null,
  ) {
    const diaRegistro = diaLocal(fechaRegistro);
    if (enPeriodo(diaRegistro)) eventos.push({ ...base, fecha: diaRegistro, clase: 'REGISTRO' });
    if (anulada && anuladoEn) {
      const diaAnulacion = diaEnBogota(anuladoEn);
      if (enPeriodo(diaAnulacion)) eventos.push({ ...base, fecha: diaAnulacion, clase: 'ANULACION' });
    }
  }

  for (const abono of datos.abonos) {
    agregar(
      {
        origen: 'ABONO',
        id: abono.id,
        sentido: 'ENTRADA',
        valor: abono.valor,
        medioPago: abono.medioPago,
        cuenta: abono.cuenta,
        descripcion: `Abono de ${abono.cliente} · Lote ${abono.lote}`,
        detalle: [abono.recibo, abono.proyecto].filter(Boolean).join(' · ') || null,
      },
      abono.fecha,
      abono.estado === 'ANULADO',
      abono.anuladoEn,
    );
  }

  for (const movimiento of datos.movimientos) {
    const esGasto = movimiento.tipo === 'GASTO';
    agregar(
      {
        origen: esGasto ? 'EGRESO' : 'INGRESO',
        id: movimiento.id,
        sentido: esGasto ? 'SALIDA' : 'ENTRADA',
        valor: movimiento.valor,
        medioPago: movimiento.medioPago,
        cuenta: movimiento.cuenta,
        descripcion: movimiento.descripcion,
        detalle: [movimiento.categoria, movimiento.proyecto ?? 'General'].join(' · '),
      },
      movimiento.fecha,
      movimiento.estado === 'ANULADO',
      movimiento.anuladoEn,
    );
  }

  // Los pagos de nómina no se anulan: solo salen.
  for (const pago of datos.nominas) {
    agregar(
      {
        origen: 'NOMINA',
        id: pago.id,
        sentido: 'SALIDA',
        valor: pago.valorPagado,
        medioPago: pago.medioPago,
        cuenta: pago.cuenta,
        descripcion: `Pago de nómina · ${pago.trabajador}`,
        detalle: 'Nómina',
      },
      pago.fechaPago,
      false,
      null,
    );
  }

  eventos.sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.clase === b.clase ? 0 : a.clase === 'REGISTRO' ? -1 : 1) || a.id.localeCompare(b.id));

  // ---- Totales ----
  let entradasBrutas = CERO();
  let reversasEntradas = CERO();
  let salidasBrutas = CERO();
  let reversasSalidas = CERO();
  const porMedio = new Map<MedioPago, { entradas: Prisma.Decimal; salidas: Prisma.Decimal }>();
  const porCuenta = new Map<string, { cuentaId: string | null; nombre: string; entradas: Prisma.Decimal; salidas: Prisma.Decimal }>();

  for (const evento of eventos) {
    const esEntrada = evento.sentido === 'ENTRADA';
    const esReversa = evento.clase === 'ANULACION';
    // Efecto neto sobre el sentido: un registro suma, una anulación resta.
    const efecto = esReversa ? evento.valor.negated() : evento.valor;

    if (esEntrada) {
      if (esReversa) reversasEntradas = reversasEntradas.plus(evento.valor);
      else entradasBrutas = entradasBrutas.plus(evento.valor);
    } else if (esReversa) {
      reversasSalidas = reversasSalidas.plus(evento.valor);
    } else {
      salidasBrutas = salidasBrutas.plus(evento.valor);
    }

    const medio = porMedio.get(evento.medioPago) ?? { entradas: CERO(), salidas: CERO() };
    const claveCuenta = evento.cuenta?.id ?? 'SIN_CUENTA';
    const cuenta = porCuenta.get(claveCuenta) ?? {
      cuentaId: evento.cuenta?.id ?? null,
      nombre: evento.cuenta ? `${evento.cuenta.alias} — ${evento.cuenta.banco}` : 'Efectivo (sin cuenta)',
      entradas: CERO(),
      salidas: CERO(),
    };
    if (esEntrada) {
      medio.entradas = medio.entradas.plus(efecto);
      cuenta.entradas = cuenta.entradas.plus(efecto);
    } else {
      medio.salidas = medio.salidas.plus(efecto);
      cuenta.salidas = cuenta.salidas.plus(efecto);
    }
    porMedio.set(evento.medioPago, medio);
    porCuenta.set(claveCuenta, cuenta);
  }

  const entradas = entradasBrutas.minus(reversasEntradas);
  const salidas = salidasBrutas.minus(reversasSalidas);

  const efectivo = porMedio.get('EFECTIVO') ?? { entradas: CERO(), salidas: CERO() };
  const esperado = periodo.efectivoInicial.plus(efectivo.entradas).minus(efectivo.salidas);

  return {
    desde,
    hasta,
    eventos: eventos.map((evento) => ({ ...evento, valor: evento.valor.toString(), cuenta: evento.cuenta?.alias ?? null })),
    totales: {
      entradasBrutas: entradasBrutas.toString(),
      reversasEntradas: reversasEntradas.toString(),
      entradas: entradas.toString(),
      salidasBrutas: salidasBrutas.toString(),
      reversasSalidas: reversasSalidas.toString(),
      salidas: salidas.toString(),
      neto: entradas.minus(salidas).toString(),
    },
    porMedio: Array.from(porMedio.entries()).map(([medioPago, fila]) => ({
      medioPago,
      entradas: fila.entradas.toString(),
      salidas: fila.salidas.toString(),
      neto: fila.entradas.minus(fila.salidas).toString(),
    })),
    porCuenta: Array.from(porCuenta.values()).map((fila) => ({
      cuentaId: fila.cuentaId,
      nombre: fila.nombre,
      entradas: fila.entradas.toString(),
      salidas: fila.salidas.toString(),
      neto: fila.entradas.minus(fila.salidas).toString(),
    })),
    efectivo: {
      inicial: periodo.efectivoInicial.toString(),
      entradas: efectivo.entradas.toString(),
      salidas: efectivo.salidas.toString(),
      esperado: esperado.toString(),
    },
  };
}
