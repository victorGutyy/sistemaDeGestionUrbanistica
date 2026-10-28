import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import {
  diasCalendario,
  errorEnCorreccion,
  errorEnEntrada,
  liquidarAusentismo,
  totalesDe,
  type ParametrosLiquidacion,
  type PeriodoLiquidado,
  type TipoParaLiquidar,
} from './liquidacion.js';

// Parámetros de 2026 como los trae el libro del cliente (sin validar por el asesor): sirven de ejemplo para las pruebas, no
// están escritos en el código de la aplicación.
const PARAMETROS: ParametrosLiquidacion = {
  smmlv: 1_750_905,
  diasBaseMes: 30,
  porcentajeTramo1: 66.67,
  porcentajeTramo2: 50,
  porcentajeLaboral: 100,
  diasEmpleador: 2,
  diasTramo1Hasta: 90,
  diasTramo2Hasta: 180,
};

const ENFERMEDAD_GENERAL: TipoParaLiquidar = { regla: 'INCAPACIDAD_GENERAL', porcentaje: null, diaEventoComoLaborado: false };
const ACCIDENTE_TRABAJO: TipoParaLiquidar = { regla: 'ORIGEN_LABORAL', porcentaje: null, diaEventoComoLaborado: true };
const ENFERMEDAD_LABORAL: TipoParaLiquidar = { regla: 'ORIGEN_LABORAL', porcentaje: null, diaEventoComoLaborado: false };
const MATERNIDAD: TipoParaLiquidar = { regla: 'PAGA_EPS', porcentaje: 100, diaEventoComoLaborado: false };
const luto = (porcentaje = 100): TipoParaLiquidar => ({ regla: 'PAGA_EMPLEADOR', porcentaje, diaEventoComoLaborado: false });
const DESCUENTO: TipoParaLiquidar = { regla: 'DESCUENTO', porcentaje: 100, diaEventoComoLaborado: false };

const SALARIO = 3_000_000; // valor diario 100.000
const SALARIO_MINIMO = 1_750_905; // valor diario 58.363,5 (igual al mínimo diario)

const dia = (anio: number, mes: number, diaDelMes: number) => new Date(anio, mes - 1, diaDelMes);

function liquidar(tipo: TipoParaLiquidar, inicio: Date, fin: Date, salario: number, diasPrevios = 0, parametros = PARAMETROS) {
  return liquidarAusentismo({ tipo, fechaInicio: inicio, fechaFin: fin, salario, diasPrevios, parametros });
}

// Lo esencial de un período, con los valores como texto para compararlos sin errores de punto flotante.
const resumen = (p: PeriodoLiquidado) => ({
  mes: `${p.anio}-${p.mes}`,
  dias: p.dias,
  emp: [p.diasEmpleador, p.valorEmpleador.toString()],
  eps: [p.diasEps, p.valorEps.toString()],
  arl: [p.diasArl, p.valorArl.toString()],
  afp: [p.diasAfp, p.valorAfp.toString()],
  laborados: p.diasLaborados,
  descuento: [p.diasDescuento, p.valorDescuento.toString()],
});

