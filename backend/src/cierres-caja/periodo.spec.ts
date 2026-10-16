import { describe, expect, it } from 'vitest';
import { diaEnBogota, diaLocal, esFechaISOValida, finDelPeriodo, hoyISO, sumarDias, ultimoDiaDelMes } from './periodo.js';

describe('períodos de cierre de caja (RF-CAJ-01)', () => {
  it('diario: el mismo día', () => {
    expect(finDelPeriodo('DIARIO', '2026-10-16')).toBe('2026-10-16');
  });

  it('semanal: llega hasta el domingo de esa semana', () => {
    // 2026-10-12 es lunes; el domingo es el 18.
    expect(finDelPeriodo('SEMANAL', '2026-10-12')).toBe('2026-10-18');
    expect(finDelPeriodo('SEMANAL', '2026-10-16')).toBe('2026-10-18'); // viernes
    expect(finDelPeriodo('SEMANAL', '2026-10-18')).toBe('2026-10-18'); // domingo: la semana ya termina ese día
  });

  it('semanal: cruza de mes y de año', () => {
    expect(finDelPeriodo('SEMANAL', '2026-12-28')).toBe('2027-01-03');
    expect(finDelPeriodo('SEMANAL', '2026-09-28')).toBe('2026-10-04');
  });

  it('quincenal: del 1 al 15 y del 16 al fin de mes', () => {
    expect(finDelPeriodo('QUINCENAL', '2026-10-01')).toBe('2026-10-15');
    expect(finDelPeriodo('QUINCENAL', '2026-10-15')).toBe('2026-10-15');
    expect(finDelPeriodo('QUINCENAL', '2026-10-16')).toBe('2026-10-31');
    expect(finDelPeriodo('QUINCENAL', '2026-09-20')).toBe('2026-09-30');
  });

  it('quincenal: febrero normal y bisiesto', () => {
    expect(finDelPeriodo('QUINCENAL', '2026-02-16')).toBe('2026-02-28');
    expect(finDelPeriodo('QUINCENAL', '2028-02-16')).toBe('2028-02-29');
    expect(ultimoDiaDelMes(2028, 2)).toBe(29);
  });

  it('un cierre que empieza a mitad de período cubre solo lo que falta', () => {
    // Tras un cierre diario del miércoles, el semanal empieza el jueves y termina el domingo.
    expect(finDelPeriodo('SEMANAL', '2026-10-15')).toBe('2026-10-18');
    expect(finDelPeriodo('QUINCENAL', '2026-10-08')).toBe('2026-10-15');
  });

  it('sumarDias respeta el calendario', () => {
    expect(sumarDias('2026-10-31', 1)).toBe('2026-11-01');
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(sumarDias('2028-02-28', 1)).toBe('2028-02-29');
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('valida fechas del calendario', () => {
    expect(esFechaISOValida('2026-10-16')).toBe(true);
    expect(esFechaISOValida('2026-02-30')).toBe(false);
    expect(esFechaISOValida('16/10/2026')).toBe(false);
  });

  it('el día de una anulación se mide en Colombia, no en UTC', () => {
    // 2026-10-17 03:00 UTC es todavía el 16 a las 22:00 en Colombia.
    expect(diaEnBogota(new Date(Date.UTC(2026, 9, 17, 3, 0, 0)))).toBe('2026-10-16');
    expect(diaEnBogota(new Date(Date.UTC(2026, 9, 17, 5, 0, 0)))).toBe('2026-10-17');
    expect(hoyISO(new Date(Date.UTC(2026, 9, 17, 4, 59, 0)))).toBe('2026-10-16');
  });

  it('un día de negocio guardado como fecha local se lee igual', () => {
    expect(diaLocal(new Date(2026, 9, 16))).toBe('2026-10-16');
  });
});
