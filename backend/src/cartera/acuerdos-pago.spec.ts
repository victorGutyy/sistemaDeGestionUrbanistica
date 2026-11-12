import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoCuota } from '../generated/prisma/enums.js';
import { cuotasConAcuerdos, diasCubiertosPorAcuerdos, estadoDelAcuerdo, hayAcuerdoVigente, periodoDelAcuerdo, periodosDeAcuerdos, periodosSeMontan } from './acuerdos-pago.js';
import { evaluarCuotaPendiente } from './mora.js';

const d = (anio: number, mes: number, dia: number) => new Date(anio, mes - 1, dia);

describe('periodo de un acuerdo de pago', () => {
  it('sin fecha final ni finalización queda abierto', () => {
    const p = periodoDelAcuerdo({ desde: d(2026, 3, 1), hastaPrevista: null, finalizadoEn: null });
    expect(p.desde).toEqual(d(2026, 3, 1));
    expect(p.hasta).toBeNull();
  });

  it('el último día previsto cuenta como parte del acuerdo (termina el día siguiente)', () => {
    const p = periodoDelAcuerdo({ desde: d(2026, 3, 1), hastaPrevista: d(2026, 3, 31), finalizadoEn: null });
    expect(p.hasta).toEqual(d(2026, 4, 1));
  });

  it('al finalizarlo a mano, ese día ya no está cubierto', () => {
    const p = periodoDelAcuerdo({ desde: d(2026, 3, 1), hastaPrevista: null, finalizadoEn: d(2026, 3, 20) });
    expect(p.hasta).toEqual(d(2026, 3, 20));
  });

  it('termina en lo que ocurra primero: la fecha prevista o la finalización', () => {
    const antes = periodoDelAcuerdo({ desde: d(2026, 3, 1), hastaPrevista: d(2026, 3, 31), finalizadoEn: d(2026, 3, 10) });
    expect(antes.hasta).toEqual(d(2026, 3, 10));
    const despues = periodoDelAcuerdo({ desde: d(2026, 3, 1), hastaPrevista: d(2026, 3, 10), finalizadoEn: d(2026, 3, 25) });
    expect(despues.hasta).toEqual(d(2026, 3, 11));
  });

  it('ignora la hora del día', () => {
    const p = periodoDelAcuerdo({ desde: new Date(2026, 2, 1, 15, 40), hastaPrevista: new Date(2026, 2, 31, 23, 59), finalizadoEn: null });
    expect(p.desde).toEqual(d(2026, 3, 1));
    expect(p.hasta).toEqual(d(2026, 4, 1));
  });
});

describe('acuerdo vigente', () => {
  const periodos = periodosDeAcuerdos([{ desde: d(2026, 3, 1), hastaPrevista: d(2026, 3, 31), finalizadoEn: null }]);

  it('antes de empezar no está vigente', () => expect(hayAcuerdoVigente(periodos, d(2026, 2, 28))).toBe(false));
  it('el primer día sí', () => expect(hayAcuerdoVigente(periodos, d(2026, 3, 1))).toBe(true));
  it('el último día previsto todavía sí (aunque sea a las 11 de la noche)', () => expect(hayAcuerdoVigente(periodos, new Date(2026, 2, 31, 23, 0))).toBe(true));
  it('al día siguiente se reanuda', () => expect(hayAcuerdoVigente(periodos, d(2026, 4, 1))).toBe(false));
  it('un acuerdo abierto sigue vigente', () => {
    expect(hayAcuerdoVigente(periodosDeAcuerdos([{ desde: d(2026, 3, 1), hastaPrevista: null, finalizadoEn: null }]), d(2027, 1, 1))).toBe(true);
  });
  it('sin acuerdos no hay nada vigente', () => expect(hayAcuerdoVigente([], d(2026, 3, 15))).toBe(false));
});

