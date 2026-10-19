import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { aCeldaExcel, esCampoSensible, formatearFechaExcel } from './convertir-celda.js';

describe('formatearFechaExcel', () => {
  it('un día guardado a medianoche UTC (columna de tipo fecha) sale como ese día, sin correrse', () => {
    expect(formatearFechaExcel(new Date(Date.UTC(2026, 9, 18)))).toBe('18/10/2026');
    expect(formatearFechaExcel(new Date(Date.UTC(2026, 0, 1)))).toBe('01/01/2026');
  });

  it('un día guardado a medianoche de Colombia (05:00 UTC) sale como ese día', () => {
    expect(formatearFechaExcel(new Date('2026-10-18T05:00:00.000Z'))).toBe('18/10/2026');
  });

  it('un instante sale con la hora de Colombia, no la del servidor', () => {
    // 20:30 UTC = 15:30 en Colombia.
    expect(formatearFechaExcel(new Date('2026-10-18T20:30:00.000Z'))).toBe('18/10/2026 15:30');
    // 03:00 UTC del 19 = 22:00 del 18 en Colombia.
    expect(formatearFechaExcel(new Date('2026-10-19T03:00:00.000Z'))).toBe('18/10/2026 22:00');
  });
});

describe('aCeldaExcel', () => {
  it('el dinero sale como número exacto y las cantidades vacías como celdas vacías', () => {
    expect(aCeldaExcel(new Prisma.Decimal('45000000'))).toBe(45_000_000);
    expect(aCeldaExcel(new Prisma.Decimal('90.5'))).toBe(90.5);
    expect(aCeldaExcel(null)).toBeNull();
    expect(aCeldaExcel(undefined)).toBeNull();
  });

  it('los booleanos salen como Sí o No y los listados separados por coma', () => {
    expect(aCeldaExcel(true)).toBe('Sí');
    expect(aCeldaExcel(false)).toBe('No');
    expect(aCeldaExcel(['proyectos.ver', 'clientes.ver'])).toBe('proyectos.ver, clientes.ver');
  });

  it('el JSON sale como texto y un texto demasiado largo se recorta para que Excel lo acepte', () => {
    expect(aCeldaExcel({ a: 1 })).toBe('{"a":1}');
    const largo = aCeldaExcel('x'.repeat(40_000)) as string;
    expect(largo.length).toBeLessThan(32_767);
    expect(largo).toMatch(/texto recortado/);
  });

  it('los números y los textos normales pasan tal cual', () => {
    expect(aCeldaExcel(12)).toBe(12);
    expect(aCeldaExcel('Cliente de Prueba')).toBe('Cliente de Prueba');
  });
});

describe('esCampoSensible', () => {
  it('reconoce contraseñas, tokens y secretos, y deja pasar el resto', () => {
    for (const nombre of ['passwordHash', 'password', 'accessToken', 'secreto', 'secret']) expect(esCampoSensible(nombre)).toBe(true);
    for (const nombre of ['nombre', 'documento', 'valorVenta', 'intentosFallidos']) expect(esCampoSensible(nombre)).toBe(false);
  });
});
