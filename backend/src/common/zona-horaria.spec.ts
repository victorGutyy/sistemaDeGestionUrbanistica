import { describe, expect, it } from 'vitest';
import { parsearFechaLocal } from './fecha.util.js';
import { ZONA_HORARIA } from './zona-horaria.js';

describe('zona horaria del proceso', () => {
  it('queda fija en America/Bogota sin importar la zona del servidor', () => {
    expect(ZONA_HORARIA).toBe('America/Bogota');
    expect(process.env.TZ).toBe('America/Bogota');
  });

  it('una fecha local de Bogotá es medianoche en UTC-5 (05:00 UTC)', () => {
    expect(new Date(2026, 0, 31).toISOString()).toBe('2026-01-31T05:00:00.000Z');
    expect(new Date(2026, 0, 31).getTimezoneOffset()).toBe(300);
  });

  it('parsearFechaLocal conserva el día calendario que escribió el usuario', () => {
    const fecha = parsearFechaLocal('2026-01-31');
    expect(fecha.getDate()).toBe(31);
    expect(fecha.toISOString()).toBe('2026-01-31T05:00:00.000Z');
  });
});
