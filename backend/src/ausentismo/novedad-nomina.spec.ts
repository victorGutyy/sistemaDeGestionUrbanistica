import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { liquidarAusentismo, type ParametrosLiquidacion, type TipoParaLiquidar } from './liquidacion.js';
import { propuestaDeNovedades, type AusentismoParaNovedad } from './novedad-nomina.js';

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
const ACCIDENTE: TipoParaLiquidar = { regla: 'ORIGEN_LABORAL', porcentaje: null, diaEventoComoLaborado: true };
const luto = (porcentaje = 100): TipoParaLiquidar => ({ regla: 'PAGA_EMPLEADOR', porcentaje, diaEventoComoLaborado: false });
const descuento = (porcentaje = 100): TipoParaLiquidar => ({ regla: 'DESCUENTO', porcentaje, diaEventoComoLaborado: false });

const dia = (mes: number, diaDelMes: number, anio = 2026) => new Date(anio, mes - 1, diaDelMes);

// Arma un ausentismo con su foto de parámetros, tal como lo guarda el sistema al registrarlo.
function ausentismo(tipo: TipoParaLiquidar, nombre: string, inicio: Date, fin: Date, salario = 3_000_000, diasPrevios = 0, extra: Partial<AusentismoParaNovedad> = {}): AusentismoParaNovedad {
  const resultado = liquidarAusentismo({ tipo, fechaInicio: inicio, fechaFin: fin, salario, diasPrevios, parametros: PARAMETROS });
  return {
    id: `a-${nombre}-${inicio.getTime()}`,
    numeroDocumento: 'INC-1',
    tipoNombre: nombre,
    esProrroga: diasPrevios > 0,
    corregida: false,
    fechaInicio: inicio,
    fechaFin: fin,
    salarioFoto: new Prisma.Decimal(salario),
    parametrosLiquidacion: { ...resultado.parametrosUsados, anio: 2026, parametrosValidados: false },
    ...extra,
  };
}