describe('liquidarAusentismo: enfermedad general por tramos (RF-SST-04)', () => {
  it('los dos primeros días los paga el empleador y los demás la EPS, con el porcentaje del primer tramo', () => {
    const r = liquidar(ENFERMEDAD_GENERAL, dia(2026, 3, 10), dia(2026, 3, 14), SALARIO);
    expect(r.periodos).toHaveLength(1);
    expect(resumen(r.periodos[0])).toMatchObject({
      mes: '2026-3',
      dias: 5,
      emp: [2, '133340'], // 2 x 66.670
      eps: [3, '200010'], // 3 x 66.670
      arl: [0, '0'],
      afp: [0, '0'],
    });
    expect(r.baseDiaria.toString()).toBe('100000');
    expect(r.totales.valorEmpleador.plus(r.totales.valorEps).toString()).toBe('333350');
  });

  it('el valor diario nunca baja del salario mínimo diario', () => {
    // Con el salario mínimo, el 66,67 % da 38.909,90 al día: se paga el mínimo diario, 58.363,50.
    const r = liquidar(ENFERMEDAD_GENERAL, dia(2026, 3, 10), dia(2026, 3, 13), SALARIO_MINIMO);
    expect(r.baseDiaria.toString()).toBe('58363.5');
    expect(r.pisoDiario.toString()).toBe('58363.5');
    expect(resumen(r.periodos[0])).toMatchObject({ emp: [2, '116727'], eps: [2, '116727'] });
  });

  it('una prórroga cuenta los días de la incapacidad anterior: el tramo cambia en mitad de la prórroga', () => {
    // Días 89 y 90 al primer porcentaje (66.670 cada uno); 91, 92 y 93 al segundo (50.000 < mínimo: 58.363,50 cada uno).
    const r = liquidar(ENFERMEDAD_GENERAL, dia(2026, 5, 1), dia(2026, 5, 5), SALARIO, 88);
    expect(resumen(r.periodos[0])).toMatchObject({ dias: 5, emp: [0, '0'], eps: [5, '308431'], afp: [0, '0'] }); // 133.340 + 175.090,5
  });

  it('una prórroga que empieza después del día a cargo del empleador ya no lo cobra', () => {
    const r = liquidar(ENFERMEDAD_GENERAL, dia(2026, 5, 1), dia(2026, 5, 3), SALARIO, 5);
    expect(resumen(r.periodos[0])).toMatchObject({ emp: [0, '0'], eps: [3, '200010'] });
  });

  it('desde el día siguiente al último tramo de la EPS paga la AFP', () => {
    // Día 180: la EPS (58.363,50); días 181 y 182: la AFP (2 x 58.363,50).
    const r = liquidar(ENFERMEDAD_GENERAL, dia(2026, 9, 1), dia(2026, 9, 3), SALARIO, 179);
    expect(resumen(r.periodos[0])).toMatchObject({ eps: [1, '58364'], afp: [2, '116727'], emp: [0, '0'] });
  });

  it('los límites de cada tramo son los del parámetro: el día exacto del límite todavía es del tramo anterior', () => {
    const r1 = liquidar(ENFERMEDAD_GENERAL, dia(2026, 1, 1), dia(2026, 1, 1), SALARIO, 1); // día 2
    expect(r1.totales).toMatchObject({ diasEmpleador: 1, diasEps: 0 });
    const r2 = liquidar(ENFERMEDAD_GENERAL, dia(2026, 1, 1), dia(2026, 1, 1), SALARIO, 2); // día 3
    expect(r2.totales).toMatchObject({ diasEmpleador: 0, diasEps: 1 });
    expect(r2.totales.valorEps.toString()).toBe('66670');
    const r3 = liquidar(ENFERMEDAD_GENERAL, dia(2026, 1, 1), dia(2026, 1, 1), SALARIO, 89); // día 90: primer porcentaje
    expect(r3.totales.valorEps.toString()).toBe('66670');
    const r4 = liquidar(ENFERMEDAD_GENERAL, dia(2026, 1, 1), dia(2026, 1, 1), SALARIO, 90); // día 91: segundo porcentaje, con mínimo
    expect(r4.totales.valorEps.toString()).toBe('58364');
    const r5 = liquidar(ENFERMEDAD_GENERAL, dia(2026, 1, 1), dia(2026, 1, 1), SALARIO, 179); // día 180: todavía la EPS
    expect(r5.totales).toMatchObject({ diasEps: 1, diasAfp: 0 });
    const r6 = liquidar(ENFERMEDAD_GENERAL, dia(2026, 1, 1), dia(2026, 1, 1), SALARIO, 180); // día 181: la AFP
    expect(r6.totales).toMatchObject({ diasEps: 0, diasAfp: 1 });
  });

  it('si el parámetro dice 0 días a cargo del empleador, la EPS paga desde el primer día', () => {
    const r = liquidar(ENFERMEDAD_GENERAL, dia(2026, 3, 10), dia(2026, 3, 12), SALARIO, 0, { ...PARAMETROS, diasEmpleador: 0 });
    expect(resumen(r.periodos[0])).toMatchObject({ emp: [0, '0'], eps: [3, '200010'] });
  });

  it('con otros porcentajes y días del parámetro, el resultado cambia (nada está fijo en el código)', () => {
    const otros: ParametrosLiquidacion = { ...PARAMETROS, porcentajeTramo1: 80, diasEmpleador: 3, diasTramo1Hasta: 10 };
    const r = liquidar(ENFERMEDAD_GENERAL, dia(2026, 3, 1), dia(2026, 3, 12), SALARIO, 0, otros);
    // Días 1 a 3: empleador, 3 x 80.000; días 4 a 10: EPS, 7 x 80.000; días 11 y 12: EPS al 50 % (50.000 < mínimo: 58.363,50).
    expect(resumen(r.periodos[0])).toMatchObject({ emp: [3, '240000'], eps: [9, '676727'] }); // 560.000 + 116.727
  });

  it('reparte los días y valores entre los meses cuando el ausentismo cruza de mes (RF-SST-06)', () => {
    const r = liquidar(ENFERMEDAD_GENERAL, dia(2026, 3, 30), dia(2026, 4, 2), SALARIO);
    expect(r.periodos.map(resumen)).toMatchObject([
      { mes: '2026-3', dias: 2, emp: [2, '133340'], eps: [0, '0'] },
      { mes: '2026-4', dias: 2, emp: [0, '0'], eps: [2, '133340'] },
    ]);
    expect(r.totales.dias).toBe(4);
  });

  it('también cruza de año', () => {
    const r = liquidar(ENFERMEDAD_GENERAL, dia(2026, 12, 30), dia(2027, 1, 2), SALARIO);
    expect(r.periodos.map((p) => `${p.anio}-${p.mes}:${p.dias}`)).toEqual(['2026-12:2', '2027-1:2']);
  });

  it('cruza varios meses completos, incluido febrero de un año bisiesto', () => {
    const r = liquidar(ENFERMEDAD_GENERAL, dia(2028, 1, 31), dia(2028, 3, 1), SALARIO);
    expect(r.periodos.map((p) => `${p.anio}-${p.mes}:${p.dias}`)).toEqual(['2028-1:1', '2028-2:29', '2028-3:1']);
    expect(r.totales.dias).toBe(31);
  });
});

