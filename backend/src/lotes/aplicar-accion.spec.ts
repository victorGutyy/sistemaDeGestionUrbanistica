import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../generated/prisma/client.js';
import { EstadoLote, TipoEventoLote } from '../generated/prisma/enums.js';
import { aplicarAccionLote } from './aplicar-accion.js';

function crearTxFalso() {
  return {
    lote: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    loteHistorial: { create: vi.fn() },
    registroAuditoria: { create: vi.fn() },
  };
}

const LOTE = { id: 'lote-1', numero: 'L-1', estado: EstadoLote.DISPONIBLE };
const USUARIO = { id: 'u-1', nombre: 'Usuario de Prueba', email: 'usuario@ejemplo.test' };

describe('aplicarAccionLote', () => {
  let tx: ReturnType<typeof crearTxFalso>;
  const comoTx = () => tx as unknown as Prisma.TransactionClient;

  beforeEach(() => {
    tx = crearTxFalso();
  });

  it('cambia el estado solo si el lote sigue como se leyó, y devuelve el estado nuevo', async () => {
    const nuevo = await aplicarAccionLote(comoTx(), LOTE, 'SEPARAR', USUARIO);

    expect(nuevo).toBe(EstadoLote.SEPARADO);
    expect(tx.lote.updateMany).toHaveBeenCalledWith({
      where: { id: 'lote-1', estado: EstadoLote.DISPONIBLE },
      data: { estado: EstadoLote.SEPARADO },
    });
  });

  it('registra en el historial quién, qué cambió, el motivo y la venta de origen', async () => {
    await aplicarAccionLote(comoTx(), LOTE, 'VENDER', USUARIO, { ventaId: 'venta-9', motivo: 'Venta de contado' });

    expect(tx.loteHistorial.create).toHaveBeenCalledWith({
      data: {
        loteId: 'lote-1',
        tipo: TipoEventoLote.CAMBIO_ESTADO,
        estadoAnterior: EstadoLote.DISPONIBLE,
        estadoNuevo: EstadoLote.VENDIDO,
        motivo: 'Venta de contado',
        ventaId: 'venta-9',
        usuarioId: 'u-1',
      },
    });
  });

  it('una transición inválida falla sin tocar la base de datos', async () => {
    await expect(aplicarAccionLote(comoTx(), { ...LOTE, estado: EstadoLote.ESCRITURADO }, 'VENDER', USUARIO)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.lote.updateMany).not.toHaveBeenCalled();
    expect(tx.loteHistorial.create).not.toHaveBeenCalled();
  });

  it('si otra persona cambió el lote en el mismo instante, responde conflicto y no deja historial (nunca se vende dos veces)', async () => {
    tx.lote.updateMany.mockResolvedValue({ count: 0 });

    await expect(aplicarAccionLote(comoTx(), LOTE, 'VENDER', USUARIO)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.loteHistorial.create).not.toHaveBeenCalled();
  });

  it('al escriturar guarda los datos de la escritura en el lote', async () => {
    const fecha = new Date(2026, 9, 1);
    await aplicarAccionLote(comoTx(), { ...LOTE, estado: EstadoLote.VENDIDO }, 'ESCRITURAR', USUARIO, {
      escritura: { numero: '1234', notaria: 'Notaría 2', fecha },
    });

    expect(tx.lote.updateMany).toHaveBeenCalledWith({
      where: { id: 'lote-1', estado: EstadoLote.VENDIDO },
      data: { estado: EstadoLote.ESCRITURADO, escrituraNumero: '1234', escrituraNotaria: 'Notaría 2', escrituraFecha: fecha },
    });
  });
});
