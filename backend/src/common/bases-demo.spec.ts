import { describe, expect, it } from 'vitest';
import { baseDerivada, conOtraBase, esBaseDerivada, exigirBaseDerivadaParaReiniciar, nombreDeLaBase, parseModo } from './bases-demo.js';

const URL_DESARROLLO = 'postgresql://postgres:clave%40rara@localhost:5432/sistema_urbanismo?schema=public';

describe('bases de demostración y de volumen', () => {
  it('el nombre de la base sale de la dirección de conexión', () => {
    expect(nombreDeLaBase(URL_DESARROLLO)).toBe('sistema_urbanismo');
  });

  it('rechaza nombres de base raros', () => {
    expect(() => nombreDeLaBase('postgresql://u:p@localhost:5432/Sistema-Urbanismo')).toThrow(/no es válido/);
  });

  it('la base derivada conserva usuario, clave, servidor y puerto, y cambia solo el nombre', () => {
    const demo = baseDerivada(URL_DESARROLLO, 'demo');
    expect(demo.nombre).toBe('sistema_urbanismo_demo');
    expect(demo.url).toBe('postgresql://postgres:clave%40rara@localhost:5432/sistema_urbanismo_demo?schema=public');
    expect(demo.urlMantenimiento).toBe('postgresql://postgres:clave%40rara@localhost:5432/postgres?schema=public');
    expect(baseDerivada(URL_DESARROLLO, 'volumen').nombre).toBe('sistema_urbanismo_volumen');
  });

  it('no encadena sufijos: si DATABASE_URL ya es una base derivada, se rechaza', () => {
    expect(() => baseDerivada(conOtraBase(URL_DESARROLLO, 'sistema_urbanismo_demo'), 'volumen')).toThrow(/ya apunta a una base derivada/);
  });

  it('solo una base derivada se puede reiniciar; la de desarrollo nunca', () => {
    expect(esBaseDerivada('sistema_urbanismo_demo')).toBe(true);
    expect(esBaseDerivada('sistema_urbanismo')).toBe(false);
    expect(() => exigirBaseDerivadaParaReiniciar('sistema_urbanismo')).toThrow(/no se reinicia/);
    expect(() => exigirBaseDerivadaParaReiniciar('sistema_urbanismo_volumen')).not.toThrow();
  });

  it('el modo se lee de --base y se rechaza si falta o es desconocido', () => {
    expect(parseModo('demo')).toBe('demo');
    expect(parseModo('volumen')).toBe('volumen');
    expect(() => parseModo(undefined)).toThrow(/--base/);
    expect(() => parseModo('produccion')).toThrow(/--base/);
  });
});