describe('liquidarAusentismo: origen laboral (RF-SST-05)', () => {
  it('accidente de trabajo: el día del evento se paga como laborado y la ARL paga desde el siguiente', () => {
    const r = liquidar(ACCIDENTE_TRABAJO, dia(2026, 3, 10), dia(2026, 3, 14), SALARIO);
    expect(resumen(r.periodos[0])).toMatchObject({ dias: 5, laborados: 1, arl: [4, '400000'], emp: [0, '0'], eps: [0, '0'] });
  });

  it('enfermedad laboral: la ARL paga todos los días', () => {
    const r = liquidar(ENFERMEDAD_LABORAL, dia(2026, 3, 10), dia(2026, 3, 14), SALARIO);
    expect(resumen(r.periodos[0])).toMatchObject({ laborados: 0, arl: [5, '500000'] });
  });

  it('una prórroga de un accidente de trabajo ya no tiene día del evento', () => {
    const r = liquidar(ACCIDENTE_TRABAJO, dia(2026, 3, 20), dia(2026, 3, 21), SALARIO, 5);
    expect(resumen(r.periodos[0])).toMatchObject({ laborados: 0, arl: [2, '200000'] });
  });

  it('un accidente de un solo día se paga todo como laborado', () => {
    const r = liquidar(ACCIDENTE_TRABAJO, dia(2026, 3, 10), dia(2026, 3, 10), SALARIO);
    expect(resumen(r.periodos[0])).toMatchObject({ dias: 1, laborados: 1, arl: [0, '0'] });
    expect(r.totales.valorArl.toString()).toBe('0');
  });

  it('el porcentaje de la ARL sale del parámetro y no baja del mínimo diario', () => {
    const r = liquidar(ENFERMEDAD_LABORAL, dia(2026, 3, 10), dia(2026, 3, 11), SALARIO, 0, { ...PARAMETROS, porcentajeLaboral: 90 });
    expect(r.totales.valorArl.toString()).toBe('180000');
    const bajo = liquidar(ENFERMEDAD_LABORAL, dia(2026, 3, 10), dia(2026, 3, 11), 600_000);
    expect(bajo.totales.valorArl.toString()).toBe('116727'); // 2 x 58.363,50 (el mínimo diario, no los 20.000 del salario)
  });
});

