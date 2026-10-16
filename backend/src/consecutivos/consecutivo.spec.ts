import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../generated/prisma/client.js';
import { formatearNumeroRecibo, siguienteConsecutivo } from './consecutivo.js';

describe('siguienteConsecutivo', () => {
  it('toma el número con una sola sentencia atómica sobre el contador de la serie', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ ultimo: 7 }]) };

    const numero = await siguienteConsecutivo(tx as unknown as Prisma.TransactionClient, 'RECIBO_CAJA');

    expect(numero).toBe(7);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const [plantilla, serie] = tx.$queryRaw.mock.calls[0];
    expect(plantilla.join('?')).toMatch(/INSERT INTO "Consecutivo"[\s\S]*ON CONFLICT \("serie"\) DO UPDATE[\s\S]*"ultimo" \+ 1[\s\S]*RETURNING/);
    expect(serie).toBe('RECIBO_CAJA');
  });

  it('el número llega como entero aunque la base lo devuelva como bigint o texto', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ ultimo: '12' }]) };
    expect(await siguienteConsecutivo(tx as unknown as Prisma.TransactionClient, 'X')).toBe(12);
  });
});

describe('formatearNumeroRecibo', () => {
  it('rellena con ceros a seis dígitos', () => {
    expect(formatearNumeroRecibo('RC-', 1)).toBe('RC-000001');
    expect(formatearNumeroRecibo('RC-', 123)).toBe('RC-000123');
    expect(formatearNumeroRecibo('H-', 45)).toBe('H-000045');
  });

  it('no recorta números de más de seis dígitos', () => {
    expect(formatearNumeroRecibo('RC-', 1234567)).toBe('RC-1234567');
  });
});
