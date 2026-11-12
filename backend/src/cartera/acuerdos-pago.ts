// Acuerdos de pago de una venta (CC-07). Funciones puras, sin base de datos: dicen cuándo un acuerdo está vigente y
// cuántos días de una mora no causan interés por estar cubiertos por un acuerdo.
//
// Todas las fechas son días de calendario (la hora no cuenta). El último día de un acuerdo (`hastaPrevista`) cuenta como
// parte del acuerdo; si se finaliza a mano (`finalizadoEn`), ese día ya NO está cubierto: desde ahí se reanuda todo.

const MS_POR_DIA = 24 * 60 * 60 * 1000;

export interface AcuerdoDePago {
  desde: Date;
  hastaPrevista: Date | null;
  finalizadoEn: Date | null;
}

// Rango de días cubierto por un acuerdo: [desde, hasta). `hasta` es EXCLUSIVO; null = sigue abierto.
export interface PeriodoSinInteres {
  desde: Date;
  hasta: Date | null;
}

function diaDe(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
}

function masUnDia(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + 1);
}

// Diferencia en días de calendario (hasta - desde), ignorando la hora.
function diasEntre(desde: Date, hasta: Date): number {
  return Math.round((diaDe(hasta).getTime() - diaDe(desde).getTime()) / MS_POR_DIA);
}

// El acuerdo termina en lo que ocurra primero: el día siguiente a la fecha final prevista, o el día en que se finalizó a mano.
export function periodoDelAcuerdo(acuerdo: AcuerdoDePago): PeriodoSinInteres {
  const finales: Date[] = [];
  if (acuerdo.hastaPrevista) finales.push(masUnDia(acuerdo.hastaPrevista));
  if (acuerdo.finalizadoEn) finales.push(diaDe(acuerdo.finalizadoEn));
  const hasta = finales.length > 0 ? new Date(Math.min(...finales.map((f) => f.getTime()))) : null;
  return { desde: diaDe(acuerdo.desde), hasta };
}

export function periodosDeAcuerdos(acuerdos: AcuerdoDePago[]): PeriodoSinInteres[] {
  return acuerdos.map(periodoDelAcuerdo);
}

// ¿Hoy cae dentro de alguno de los acuerdos? Mientras sí, no se envían avisos ni se causa interés de mora.
export function hayAcuerdoVigente(periodos: PeriodoSinInteres[], hoy: Date): boolean {
  const dia = diaDe(hoy);
  return periodos.some((p) => p.desde.getTime() <= dia.getTime() && (p.hasta === null || dia.getTime() < p.hasta.getTime()));
}

// Une los periodos que se tocan o se montan, para no contar dos veces un mismo día.
function unir(periodos: PeriodoSinInteres[]): PeriodoSinInteres[] {
  const ordenados = [...periodos].sort((a, b) => a.desde.getTime() - b.desde.getTime());
  const unidos: PeriodoSinInteres[] = [];
  for (const periodo of ordenados) {
    const ultimo = unidos[unidos.length - 1];
    if (ultimo && (ultimo.hasta === null || periodo.desde.getTime() <= ultimo.hasta.getTime())) {
      if (ultimo.hasta !== null && (periodo.hasta === null || periodo.hasta.getTime() > ultimo.hasta.getTime())) ultimo.hasta = periodo.hasta;
    } else {
      unidos.push({ desde: periodo.desde, hasta: periodo.hasta });
    }
  }
  return unidos;
}

// De los días que causarían interés (los que pasan de la gracia, hasta hoy), cuántos cubre algún acuerdo.
// La cuota vence en `vencimiento`; los días con interés son el día (gracia + 1) después del vencimiento hasta `hoy`.
export function diasCubiertosPorAcuerdos(vencimiento: Date, diasGracia: number, hoy: Date, periodos: PeriodoSinInteres[]): number {
  const ultimoDia = diasEntre(vencimiento, hoy); // índice del último día con interés (hoy)
  const primerDia = Math.max(0, diasGracia) + 1; // índice del primer día con interés
  if (ultimoDia < primerDia || periodos.length === 0) return 0;

  let cubiertos = 0;
  for (const periodo of unir(periodos)) {
    const desde = diasEntre(vencimiento, periodo.desde);
    const hasta = periodo.hasta === null ? ultimoDia + 1 : diasEntre(vencimiento, periodo.hasta);
    cubiertos += Math.max(0, Math.min(ultimoDia + 1, hasta) - Math.max(primerDia, desde));
  }
  return cubiertos;
}

// Anota en cada cuota los periodos de los acuerdos de pago de su venta, para que el cálculo de mora los tenga a mano
// aunque se junten cuotas de varias ventas (ficha del cliente, estado de cuenta).
export function cuotasConAcuerdos<C extends object>(cuotas: C[], acuerdos: AcuerdoDePago[]): (C & { periodosSinInteres: PeriodoSinInteres[] })[] {
  const periodosSinInteres = periodosDeAcuerdos(acuerdos);
  return cuotas.map((cuota) => ({ ...cuota, periodosSinInteres }));
}

export type EstadoAcuerdoPago = 'PROGRAMADO' | 'VIGENTE' | 'FINALIZADO';

// Estado de un acuerdo hoy: programado (todavía no empieza), vigente o finalizado (ya terminó, por fecha o a mano).
export function estadoDelAcuerdo(acuerdo: AcuerdoDePago, hoy: Date): EstadoAcuerdoPago {
  const periodo = periodoDelAcuerdo(acuerdo);
  const dia = diaDe(hoy).getTime();
  if (periodo.hasta !== null && dia >= periodo.hasta.getTime()) return 'FINALIZADO';
  if (periodo.desde.getTime() > dia) return 'PROGRAMADO';
  return 'VIGENTE';
}

// ¿Dos periodos comparten algún día? (Un acuerdo nuevo no puede montarse sobre otro.)
export function periodosSeMontan(a: PeriodoSinInteres, b: PeriodoSinInteres): boolean {
  const terminaAAntesDeB = a.hasta !== null && a.hasta.getTime() <= b.desde.getTime();
  const terminaBAntesDeA = b.hasta !== null && b.hasta.getTime() <= a.desde.getTime();
  return !terminaAAntesDeB && !terminaBAntesDeA;
}