describe('liquidarAusentismo: licencias (RF-SST-05)', () => {
  it('maternidad o paternidad: la EPS paga el porcentaje del tipo todos los días, repartido por mes', () => {
    const r = liquidar(MATERNIDAD, dia(2026, 3, 1), dia(2026, 7, 4), SALARIO);
    expect(r.totales).toMatchObject({ dias: 126, diasEps: 126 });
    expect(r.periodos.map((p) => `${p.anio}-${p.mes}:${p.dias}:${p.valorEps.toString()}`)).toEqual([
      '2026-3:31:3100000',
      '2026-4:30:3000000',
      '2026-5:31:3100000',
      '2026-6:30:3000000',
      '2026-7:4:400000',
    ]);
    expect(r.totales.valorEps.toString()).toBe('12600000');
  });

  it('luto, calamidad y permisos: el empleador paga el porcentaje del tipo', () => {
    expect(liquidar(luto(), dia(2026, 3, 10), dia(2026, 3, 12), SALARIO).totales).toMatchObject({ diasEmpleador: 3, valorEmpleador: new Prisma.Decimal(300000) });
    expect(liquidar(luto(50), dia(2026, 3, 10), dia(2026, 3, 12), SALARIO).totales.valorEmpleador.toString()).toBe('150000');
  });

  it('licencia no remunerada y ausencia injustificada: se descuenta el porcentaje del tipo', () => {
    const r = liquidar(DESCUENTO, dia(2026, 3, 10), dia(2026, 3, 11), SALARIO);
    expect(resumen(r.periodos[0])).toMatchObject({ dias: 2, descuento: [2, '200000'], emp: [0, '0'], eps: [0, '0'] });
  });

  it('las licencias no se suben al mínimo diario: pagan lo que dice el tipo', () => {
    const r = liquidar(luto(), dia(2026, 3, 10), dia(2026, 3, 12), 1_000_000);
    expect(r.totales.valorEmpleador.toString()).toBe('100000'); // 3 x 33.333,33
  });

  it('un tipo que necesita porcentaje y no lo trae no se liquida', () => {
    expect(() => liquidar({ regla: 'PAGA_EMPLEADOR', porcentaje: null, diaEventoComoLaborado: false }, dia(2026, 3, 10), dia(2026, 3, 12), SALARIO)).toThrow(/necesita un porcentaje/);
  });
});

describe('liquidarAusentismo: redondeo y valor diario', () => {
  it('redondea a pesos enteros por pagador y mes, no día por día', () => {
    // 1.234.567 / 30 = 41.152,2333...; 5 días = 205.761,1667 -> 205.761.
    const r = liquidar(luto(), dia(2026, 3, 1), dia(2026, 3, 5), 1_234_567);
    expect(r.baseDiaria.toString()).toBe('41152.23');
    expect(r.totales.valorEmpleador.toString()).toBe('205761');
  });

  it('la mitad se redondea hacia arriba', () => {
    expect(liquidar(luto(), dia(2026, 3, 1), dia(2026, 3, 1), 45).totales.valorEmpleador.toString()).toBe('2'); // 1,5
    expect(liquidar(luto(), dia(2026, 3, 1), dia(2026, 3, 1), 75).totales.valorEmpleador.toString()).toBe('3'); // 2,5
  });

  it('el valor diario usa los días base del parámetro', () => {
    const r = liquidar(luto(), dia(2026, 3, 1), dia(2026, 3, 1), 2_800_000, 0, { ...PARAMETROS, diasBaseMes: 28 });
    expect(r.baseDiaria.toString()).toBe('100000');
    expect(r.pisoDiario.toString()).toBe('62532.32'); // 1.750.905 / 28
  });

  it('un salario de cero da valores en cero pero cuenta los días', () => {
    const r = liquidar(luto(), dia(2026, 3, 1), dia(2026, 3, 3), 0);
    expect(r.totales).toMatchObject({ dias: 3, diasEmpleador: 3 });
    expect(r.totales.valorEmpleador.toString()).toBe('0');
  });
});

