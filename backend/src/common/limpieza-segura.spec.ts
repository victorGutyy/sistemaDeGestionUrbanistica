import { describe, expect, it } from 'vitest';
import { validarLimpieza, type EntornoLimpieza } from './limpieza-segura.js';

const AHORA = new Date('2026-10-19T15:00:00Z');
const minutosAntes = (minutos: number) => new Date(AHORA.getTime() - minutos * 60_000);

const ENTORNO: EntornoLimpieza = {
  nodeEnv: 'development',
  databaseUrl: 'postgresql://postgres:clave@localhost:5432/sistema_urbanismo?schema=public',
  confirmacion: 'sistema_urbanismo',
  respaldos: [{ nombre: 'sistema_urbanismo_20261019_pre_limpieza.sql', modificadoEn: minutosAntes(5) }],
  ahora: AHORA,
};

describe('validarLimpieza', () => {
  it('con todo en regla (base local, confirmación exacta y respaldo reciente) se permite', () => {
    expect(validarLimpieza(ENTORNO)).toEqual({ nombreBase: 'sistema_urbanismo', servidor: 'localhost' });
  });

  it('nunca corre en producción', () => {
    expect(() => validarLimpieza({ ...ENTORNO, nodeEnv: 'production' })).toThrow(/NODE_ENV=production/);
  });

  it('solo corre contra una base local', () => {
    expect(() => validarLimpieza({ ...ENTORNO, databaseUrl: 'postgresql://u:p@db.ejemplo.com:5432/sistema_urbanismo' })).toThrow(/solo corre contra una base local/);
    expect(validarLimpieza({ ...ENTORNO, databaseUrl: 'postgresql://u:p@127.0.0.1:5432/sistema_urbanismo' }).servidor).toBe('127.0.0.1');
  });

  it('exige escribir el nombre exacto de la base', () => {
    expect(() => validarLimpieza({ ...ENTORNO, confirmacion: undefined })).toThrow(/nombre exacto/);
    expect(() => validarLimpieza({ ...ENTORNO, confirmacion: 'SI' })).toThrow(/nombre exacto/);
    expect(() => validarLimpieza({ ...ENTORNO, confirmacion: 'sistema_urbanismo_demo' })).toThrow(/nombre exacto/);
  });

  it('exige un respaldo reciente de ESA base con la marca de limpieza', () => {
    expect(() => validarLimpieza({ ...ENTORNO, respaldos: [] })).toThrow(/Falta un respaldo reciente/);
    expect(() => validarLimpieza({ ...ENTORNO, respaldos: [{ nombre: 'sistema_urbanismo_20261019_pre_limpieza.sql', modificadoEn: minutosAntes(45) }] })).toThrow(/Falta un respaldo reciente/);
    expect(() => validarLimpieza({ ...ENTORNO, respaldos: [{ nombre: 'sistema_urbanismo_20261019_pre_2_10c.sql', modificadoEn: minutosAntes(2) }] })).toThrow(/Falta un respaldo reciente/);
    expect(() => validarLimpieza({ ...ENTORNO, respaldos: [{ nombre: 'otra_base_pre_limpieza.sql', modificadoEn: minutosAntes(2) }] })).toThrow(/Falta un respaldo reciente/);
  });
});
