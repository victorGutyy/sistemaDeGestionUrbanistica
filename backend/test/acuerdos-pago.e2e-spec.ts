// Pruebas contra la base de datos de desarrollo (Postgres arriba y backend/.env con DATABASE_URL).
// No dejan datos: cada prueba corre dentro de una transacción que siempre se revierte.
// Comprueban lo que solo la base real garantiza de los acuerdos de pago (CC-07): no se borran, no se editan y los datos son coherentes.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';

const REVERTIR = new Error('revertir');
const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('Acuerdos de pago contra Postgres real (CC-07)', () => {
  const prisma = new PrismaService();
  let usuarioId: string;

  beforeAll(async () => {
    await prisma.$connect();
    usuarioId = (await prisma.usuario.findFirstOrThrow({ select: { id: true } })).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  type Tx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

  async function enTransaccionRevertida(prueba: (tx: Tx) => Promise<void>) {
    await expect(
      prisma.$transaction(async (tx) => {
        await prueba(tx);
        throw REVERTIR;
      }),
    ).rejects.toBe(REVERTIR);
  }

  // Una venta financiada, en un proyecto propio de la prueba.
  async function ventaFinanciada(tx: Tx) {
    const sufijo = randomUUID().slice(0, 8);
    const proyecto = await tx.proyecto.create({ data: { nombre: `Acuerdos E2E ${sufijo}`, areaTotal: 1000 } });
    const lote = await tx.lote.create({ data: { proyectoId: proyecto.id, numero: `L-${sufijo}`, area: 100, valorVenta: 50_000_000 } });
    const cliente = await tx.cliente.create({ data: { nombre: `Cliente E2E ${sufijo}`, documento: `E2E-${sufijo}` } });
    return tx.venta.create({
      data: { loteId: lote.id, clienteId: cliente.id, valorTotal: 50_000_000, cuotaInicial: 15_000_000, formaPago: 'FINANCIADO', numeroCuotas: 12 },
    });
  }

  const nuevoAcuerdo = (ventaId: string, extra: object = {}) => ({
    ventaId,
    motivo: 'Acuerdo verbal: las últimas cuotas se pagan al final',
    desde: dia('2026-11-01'),
    creadoPorId: usuarioId,
    ...extra,
  });

  it('guarda el acuerdo con su venta, motivo y quién lo creó', async () => {
    await enTransaccionRevertida(async (tx) => {
      const venta = await ventaFinanciada(tx);
      const acuerdo = await tx.acuerdoPago.create({ data: nuevoAcuerdo(venta.id, { hastaPrevista: dia('2026-12-31') }) });
      expect(acuerdo).toMatchObject({ ventaId: venta.id, creadoPorId: usuarioId, finalizadoEn: null });
      expect(await tx.acuerdoPago.count({ where: { ventaId: venta.id } })).toBe(1);
    });
  });

  it('un acuerdo no se puede borrar', async () => {
    await enTransaccionRevertida(async (tx) => {
      const venta = await ventaFinanciada(tx);
      const acuerdo = await tx.acuerdoPago.create({ data: nuevoAcuerdo(venta.id) });
      await expect(tx.acuerdoPago.delete({ where: { id: acuerdo.id } })).rejects.toThrow(/no se borra/);
    });
  });

  it('no se puede cambiar el motivo, el inicio ni la venta de un acuerdo', async () => {
    for (const cambio of [{ motivo: 'Otro motivo distinto' }, { desde: dia('2026-10-01') }]) {
      await enTransaccionRevertida(async (tx) => {
        const venta = await ventaFinanciada(tx);
        const acuerdo = await tx.acuerdoPago.create({ data: nuevoAcuerdo(venta.id) });
        await expect(tx.acuerdoPago.update({ where: { id: acuerdo.id }, data: cambio })).rejects.toThrow(/no se edita/);
      });
    }
  });

  it('finalizar guarda quién y cuándo; después ya no cambia', async () => {
    await enTransaccionRevertida(async (tx) => {
      const venta = await ventaFinanciada(tx);
      const acuerdo = await tx.acuerdoPago.create({ data: nuevoAcuerdo(venta.id) });
      const finalizado = await tx.acuerdoPago.update({
        where: { id: acuerdo.id },
        data: { finalizadoEn: dia('2026-11-20'), finalizadoPorId: usuarioId, motivoFin: 'El cliente se puso al día' },
      });
      expect(finalizado.finalizadoEn).toEqual(dia('2026-11-20'));
      await expect(tx.acuerdoPago.update({ where: { id: acuerdo.id }, data: { motivoFin: 'Otro texto' } })).rejects.toThrow(/ya está finalizado/);
    });
  });

  it('finalizar sin dejar quién lo hizo se rechaza (datos completos o nada)', async () => {
    await enTransaccionRevertida(async (tx) => {
      const venta = await ventaFinanciada(tx);
      const acuerdo = await tx.acuerdoPago.create({ data: nuevoAcuerdo(venta.id) });
      await expect(tx.acuerdoPago.update({ where: { id: acuerdo.id }, data: { finalizadoEn: dia('2026-11-20') } })).rejects.toThrow(/finalizacion_completa/);
    });
  });

  it('rechaza un motivo vacío y una fecha final anterior a la inicial', async () => {
    await enTransaccionRevertida(async (tx) => {
      const venta = await ventaFinanciada(tx);
      await expect(tx.acuerdoPago.create({ data: nuevoAcuerdo(venta.id, { motivo: '   ' }) })).rejects.toThrow(/motivo_no_vacio/);
    });
    await enTransaccionRevertida(async (tx) => {
      const venta = await ventaFinanciada(tx);
      await expect(tx.acuerdoPago.create({ data: nuevoAcuerdo(venta.id, { hastaPrevista: dia('2026-10-01') }) })).rejects.toThrow(/hasta_no_anterior/);
    });
  });

  it('una venta con acuerdos no se puede borrar (se conserva el historial)', async () => {
    await enTransaccionRevertida(async (tx) => {
      const venta = await ventaFinanciada(tx);
      await tx.acuerdoPago.create({ data: nuevoAcuerdo(venta.id) });
      await expect(tx.venta.delete({ where: { id: venta.id } })).rejects.toThrow();
    });
  });
});