describe('liquidarAusentismo: lo que queda como foto', () => {
  it('devuelve los parámetros y el tipo usados, listos para guardarse', () => {
    const r = liquidar(luto(80), dia(2026, 3, 1), dia(2026, 3, 2), SALARIO, 0);
    expect(r.parametrosUsados).toEqual({
      regla: 'PAGA_EMPLEADOR',
      porcentajeTipo: '80',
      diaEventoComoLaborado: false,
      diasPrevios: 0,
      smmlv: '1750905',
      diasBaseMes: 30,
      porcentajeTramo1: '66.67',
      porcentajeTramo2: '50',
      porcentajeLaboral: '100',
      diasEmpleador: 2,
      diasTramo1Hasta: 90,
      diasTramo2Hasta: 180,
    });
    // Se puede guardar como JSON sin perder nada.
    expect(JSON.parse(JSON.stringify(r.parametrosUsados))).toEqual(r.parametrosUsados);
  });

  it('la misma liquidación con los mismos datos da siempre el mismo resultado', () => {
    const a = liquidar(ENFERMEDAD_GENERAL, dia(2026, 3, 30), dia(2026, 5, 15), SALARIO, 12);
    const b = liquidar(ENFERMEDAD_GENERAL, dia(2026, 3, 30), dia(2026, 5, 15), SALARIO, 12);
    expect(a.periodos.map(resumen)).toEqual(b.periodos.map(resumen));
  });
});

describe('liquidarAusentismo: invariantes', () => {
  const tipos: [string, TipoParaLiquidar][] = [
    ['enfermedad general', ENFERMEDAD_GENERAL],
    ['accidente de trabajo', ACCIDENTE_TRABAJO],
    ['enfermedad laboral', ENFERMEDAD_LABORAL],
    ['maternidad', MATERNIDAD],
    ['luto', luto()],
    ['descuento', DESCUENTO],
  ];

  it.each(tipos)('%s: los días de cada pagador suman los del mes, y los meses suman el total', (_nombre, tipo) => {
    for (const previos of [0, 1, 2, 89, 90, 179, 180, 300]) {
      for (const duracion of [1, 2, 3, 31, 45, 100]) {
        const inicio = dia(2026, 1, 25);
        const fin = new Date(2026, 0, 25 + duracion - 1);
        const r = liquidar(tipo, inicio, fin, 2_345_678, previos);
        expect(r.totales.dias).toBe(duracion);
        for (const p of r.periodos) {
          expect(p.diasEmpleador + p.diasEps + p.diasArl + p.diasAfp + p.diasLaborados + p.diasDescuento).toBe(p.dias);
          for (const valor of [p.valorEmpleador, p.valorEps, p.valorArl, p.valorAfp, p.valorDescuento]) {
            expect(valor.greaterThanOrEqualTo(0)).toBe(true);
            expect(valor.equals(valor.toDecimalPlaces(0))).toBe(true);
          }
        }
        const suma = totalesDe(r.periodos);
        expect(suma.dias).toBe(duracion);
        expect(suma.valorEps.toString()).toBe(r.totales.valorEps.toString());
      }
    }
  });

  it('en una incapacidad por enfermedad general el pagador solo avanza: empleador, EPS y AFP, nunca hacia atrás', () => {
    const r = liquidar(ENFERMEDAD_GENERAL, dia(2026, 1, 1), dia(2026, 8, 31), SALARIO);
    expect(r.totales.dias).toBe(243);
    expect(r.totales).toMatchObject({ diasEmpleador: 2, diasEps: 178, diasAfp: 63 });
  });

  it('las incapacidades pagan al menos el mínimo diario cada día pagado por entidad', () => {
    const r = liquidar(ENFERMEDAD_GENERAL, dia(2026, 1, 1), dia(2026, 1, 30), SALARIO_MINIMO);
    const pagado = r.totales.valorEmpleador.plus(r.totales.valorEps);
    expect(pagado.greaterThanOrEqualTo(new Prisma.Decimal('58363.5').mul(30).minus(1))).toBe(true);
  });
});

