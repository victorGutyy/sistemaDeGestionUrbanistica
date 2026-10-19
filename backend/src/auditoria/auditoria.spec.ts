import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { ACCIONES_AUDITORIA, ENTIDADES_AUDITORIA, registrarAuditoria, sanitizarParaAuditoria, soloCampos } from './auditoria.js';

const USUARIO = { id: 'u-1', nombre: 'Usuario de Prueba', email: 'usuario@ejemplo.test' };

describe('sanitizarParaAuditoria (RF-AUD-01)', () => {
  it('convierte Decimal, fechas y objetos anidados en JSON simple', () => {
    const resultado = sanitizarParaAuditoria({
      valor: new Prisma.Decimal('1500000.5'),
      fecha: new Date(Date.UTC(2026, 9, 16, 17, 0, 0)),
      anidado: { lista: [new Prisma.Decimal('2')], nulo: null },
    });
    expect(resultado).toEqual({
      valor: '1500000.5',
      fecha: '2026-10-16T17:00:00.000Z',
      anidado: { lista: ['2'], nulo: null },
    });
  });

  it('nunca guarda contraseñas, hashes ni tokens, en ningún nivel y sin importar las mayúsculas', () => {
    const resultado = sanitizarParaAuditoria({
      nombre: 'Ana',
      password: '12345678',
      passwordHash: '$2b$12$abcdefghijklmnopqrstuv',
      PasswordHash: 'otro',
      anidado: { token: 'abc', accessToken: 'def', secret: 'ghi', ok: 'visible' },
      lista: [{ password: 'x', dato: 1 }],
    });
    expect(resultado).toEqual({ nombre: 'Ana', anidado: { ok: 'visible' }, lista: [{ dato: 1 }] });
    expect(JSON.stringify(resultado)).not.toMatch(/12345678|\$2b\$|abc|def|ghi/);
  });

  it('no guarda la fotografía completa de un recibo (campo contenido)', () => {
    expect(sanitizarParaAuditoria({ numeroTexto: 'RC-1', contenido: { empresa: 'x' } })).toEqual({ numeroTexto: 'RC-1' });
  });

  it('sin valor no guarda nada (null en la base), y los undefined se omiten', () => {
    expect(sanitizarParaAuditoria(undefined)).toBeUndefined();
    expect(sanitizarParaAuditoria(null)).toBeUndefined();
    expect(sanitizarParaAuditoria({ a: 1, b: undefined })).toEqual({ a: 1 });
  });
});

describe('soloCampos', () => {
  it('deja únicamente los campos pedidos', () => {
    expect(soloCampos({ a: 1, b: 2, c: 3 }, ['a', 'c'])).toEqual({ a: 1, c: 3 });
    expect(soloCampos<{ a: number }>(null, ['a'])).toBeUndefined();
  });
});

describe('registrarAuditoria', () => {
  it('guarda quién (con su nombre y correo de ese día), qué, sobre qué y los valores antes y después', async () => {
    const crear = vi.fn();
    await registrarAuditoria(
      { registroAuditoria: { create: crear } },
      {
        usuario: USUARIO,
        accion: 'ABONO_ANULAR',
        entidad: 'ABONO',
        entidadId: 'abono-1',
        resumen: 'Anuló el abono de $350.000',
        antes: { estado: 'ACTIVO', valor: new Prisma.Decimal('350000') },
        despues: { estado: 'ANULADO', passwordHash: 'no debe guardarse' },
      },
    );

    expect(crear).toHaveBeenCalledWith({
      data: {
        usuarioId: 'u-1',
        usuarioNombre: 'Usuario de Prueba',
        usuarioEmail: 'usuario@ejemplo.test',
        accion: 'ABONO_ANULAR',
        entidad: 'ABONO',
        entidadId: 'abono-1',
        resumen: 'Anuló el abono de $350.000',
        antes: { estado: 'ACTIVO', valor: '350000' },
        despues: { estado: 'ANULADO' },
      },
    });
  });

  it('si no se puede guardar el registro, el error sube: la acción no debe quedar sin auditoría', async () => {
    const crear = vi.fn().mockRejectedValue(new Error('falla de base de datos'));
    await expect(
      registrarAuditoria({ registroAuditoria: { create: crear } }, { usuario: USUARIO, accion: 'LOTE_CREAR', entidad: 'LOTE', resumen: 'x' }),
    ).rejects.toThrow('falla de base de datos');
  });
});

describe('catálogo', () => {
  it('toda acción y todo tipo de registro tiene su texto en español', () => {
    for (const texto of [...Object.values(ACCIONES_AUDITORIA), ...Object.values(ENTIDADES_AUDITORIA)]) {
      expect(texto.trim().length).toBeGreaterThan(2);
    }
  });
});