describe('días de interés cubiertos por un acuerdo', () => {
  // Cuota que vence el 1 de abril. Sin gracia, el primer día con interés es el 2 de abril.
  const vence = d(2026, 4, 1);

  it('un acuerdo abierto desde antes del vencimiento cubre todos los días de mora', () => {
    const periodos = periodosDeAcuerdos([{ desde: d(2026, 3, 1), hastaPrevista: null, finalizadoEn: null }]);
    expect(diasCubiertosPorAcuerdos(vence, 0, d(2026, 4, 11), periodos)).toBe(10);
  });

  it('un acuerdo que termina cubre solo sus días y el interés vuelve a contarse después', () => {
    // Acuerdo hasta el 5 de abril (inclusive): cubre del 2 al 5 = 4 días; hasta el 11 hay 10 días de mora.
    const periodos = periodosDeAcuerdos([{ desde: d(2026, 3, 1), hastaPrevista: d(2026, 4, 5), finalizadoEn: null }]);
    expect(diasCubiertosPorAcuerdos(vence, 0, d(2026, 4, 11), periodos)).toBe(4);
  });

  it('un acuerdo que empieza en plena mora cubre solo desde su inicio', () => {
    const periodos = periodosDeAcuerdos([{ desde: d(2026, 4, 6), hastaPrevista: null, finalizadoEn: null }]);
    expect(diasCubiertosPorAcuerdos(vence, 0, d(2026, 4, 11), periodos)).toBe(6); // 6 al 11
  });

  it('los días de gracia no se cuentan dos veces como cubiertos', () => {
    // Gracia de 3 días: el interés empieza el 5 de abril. Un acuerdo del 1 al 4 de abril no cubre ningún día con interés.
    const periodos = periodosDeAcuerdos([{ desde: d(2026, 3, 1), hastaPrevista: d(2026, 4, 4), finalizadoEn: null }]);
    expect(diasCubiertosPorAcuerdos(vence, 3, d(2026, 4, 11), periodos)).toBe(0);
  });

  it('dos acuerdos que se montan no cuentan el mismo día dos veces', () => {
    const periodos = periodosDeAcuerdos([
      { desde: d(2026, 4, 2), hastaPrevista: d(2026, 4, 6), finalizadoEn: null },
      { desde: d(2026, 4, 4), hastaPrevista: d(2026, 4, 9), finalizadoEn: null },
    ]);
    expect(diasCubiertosPorAcuerdos(vence, 0, d(2026, 4, 11), periodos)).toBe(8); // del 2 al 9
  });

  it('dos acuerdos separados suman sus días', () => {
    const periodos = periodosDeAcuerdos([
      { desde: d(2026, 4, 2), hastaPrevista: d(2026, 4, 3), finalizadoEn: null },
      { desde: d(2026, 4, 8), hastaPrevista: d(2026, 4, 9), finalizadoEn: null },
    ]);
    expect(diasCubiertosPorAcuerdos(vence, 0, d(2026, 4, 11), periodos)).toBe(4);
  });

  it('una cuota que todavía no vence no tiene días cubiertos', () => {
    const periodos = periodosDeAcuerdos([{ desde: d(2026, 3, 1), hastaPrevista: null, finalizadoEn: null }]);
    expect(diasCubiertosPorAcuerdos(vence, 0, d(2026, 3, 20), periodos)).toBe(0);
  });

  it('un acuerdo futuro todavía no cubre nada', () => {
    const periodos = periodosDeAcuerdos([{ desde: d(2026, 5, 1), hastaPrevista: null, finalizadoEn: null }]);
    expect(diasCubiertosPorAcuerdos(vence, 0, d(2026, 4, 11), periodos)).toBe(0);
  });
});

