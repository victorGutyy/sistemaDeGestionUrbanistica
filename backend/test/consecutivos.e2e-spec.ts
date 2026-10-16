// Pruebas contra la base de datos de desarrollo (Postgres arriba y backend/.env con DATABASE_URL).
// No dejan datos: la serie de prueba se borra al terminar y los intentos de editar recibos son rechazados.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { siguienteConsecutivo } from '../src/consecutivos/consecutivo.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Consecutivos y recibos contra Postgres real', () => {
  const prisma = new PrismaService();
  const serie = `PRUEBA_${randomUUID()}`;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.consecutivo.deleteMany({ where: { serie } });
    await prisma.$disconnect();
  });

  it('50 transacciones simultáneas reciben números distintos y seguidos, sin huecos (RF-REC-02)', async () => {
    const numeros = await Promise.all(
      Array.from({ length: 50 }, () => prisma.$transaction((tx) => siguienteConsecutivo(tx, serie))),
    );

    expect(new Set(numeros).size).toBe(50);
    expect([...numeros].sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });

  it('si la transacción falla, el número no se consume y no queda un hueco', async () => {
    const antes = await prisma.$transaction((tx) => siguienteConsecutivo(tx, serie));

    await expect(
      prisma.$transaction(async (tx) => {
        await siguienteConsecutivo(tx, serie);
        throw new Error('falla después de pedir el número');
      }),
    ).rejects.toThrow('falla después de pedir el número');

    const despues = await prisma.$transaction((tx) => siguienteConsecutivo(tx, serie));
    expect(despues).toBe(antes + 1);
  });

  it('la serie histórica y la de caja llevan cuentas independientes', async () => {
    const otra = `${serie}_B`;
    try {
      const [a, b] = await prisma.$transaction(async (tx) => [await siguienteConsecutivo(tx, serie), await siguienteConsecutivo(tx, otra)]);
      expect(b).toBe(1);
      expect(a).toBeGreaterThan(1);
    } finally {
      await prisma.consecutivo.deleteMany({ where: { serie: otra } });
    }
  });

  it('un recibo emitido no se puede editar ni borrar, ni siquiera con acceso directo a la base', async () => {
    const recibo = await prisma.recibo.findFirst();
    if (!recibo) return; // base sin recibos: nada que proteger todavía

    await expect(prisma.$executeRaw`UPDATE "Recibo" SET "numeroTexto" = 'X-1' WHERE "id" = ${recibo.id}`).rejects.toThrow(/no se pueden editar ni borrar/);
    await expect(prisma.$executeRaw`DELETE FROM "Recibo" WHERE "id" = ${recibo.id}`).rejects.toThrow(/no se pueden editar ni borrar/);
  });

  it('un abono no se puede borrar ni cambiar su valor: solo se anula', async () => {
    const abono = await prisma.abono.findFirst({ where: { estado: 'ACTIVO' } });
    if (!abono) return;

    await expect(prisma.$executeRaw`DELETE FROM "Abono" WHERE "id" = ${abono.id}`).rejects.toThrow(/se anula/);
    await expect(prisma.$executeRaw`UPDATE "Abono" SET "valor" = 1 WHERE "id" = ${abono.id}`).rejects.toThrow(/no se puede editar/);
    await expect(prisma.$executeRaw`DELETE FROM "AplicacionAbono" WHERE "abonoId" = ${abono.id}`).rejects.toThrow(/no se pueden editar ni borrar/);
  });

  it('la base rechaza un abono en cero o negativo y una anulación sin motivo', async () => {
    const abono = await prisma.abono.findFirst({ where: { estado: 'ACTIVO' } });
    if (!abono) return;

    await expect(
      prisma.$executeRaw`INSERT INTO "Abono" ("id","ventaId","fecha","valor","medioPago","updatedAt") VALUES (${randomUUID()}, ${abono.ventaId}, now(), 0, 'EFECTIVO', now())`,
    ).rejects.toThrow(/Abono_valor_positivo/);
    await expect(prisma.$executeRaw`UPDATE "Abono" SET "estado" = 'ANULADO' WHERE "id" = ${abono.id}`).rejects.toThrow(/Abono_anulacion_completa/);
  });
});