describe('errorEnEntrada: lo que la liquidación no acepta', () => {
  const base = { tipo: ENFERMEDAD_GENERAL, fechaInicio: dia(2026, 3, 10), fechaFin: dia(2026, 3, 12), salario: SALARIO, parametros: PARAMETROS };

  it('acepta una entrada correcta', () => {
    expect(errorEnEntrada(base)).toBeNull();
  });

  it.each([
    ['fecha de fin anterior', { fechaFin: dia(2026, 3, 9) }, /anterior a la de inicio/],
    ['fecha inválida', { fechaInicio: new Date('no es una fecha') }, /no son válidas/],
    ['salario negativo', { salario: -1 }, /negativo/],
    ['días previos negativos', { diasPrevios: -1 }, /días previos/],
    ['días previos con decimales', { diasPrevios: 1.5 }, /días previos/],
    ['días base en cero', { parametros: { ...PARAMETROS, diasBaseMes: 0 } }, /días base/],
    ['salario mínimo en cero', { parametros: { ...PARAMETROS, smmlv: 0 } }, /salario mínimo/],
    ['porcentaje del parámetro mayor a 100', { parametros: { ...PARAMETROS, porcentajeTramo1: 120 } }, /entre 0 y 100/],
    ['tramos desordenados', { parametros: { ...PARAMETROS, diasTramo1Hasta: 1 } }, /empleador/],
    ['porcentaje del tipo mayor a 100', { tipo: luto(150) }, /entre 0 y 100/],
  ])('%s', (_caso, cambio, mensaje) => {
    const entrada = { ...base, ...cambio };
    expect(errorEnEntrada(entrada)).toMatch(mensaje);
    expect(() => liquidarAusentismo(entrada)).toThrow(mensaje);
  });
});

describe('diasCalendario', () => {
  it('cuenta el primer y el último día', () => {
    expect(diasCalendario(dia(2026, 3, 10), dia(2026, 3, 10))).toBe(1);
    expect(diasCalendario(dia(2026, 3, 10), dia(2026, 3, 14))).toBe(5);
    expect(diasCalendario(dia(2026, 2, 27), dia(2026, 3, 2))).toBe(4);
    expect(diasCalendario(dia(2028, 2, 28), dia(2028, 3, 1))).toBe(3); // año bisiesto
  });

  it('no se descuadra con la hora del día', () => {
    expect(diasCalendario(new Date(2026, 2, 10, 23, 59), new Date(2026, 2, 11, 0, 1))).toBe(2);
  });
});

describe('errorEnCorreccion: la corrección manual de una liquidación (RF-SST-08)', () => {
  const original = liquidar(ENFERMEDAD_GENERAL, dia(2026, 3, 30), dia(2026, 4, 2), SALARIO).periodos;
  const copia = () => original.map((p) => ({ ...p }));

  it('acepta cambiar los valores y cómo se reparten los días entre pagadores', () => {
    const corregida = copia();
    corregida[0].valorEps = new Prisma.Decimal(150000);
    corregida[1].diasEps = 1;
    corregida[1].diasAfp = 1;
    expect(errorEnCorreccion(original, corregida)).toBeNull();
  });

  it('no acepta cambiar los meses ni los días totales de un mes', () => {
    expect(errorEnCorreccion(original, [copia()[0]])).toMatch(/mismos meses/);
    const otroTotal = copia();
    otroTotal[0].dias = 9;
    expect(errorEnCorreccion(original, otroTotal)).toMatch(/no se pueden cambiar/);
    const otroMes = copia();
    otroMes[1].mes = 7;
    expect(errorEnCorreccion(original, otroMes)).toMatch(/Falta el mes/);
  });

  it('los días de los pagadores deben seguir sumando el total del mes', () => {
    const corregida = copia();
    corregida[0].diasEps = 1; // 2 del empleador + 1 de la EPS = 3, y el mes tiene 2
    expect(errorEnCorreccion(original, corregida)).toMatch(/deben sumar 2/);
  });

  it('no acepta valores ni días negativos o con decimales', () => {
    const negativo = copia();
    negativo[0].valorEmpleador = new Prisma.Decimal(-1);
    expect(errorEnCorreccion(original, negativo)).toMatch(/negativos/);
    const decimales = copia();
    decimales[0].diasEmpleador = 1.5;
    expect(errorEnCorreccion(original, decimales)).toMatch(/enteros sin signo/);
  });
});