describe('interés de mora con acuerdo de pago', () => {
  const cuota = { estado: EstadoCuota.PENDIENTE, fechaVencimiento: d(2026, 4, 1), valor: new Prisma.Decimal(1_000_000) };
  const tasa = new Prisma.Decimal(3); // 3 % mensual: 1.000 por día sobre 1.000.000
  const hoy = d(2026, 4, 11); // 10 días de atraso

  it('sin acuerdo cobra los 10 días', () => {
    const r = evaluarCuotaPendiente(cuota, [], hoy, { tasaMoraMensual: tasa, diasGracia: 0 });
    expect(r?.interesMora.toNumber()).toBe(10_000);
  });

  it('con un acuerdo abierto no causa interés, pero sigue vencida y con sus días de atraso reales', () => {
    const periodos = periodosDeAcuerdos([{ desde: d(2026, 3, 20), hastaPrevista: null, finalizadoEn: null }]);
    const r = evaluarCuotaPendiente({ ...cuota, periodosSinInteres: periodos }, [], hoy, { tasaMoraMensual: tasa, diasGracia: 0 });
    expect(r?.interesMora.toNumber()).toBe(0);
    expect(r?.vencida).toBe(true);
    expect(r?.diasAtraso).toBe(10);
    expect(r?.saldo.toNumber()).toBe(1_000_000);
  });

  it('al terminar el acuerdo el interés cuenta solo desde ese día, sin retroactivo', () => {
    // Finalizado el 6 de abril: cubre del 2 al 5 (4 días). Quedan 6 días con interés.
    const periodos = periodosDeAcuerdos([{ desde: d(2026, 3, 20), hastaPrevista: null, finalizadoEn: d(2026, 4, 6) }]);
    const r = evaluarCuotaPendiente({ ...cuota, periodosSinInteres: periodos }, [], hoy, { tasaMoraMensual: tasa, diasGracia: 0 });
    expect(r?.interesMora.toNumber()).toBe(6_000);
  });

  it('la cuota pagada no se evalúa', () => {
    const pagada = { ...cuota, estado: EstadoCuota.PAGADA };
    expect(evaluarCuotaPendiente({ ...pagada, periodosSinInteres: [] }, [], hoy, { tasaMoraMensual: tasa, diasGracia: 0 })).toBeNull();
  });
});

describe('estado de un acuerdo', () => {
  it('programado, vigente y finalizado según el día', () => {
    const acuerdo = { desde: d(2026, 3, 10), hastaPrevista: d(2026, 3, 20), finalizadoEn: null };
    expect(estadoDelAcuerdo(acuerdo, d(2026, 3, 9))).toBe('PROGRAMADO');
    expect(estadoDelAcuerdo(acuerdo, d(2026, 3, 10))).toBe('VIGENTE');
    expect(estadoDelAcuerdo(acuerdo, d(2026, 3, 20))).toBe('VIGENTE');
    expect(estadoDelAcuerdo(acuerdo, d(2026, 3, 21))).toBe('FINALIZADO');
  });

  it('finalizado a mano deja de estar vigente ese mismo día', () => {
    const acuerdo = { desde: d(2026, 3, 1), hastaPrevista: null, finalizadoEn: d(2026, 3, 15) };
    expect(estadoDelAcuerdo(acuerdo, d(2026, 3, 14))).toBe('VIGENTE');
    expect(estadoDelAcuerdo(acuerdo, d(2026, 3, 15))).toBe('FINALIZADO');
  });
});

describe('periodos que se montan', () => {
  const p = (desde: Date, hasta: Date | null) => ({ desde, hasta });
  it('dos que comparten un día se montan', () => expect(periodosSeMontan(p(d(2026, 3, 1), d(2026, 3, 10)), p(d(2026, 3, 9), null))).toBe(true));
  it('uno que empieza justo cuando el otro termina no se monta (el fin es exclusivo)', () => {
    expect(periodosSeMontan(p(d(2026, 3, 1), d(2026, 3, 10)), p(d(2026, 3, 10), null))).toBe(false);
  });
  it('uno abierto choca con cualquiera posterior', () => expect(periodosSeMontan(p(d(2026, 3, 1), null), p(d(2027, 1, 1), null))).toBe(true));
  it('dos separados no se montan', () => expect(periodosSeMontan(p(d(2026, 3, 1), d(2026, 3, 5)), p(d(2026, 3, 8), d(2026, 3, 9)))).toBe(false));
});

describe('anotar los periodos en las cuotas', () => {
  it('cada cuota recibe los periodos de los acuerdos de su venta y conserva sus datos', () => {
    const cuotas = [{ numero: 1 }, { numero: 2 }];
    const anotadas = cuotasConAcuerdos(cuotas, [{ desde: d(2026, 3, 1), hastaPrevista: null, finalizadoEn: null }]);
    expect(anotadas.map((c) => c.numero)).toEqual([1, 2]);
    expect(anotadas[0].periodosSinInteres).toEqual([{ desde: d(2026, 3, 1), hasta: null }]);
  });

  it('sin acuerdos deja una lista vacía (no cambia nada)', () => {
    expect(cuotasConAcuerdos([{ numero: 1 }], [])[0].periodosSinInteres).toEqual([]);
  });
});