describe('propuestaDeNovedades (RF-SST-11)', () => {
  it('propone como incapacidad lo que paga la EPS, a valor diario, y deja los días del empleador sin novedad', () => {
    const [propuesta] = propuestaDeNovedades([ausentismo(ENFERMEDAD_GENERAL, 'Enfermedad general', dia(3, 10), dia(3, 14))], dia(3, 1), dia(3, 31));
    expect(propuesta).toMatchObject({ diasEnPeriodo: 5, desde: '2026-03-10', hasta: '2026-03-14', dias: { empleador: 2, eps: 3 } });
    expect(propuesta.novedades).toEqual([{ tipo: 'INCAPACIDAD', valor: '300000', descripcion: 'Enfermedad general INC-1: 3 de la EPS (del 12/03 al 14/03)' }]);
    expect(propuesta.avisos.join(' ')).toMatch(/2 días a cargo del empleador/);
  });

  it('un período que corta el ausentismo solo cuenta los días que caen en él', () => {
    const a = ausentismo(ENFERMEDAD_GENERAL, 'Enfermedad general', dia(3, 10), dia(3, 14));
    const [parcial] = propuestaDeNovedades([a], dia(3, 12), dia(3, 16));
    expect(parcial).toMatchObject({ diasEnPeriodo: 3, desde: '2026-03-12', hasta: '2026-03-14', dias: { empleador: 0, eps: 3 } });
    expect(parcial.novedades[0].valor).toBe('300000');
    const [soloEmpleador] = propuestaDeNovedades([a], dia(3, 10), dia(3, 11));
    expect(soloEmpleador.dias).toMatchObject({ empleador: 2, eps: 0 });
    expect(soloEmpleador.novedades).toEqual([]);
    expect(soloEmpleador.avisos.join(' ')).toMatch(/No genera novedad/);
  });

  it('un ausentismo que cruza de mes se reparte entre los pagos de cada mes', () => {
    const a = ausentismo(ENFERMEDAD_GENERAL, 'Enfermedad general', dia(3, 30), dia(4, 2));
    expect(propuestaDeNovedades([a], dia(3, 1), dia(3, 31))[0].novedades).toEqual([]); // marzo: los 2 días del empleador
    const [abril] = propuestaDeNovedades([a], dia(4, 1), dia(4, 30));
    expect(abril.dias).toMatchObject({ empleador: 0, eps: 2 });
    expect(abril.novedades[0].valor).toBe('200000');
  });

  it('una prórroga usa los días acumulados: ya pasó el día a cargo del empleador', () => {
    const [propuesta] = propuestaDeNovedades([ausentismo(ENFERMEDAD_GENERAL, 'Enfermedad general', dia(5, 1), dia(5, 5), 3_000_000, 10)], dia(5, 1), dia(5, 7));
    expect(propuesta.dias).toMatchObject({ empleador: 0, eps: 5 });
    expect(propuesta.novedades[0].valor).toBe('500000');
  });

  it('un accidente de trabajo: el día del evento no genera novedad y los de la ARL sí', () => {
    const [propuesta] = propuestaDeNovedades([ausentismo(ACCIDENTE, 'Accidente de trabajo', dia(3, 10), dia(3, 14))], dia(3, 1), dia(3, 31));
    expect(propuesta.dias).toMatchObject({ laborados: 1, arl: 4 });
    expect(propuesta.novedades).toEqual([{ tipo: 'INCAPACIDAD', valor: '400000', descripcion: 'Accidente de trabajo INC-1: 4 de la ARL (del 11/03 al 14/03)' }]);
  });

  it('licencia no remunerada: se propone un descuento del valor de los días', () => {
    const [completo] = propuestaDeNovedades([ausentismo(descuento(), 'Licencia no remunerada', dia(3, 10), dia(3, 11))], dia(3, 1), dia(3, 31));
    expect(completo.novedades).toEqual([{ tipo: 'DESCUENTO', valor: '200000', descripcion: 'Licencia no remunerada INC-1: 2 días a descontar (del 10/03 al 11/03)' }]);
    const [mitad] = propuestaDeNovedades([ausentismo(descuento(50), 'Licencia no remunerada', dia(3, 10), dia(3, 11))], dia(3, 1), dia(3, 31));
    expect(mitad.novedades[0].valor).toBe('100000');
  });

  it('una licencia que paga el empleador no genera novedad', () => {
    const [propuesta] = propuestaDeNovedades([ausentismo(luto(), 'Licencia por luto', dia(3, 10), dia(3, 12))], dia(3, 1), dia(3, 31));
    expect(propuesta.novedades).toEqual([]);
    expect(propuesta.avisos).toEqual(['No genera novedad: los días de este período los paga el empleador o se pagan como laborados.']);
  });

  it('redondea a pesos enteros, mitad hacia arriba', () => {
    const [propuesta] = propuestaDeNovedades([ausentismo(ENFERMEDAD_GENERAL, 'Enfermedad general', dia(3, 10), dia(3, 14), 1_234_567)], dia(3, 1), dia(3, 31));
    expect(propuesta.novedades[0].valor).toBe('123457'); // 3 x 41.152,2333 = 123.456,7
  });

  it('avisa si la liquidación se corrigió a mano o no se puede reconstruir', () => {
    const corregida = ausentismo(ENFERMEDAD_GENERAL, 'Enfermedad general', dia(3, 10), dia(3, 14), 3_000_000, 0, { corregida: true });
    expect(propuestaDeNovedades([corregida], dia(3, 1), dia(3, 31))[0].avisos.join(' ')).toMatch(/corrección manual/);
    const sinFoto = ausentismo(ENFERMEDAD_GENERAL, 'Enfermedad general', dia(3, 10), dia(3, 14), 3_000_000, 0, { parametrosLiquidacion: {} });
    const [propuesta] = propuestaDeNovedades([sinFoto], dia(3, 1), dia(3, 31));
    expect(propuesta.novedades).toEqual([]);
    expect(propuesta.avisos[0]).toMatch(/No se pudo reconstruir/);
  });

  it('deja por fuera lo que no toca el período y ordena por fecha', () => {
    const marzo = ausentismo(ENFERMEDAD_GENERAL, 'Enfermedad general', dia(3, 20), dia(3, 24));
    const febrero = ausentismo(ENFERMEDAD_GENERAL, 'Enfermedad general', dia(2, 2), dia(2, 4));
    const mayo = ausentismo(ENFERMEDAD_GENERAL, 'Enfermedad general', dia(5, 2), dia(5, 4));
    const antes = ausentismo(luto(), 'Licencia por luto', dia(3, 5), dia(3, 6));
    const propuestas = propuestaDeNovedades([marzo, mayo, febrero, antes], dia(2, 1), dia(3, 31));
    expect(propuestas.map((p) => p.desde)).toEqual(['2026-02-02', '2026-03-05', '2026-03-20']);
  });

  it('un período sin ausentismos da una lista vacía', () => {
    expect(propuestaDeNovedades([], dia(3, 1), dia(3, 31))).toEqual([]);
  });
});
