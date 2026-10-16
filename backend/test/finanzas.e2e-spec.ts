// Pruebas contra la base de datos de desarrollo (Postgres arriba y backend/.env con DATABASE_URL).
// No dejan datos: cada prueba crea sus filas dentro de una transacción que siempre se revierte.
import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';

const REVERTIR = new Error('revertir');

describe('Movimientos financieros contra Postgres real (reglas de la base de datos)', () => {
  const prisma = new PrismaService();
  let categoriaGastoId: string;
  let categoriaIngresoId: string;
  let usuarioId: string;

  beforeAll(async () => {
    await prisma.$connect();
    categoriaGastoId = (await prisma.categoriaGasto.findFirstOrThrow({ where: { nombre: 'Otros' } })).id;
    categoriaIngresoId = (await prisma.categoriaIngreso.findFirstOrThrow({ where: { nombre: 'Otros' } })).id;
    usuarioId = (await prisma.usuario.findFirstOrThrow()).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Ejecuta la prueba dentro de una transacción y siempre la deshace.
  async function enTransaccionRevertida(prueba: (tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0]) => Promise<void>) {
    await expect(
      prisma.$transaction(async (tx) => {
        await prueba(tx);
        throw REVERTIR;
      }),
    ).rejects.toBe(REVERTIR);
  }

  const egreso = (extra: Record<string, unknown> = {}) => ({
    tipo: 'GASTO' as const,
    fecha: new Date(2026, 9, 1),
    valor: 1000,
    descripcion: 'Movimiento de prueba',
    categoriaGastoId,
    medioPago: 'EFECTIVO' as const,
    motivoSinSoporte: 'Prueba automática',
    registradoPorId: usuarioId,
    ...extra,
  });

  it('un egreso sin soporte ni motivo lo rechaza la base de datos (RF-EGR-02)', async () => {
    await enTransaccionRevertida(async (tx) => {
      await expect(tx.movimientoFinanciero.create({ data: egreso({ motivoSinSoporte: null }) })).rejects.toThrow(/egreso_con_soporte_o_motivo/);
    });
  });

  it('el valor debe ser positivo, la categoría debe ser del tipo y la cuenta depende del medio', async () => {
    await enTransaccionRevertida(async (tx) => {
      await expect(tx.movimientoFinanciero.create({ data: egreso({ valor: 0 }) })).rejects.toThrow(/valor_positivo/);
    });
    await enTransaccionRevertida(async (tx) => {
      await expect(tx.movimientoFinanciero.create({ data: egreso({ categoriaGastoId: null, categoriaIngresoId }) })).rejects.toThrow(/categoria_segun_tipo/);
    });
    await enTransaccionRevertida(async (tx) => {
      await expect(tx.movimientoFinanciero.create({ data: egreso({ medioPago: 'TRANSFERENCIA' }) })).rejects.toThrow(/cuenta_segun_medio/);
    });
  });

  it('un movimiento no se puede borrar ni editar; solo se anula', async () => {
    await enTransaccionRevertida(async (tx) => {
      const creado = await tx.movimientoFinanciero.create({ data: egreso() });
      await expect(tx.$executeRaw`UPDATE "MovimientoFinanciero" SET "valor" = 5 WHERE "id" = ${creado.id}`).rejects.toThrow(/no se puede editar/);
    });
    await enTransaccionRevertida(async (tx) => {
      const creado = await tx.movimientoFinanciero.create({ data: egreso() });
      await expect(tx.$executeRaw`DELETE FROM "MovimientoFinanciero" WHERE "id" = ${creado.id}`).rejects.toThrow(/se anula/);
    });
  });

  it('la anulación exige quién, cuándo y por qué, y un movimiento anulado ya no cambia', async () => {
    await enTransaccionRevertida(async (tx) => {
      const creado = await tx.movimientoFinanciero.create({ data: egreso() });
      await expect(tx.$executeRaw`UPDATE "MovimientoFinanciero" SET "estado" = 'ANULADO' WHERE "id" = ${creado.id}`).rejects.toThrow(/anulacion_completa/);
    });
    await enTransaccionRevertida(async (tx) => {
      const creado = await tx.movimientoFinanciero.create({ data: egreso() });
      const anulado = await tx.movimientoFinanciero.update({
        where: { id: creado.id },
        data: { estado: 'ANULADO', anuladoPorId: usuarioId, anuladoEn: new Date(), motivoAnulacion: 'Prueba de anulación' },
      });
      expect(anulado.estado).toBe('ANULADO');
      await expect(tx.$executeRaw`UPDATE "MovimientoFinanciero" SET "motivoAnulacion" = 'otro' WHERE "id" = ${creado.id}`).rejects.toThrow(/anulado no se puede modificar/);
    });
  });

  it('la devolución de un desistimiento solo puede ser un egreso ligado a una venta', async () => {
    await enTransaccionRevertida(async (tx) => {
      await expect(tx.movimientoFinanciero.create({ data: egreso({ origen: 'DEVOLUCION_DESISTIMIENTO' }) })).rejects.toThrow(/devolucion_con_venta/);
    });
  });

  it('las categorías del sistema existen: nómina, comisiones y devolución por desistimiento', async () => {
    const sistema = await prisma.categoriaGasto.findMany({ where: { esSistema: true }, select: { nombre: true } });
    expect(sistema.map((c) => c.nombre)).toEqual(expect.arrayContaining(['Nómina', 'Comisiones', 'Devolución por desistimiento']));
    expect((await prisma.categoriaIngreso.count()) >= 3).toBe(true);
  });
});
