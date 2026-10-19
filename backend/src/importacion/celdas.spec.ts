import { describe, expect, it } from 'vitest';
import { esVacia, leerCodigo, leerDecimal, leerEntero, leerFecha, leerOpcion, leerPesos, leerTexto, normalizarTexto } from './celdas.js';

const valor = <T>(lectura: { ok: true; valor: T } | { ok: false; mensaje: string }) => (lectura.ok ? lectura.valor : `ERROR: ${lectura.mensaje}`);

describe('leerPesos', () => {
  it.each([
    [1500000, '1500000'],
    ['1500000', '1500000'],
    ['$1.500.000', '1500000'],
    ['1.500.000,00', '1500000'],
    [' $ 45.000.000 ', '45000000'],
    [0, '0'],
    ['0', '0'],
  ])('acepta %j', (celda, esperado) => {
    expect(String(valor(leerPesos(celda)))).toBe(esperado);
  });

  it.each([
    [1500.5, /sin centavos/],
    [-1, /negativo/],
    ['-500', /negativo/],
    ['abc', /pesos enteros/],
    ['1.500,50', /pesos enteros/],
    [1_000_000_000_000, /demasiado grande/],
    [new Date(), /fecha/],
  ])('rechaza %j', (celda, mensaje) => {
    const lectura = leerPesos(celda as never);
    expect(lectura.ok).toBe(false);
    if (!lectura.ok) expect(lectura.mensaje).toMatch(mensaje);
  });
});

describe('leerDecimal', () => {
  it('acepta punto o coma y hasta 2 decimales', () => {
    expect(String(valor(leerDecimal(90)))).toBe('90');
    expect(String(valor(leerDecimal('90,5')))).toBe('90.5');
    expect(String(valor(leerDecimal('90.25')))).toBe('90.25');
  });
  it('rechaza más de 2 decimales, negativos y texto', () => {
    expect(leerDecimal('90.123').ok).toBe(false);
    expect(leerDecimal(-3).ok).toBe(false);
    expect(leerDecimal('mucho').ok).toBe(false);
  });
});

describe('leerEntero', () => {
  it('acepta enteros y rechaza decimales o texto', () => {
    expect(valor(leerEntero(12))).toBe(12);
    expect(valor(leerEntero('12'))).toBe(12);
    expect(leerEntero(1.5).ok).toBe(false);
    expect(leerEntero('doce').ok).toBe(false);
    expect(leerEntero(-1).ok).toBe(false);
  });
});

describe('leerFecha', () => {
  it('lee celdas de fecha de Excel (medianoche UTC) sin correr el día', () => {
    expect(valor(leerFecha(new Date(Date.UTC(2026, 4, 10))))).toBe('2026-05-10');
    expect(valor(leerFecha(new Date(Date.UTC(2026, 0, 31))))).toBe('2026-01-31');
  });
  it('lee dd/mm/aaaa, d/m/aaaa, dd-mm-aaaa y aaaa-mm-dd', () => {
    expect(valor(leerFecha('10/05/2026'))).toBe('2026-05-10');
    expect(valor(leerFecha('1/2/2026'))).toBe('2026-02-01');
    expect(valor(leerFecha('10-05-2026'))).toBe('2026-05-10');
    expect(valor(leerFecha('2026-05-10'))).toBe('2026-05-10');
  });
  it('lee el número de serie de Excel', () => {
    // 46152 = 10/05/2026 en Excel.
    expect(valor(leerFecha(46152))).toBe('2026-05-10');
  });
  it('rechaza fechas que no existen o no se entienden', () => {
    expect(leerFecha('31/02/2026').ok).toBe(false);
    expect(leerFecha('2026-13-01').ok).toBe(false);
    expect(leerFecha('mañana').ok).toBe(false);
    expect(leerFecha('10/05/1850').ok).toBe(false);
    expect(leerFecha(5).ok).toBe(false);
  });
});

describe('texto, códigos y opciones', () => {
  it('el texto se limpia de espacios sobrantes', () => {
    expect(valor(leerTexto('  La   Floresta '))).toBe('La Floresta');
  });
  it('los documentos que Excel guardó como número se leen como texto', () => {
    expect(valor(leerCodigo(1000000001))).toBe('1000000001');
    expect(valor(leerCodigo(' 901125081-1 '))).toBe('901125081-1');
    expect(leerCodigo(12.5).ok).toBe(false);
  });
  it('las opciones se reconocen sin importar mayúsculas ni tildes', () => {
    const medios = ['Efectivo', 'Consignación'];
    expect(valor(leerOpcion('consignacion', medios))).toBe('Consignación');
    expect(valor(leerOpcion('EFECTIVO', medios))).toBe('Efectivo');
    expect(leerOpcion('trueque', medios).ok).toBe(false);
  });
  it('normalizarTexto ignora tildes, mayúsculas y signos; esVacia detecta celdas en blanco', () => {
    expect(normalizarTexto('  Área   (m²) ')).toBe('area m2');
    expect(esVacia(null)).toBe(true);
    expect(esVacia('   ')).toBe(true);
    expect(esVacia(0)).toBe(false);
  });
});
