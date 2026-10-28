import { describe, expect, it } from 'vitest';
import { sumarAnios } from './fechas.js';
import { actividadesParaCopiar, alertaDeFechaLimite, coberturaDeCapacitacion, cronogramaMensual, resumenDelPlan } from './plan.js';

const dia = (mes: number, diaDelMes: number, anio = 2026) => new Date(anio, mes - 1, diaDelMes);

describe('sumarAnios', () => {
  it('conserva mes y día', () => {
    expect(sumarAnios(dia(5, 17), 1)).toEqual(dia(5, 17, 2027));
    expect(sumarAnios(dia(5, 17), -1)).toEqual(dia(5, 17, 2025));
  });

  it('el 29 de febrero pasa al último día de febrero de un año no bisiesto, y se mantiene en uno bisiesto', () => {
    expect(sumarAnios(dia(2, 29, 2028), 1)).toEqual(dia(2, 28, 2029));
    expect(sumarAnios(dia(2, 29, 2028), 4)).toEqual(dia(2, 29, 2032));
  });
});

describe('alertaDeFechaLimite (RF-SST-16 y 20)', () => {
  const hoy = dia(6, 10);

  it('al día cuando falta más que la anticipación', () => {
    expect(alertaDeFechaLimite(dia(7, 10), 'PROGRAMADA', hoy, 15)).toEqual({ alerta: 'AL_DIA', diasRestantes: 30 });
  });

  it('próxima cuando faltan la anticipación o menos, incluido el mismo día', () => {
    expect(alertaDeFechaLimite(dia(6, 25), 'EN_EJECUCION', hoy, 15)).toEqual({ alerta: 'PROXIMA', diasRestantes: 15 });
    expect(alertaDeFechaLimite(dia(6, 10), 'PROGRAMADA', hoy, 15)).toEqual({ alerta: 'PROXIMA', diasRestantes: 0 });
  });

  it('vencida desde el día siguiente a la fecha límite', () => {
    expect(alertaDeFechaLimite(dia(6, 9), 'PROGRAMADA', hoy, 15)).toEqual({ alerta: 'VENCIDA', diasRestantes: -1 });
  });

  it('una reprogramada sigue alertando', () => {
    expect(alertaDeFechaLimite(dia(6, 1), 'REPROGRAMADA', hoy, 15).alerta).toBe('VENCIDA');
  });

  it('ejecutada o cancelada nunca alerta, aunque la fecha ya pasó', () => {
    for (const estado of ['EJECUTADA', 'CANCELADA'] as const) {
      expect(alertaDeFechaLimite(dia(1, 1), estado, hoy, 15)).toEqual({ alerta: 'SIN_ALERTA', diasRestantes: null });
    }
  });

  it('respeta la anticipación configurada', () => {
    expect(alertaDeFechaLimite(dia(6, 20), 'PROGRAMADA', hoy, 5).alerta).toBe('AL_DIA');
    expect(alertaDeFechaLimite(dia(6, 20), 'PROGRAMADA', hoy, 10).alerta).toBe('PROXIMA');
  });
});

describe('cronogramaMensual (RF-SST-16)', () => {
  const meses = (marcas: boolean[]) => marcas.map((m, i) => (m ? i + 1 : null)).filter(Boolean);

  it('marca solo el mes cuando la actividad empieza y termina en el mismo mes', () => {
    expect(meses(cronogramaMensual(dia(3, 5), dia(3, 20), 2026))).toEqual([3]);
  });

  it('marca todos los meses por los que pasa, de inicio a fin', () => {
    expect(meses(cronogramaMensual(dia(2, 15), dia(5, 2), 2026))).toEqual([2, 3, 4, 5]);
  });

  it('una actividad de todo el año marca los doce meses', () => {
    expect(meses(cronogramaMensual(dia(1, 1), dia(12, 31), 2026))).toHaveLength(12);
  });

  it('el último día de un mes y el primero del siguiente marcan ambos meses', () => {
    expect(meses(cronogramaMensual(dia(4, 30), dia(5, 1), 2026))).toEqual([4, 5]);
  });

  it('lo que cae fuera del año no se marca', () => {
    expect(meses(cronogramaMensual(dia(11, 1, 2025), dia(2, 10), 2026))).toEqual([1, 2]);
    expect(meses(cronogramaMensual(dia(1, 1, 2027), dia(2, 1, 2027), 2026))).toEqual([]);
  });
});

describe('resumenDelPlan', () => {
  it('cuenta por estado y calcula el avance promedio y el cumplimiento sin contar las canceladas', () => {
    const resumen = resumenDelPlan([
      { estado: 'EJECUTADA', porcentajeAvance: 100 },
      { estado: 'EJECUTADA', porcentajeAvance: 100 },
      { estado: 'EN_EJECUCION', porcentajeAvance: 50 },
      { estado: 'PROGRAMADA', porcentajeAvance: 0 },
      { estado: 'CANCELADA', porcentajeAvance: 70 },
    ]);
    expect(resumen.total).toBe(5);
    expect(resumen.porEstado).toEqual({ PROGRAMADA: 1, EN_EJECUCION: 1, EJECUTADA: 2, REPROGRAMADA: 0, CANCELADA: 1 });
    expect(resumen.avancePromedio).toBe(62.5);
    expect(resumen.cumplimiento).toBe(50);
  });

  it('un plan vacío o solo de canceladas da cero (no divide por cero)', () => {
    expect(resumenDelPlan([])).toMatchObject({ total: 0, avancePromedio: 0, cumplimiento: 0 });
    expect(resumenDelPlan([{ estado: 'CANCELADA', porcentajeAvance: 40 }])).toMatchObject({ total: 1, avancePromedio: 0, cumplimiento: 0 });
  });

  it('redondea a un decimal', () => {
    const resumen = resumenDelPlan([
      { estado: 'EJECUTADA', porcentajeAvance: 100 },
      { estado: 'PROGRAMADA', porcentajeAvance: 0 },
      { estado: 'PROGRAMADA', porcentajeAvance: 0 },
    ]);
    expect(resumen.avancePromedio).toBe(33.3);
    expect(resumen.cumplimiento).toBe(33.3);
  });
});

describe('actividadesParaCopiar (RF-SST-17)', () => {
  const actividad = (nombre: string, inicio: Date, fin: Date, estado: 'EJECUTADA' | 'CANCELADA' | 'EN_EJECUCION') => ({ nombre, fechaInicio: inicio, fechaFin: fin, estado, porcentajeAvance: 80 });

  it('mueve las fechas al año de destino y deja todo como borrador sin avance', () => {
    const copiadas = actividadesParaCopiar([actividad('a', dia(2, 1), dia(2, 28), 'EJECUTADA')], 2026, 2027);
    expect(copiadas).toEqual([{ nombre: 'a', fechaInicio: dia(2, 1, 2027), fechaFin: dia(2, 28, 2027), estado: 'PROGRAMADA', porcentajeAvance: 0 }]);
  });

  it('no copia las canceladas', () => {
    const copiadas = actividadesParaCopiar([actividad('a', dia(2, 1), dia(2, 2), 'CANCELADA'), actividad('b', dia(3, 1), dia(3, 2), 'EN_EJECUCION')], 2026, 2027);
    expect(copiadas.map((c) => c.nombre)).toEqual(['b']);
  });

  it('funciona hacia atrás y varios años adelante', () => {
    expect(actividadesParaCopiar([actividad('a', dia(5, 5), dia(5, 6), 'EJECUTADA')], 2026, 2024)[0].fechaInicio).toEqual(dia(5, 5, 2024));
    expect(actividadesParaCopiar([actividad('a', dia(5, 5), dia(5, 6), 'EJECUTADA')], 2026, 2030)[0].fechaFin).toEqual(dia(5, 6, 2030));
  });

  it('un 29 de febrero se acomoda en un año no bisiesto', () => {
    const copiadas = actividadesParaCopiar([actividad('a', dia(2, 29, 2028), dia(2, 29, 2028), 'EJECUTADA')], 2028, 2029);
    expect(copiadas[0].fechaInicio).toEqual(dia(2, 28, 2029));
  });

  it('no modifica las actividades de origen', () => {
    const original = actividad('a', dia(2, 1), dia(2, 28), 'EJECUTADA');
    actividadesParaCopiar([original], 2026, 2027);
    expect(original).toMatchObject({ fechaInicio: dia(2, 1), estado: 'EJECUTADA', porcentajeAvance: 80 });
  });
});

describe('coberturaDeCapacitacion (RF-SST-19)', () => {
  it('asistentes reales sobre programados, con un decimal', () => {
    expect(coberturaDeCapacitacion(10, 8)).toEqual({ asistentesReales: 8, cobertura: 80 });
    expect(coberturaDeCapacitacion(3, 2)).toEqual({ asistentesReales: 2, cobertura: 66.7 });
    expect(coberturaDeCapacitacion(10, 0)).toEqual({ asistentesReales: 0, cobertura: 0 });
  });

  it('puede pasar de 100 % si asistió más gente de la convocada', () => {
    expect(coberturaDeCapacitacion(10, 12).cobertura).toBe(120);
  });

  it('sin asistentes programados no se puede calcular: queda en null, no en infinito', () => {
    expect(coberturaDeCapacitacion(0, 5)).toEqual({ asistentesReales: 5, cobertura: null });
  });
});
