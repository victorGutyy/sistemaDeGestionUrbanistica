// Pruebas contra la base de datos de desarrollo (Postgres arriba y backend/.env con DATABASE_URL).
// No dejan datos: cada prueba crea sus filas dentro de una transacción que siempre se revierte.
import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exigirFechaAbiertaEnTx } from '../src/cierres-caja/fecha-abierta.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const REVERTIR = new Error('revertir');

// Un período lejano en el futuro, para que nunca choque con cierres reales de la base de desarrollo.
const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('Cierres de caja contra Postgres real (reglas de la base de datos)', () => {
  const prisma = new PrismaService();
  let usuarioId: string;

  beforeAll(async () => {
    await prisma.$connect();
    usuarioId = (await prisma.usuario.findFirstOrThrow()).id;
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

  const borrador = (desde: string, hasta: string, extra: Record<string, unknown> = {}) => ({
    tipo: 'SEMANAL' as const,
    desde: dia(desde),
    hasta: dia(hasta),
    efectivoInicial: 0,
    creadoPorId: usuarioId,
    ...extra,
  });

  const cerrado = (desde: string, hasta: string, numero: number, extra: Record<string, unknown> = {}) => ({
    ...borrador(desde, hasta),
    estado: 'CERRADO' as const,
    numero,
    numeroTexto: `PRUEBA-${numero}`,
    efectivoEsperado: 100,
    efectivoContado: 100,
    diferencia: 0,
    contenido: { prueba: true },
    cerradoPorId: usuarioId,
    cerradoEn: new Date(),
    ...extra,
  });

  it('dos cierres no pueden cubrir el mismo día (RF-CAJ-01)', async () => {
    await enTransaccionRevertida(async (tx) => {
      await tx.cierreCaja.create({ data: borrador('2090-01-05', '2090-01-11') });
      await expect(tx.cierreCaja.create({ data: borrador('2090-01-11', '2090-01-17') })).rejects.toThrow(/CierreCaja_sin_solape/);
    });
    await enTransaccionRevertida(async (tx) => {
      await tx.cierreCaja.create({ data: borrador('2090-01-05', '2090-01-11') });
      // Consecutivos pegados sí se pueden.
      await expect(tx.cierreCaja.create({ data: borrador('2090-01-12', '2090-01-18') })).resolves.toBeDefined();
    });
  });

  it('el período debe ser válido y el efectivo inicial no negativo', async () => {
    await enTransaccionRevertida(async (tx) => {
      await expect(tx.cierreCaja.create({ data: borrador('2090-01-11', '2090-01-05') })).rejects.toThrow(/periodo_valido/);
    });
    await enTransaccionRevertida(async (tx) => {
      await expect(tx.cierreCaja.create({ data: borrador('2090-01-05', '2090-01-11', { efectivoInicial: -1 }) })).rejects.toThrow(/efectivo_inicial_no_negativo/);
    });
  });

  it('un borrador no tiene número y un cierre cerrado sí; la diferencia se explica y cuadra', async () => {
    await enTransaccionRevertida(async (tx) => {
      await expect(tx.cierreCaja.create({ data: borrador('2090-01-05', '2090-01-11', { numero: 1, numeroTexto: 'X-1' }) })).rejects.toThrow(/numero_segun_estado/);
    });
    await enTransaccionRevertida(async (tx) => {
      await expect(tx.cierreCaja.create({ data: cerrado('2090-01-05', '2090-01-11', 9001, { efectivoContado: null }) })).rejects.toThrow(/cierre_completo/);
    });
    await enTransaccionRevertida(async (tx) => {
      await expect(tx.cierreCaja.create({ data: cerrado('2090-01-05', '2090-01-11', 9001, { efectivoContado: 90, diferencia: -10 }) })).rejects.toThrow(/diferencia_explicada/);
    });
    await enTransaccionRevertida(async (tx) => {
      await expect(tx.cierreCaja.create({ data: cerrado('2090-01-05', '2090-01-11', 9001, { efectivoContado: 90, diferencia: 5, explicacionDiferencia: 'No cuadra' }) })).rejects.toThrow(/diferencia_coherente/);
    });
  });

  it('el flujo es el único camino: cerrado solo se aprueba o devuelve, aprobado no cambia nunca (RF-CAJ-04)', async () => {
    await enTransaccionRevertida(async (tx) => {
      const creado = await tx.cierreCaja.create({ data: cerrado('2090-01-05', '2090-01-11', 9001) });
      // Un cierre cerrado no puede volver a borrador ni cambiar sus datos.
      await expect(tx.$executeRaw`UPDATE "CierreCaja" SET "estado" = 'BORRADOR' WHERE "id" = ${creado.id}`).rejects.toThrow();
    });
    await enTransaccionRevertida(async (tx) => {
      const creado = await tx.cierreCaja.create({ data: cerrado('2090-01-05', '2090-01-11', 9001) });
      // Cambiar los datos de un cierre cerrado, sin pasar por aprobar o devolver, no se puede.
      await expect(tx.$executeRaw`UPDATE "CierreCaja" SET "efectivoContado" = 999, "diferencia" = 899, "explicacionDiferencia" = 'x' WHERE "id" = ${creado.id}`).rejects.toThrow(/solo se puede aprobar o devolver/);
    });
    await enTransaccionRevertida(async (tx) => {
      const creado = await tx.cierreCaja.create({ data: cerrado('2090-01-05', '2090-01-11', 9001) });
      // Tampoco se puede aprobar cambiando de paso lo contado.
      await expect(
        tx.$executeRaw`UPDATE "CierreCaja" SET "estado" = 'APROBADO', "resueltoPorId" = ${usuarioId}, "resueltoEn" = now(), "efectivoContado" = 999, "diferencia" = 899, "explicacionDiferencia" = 'x' WHERE "id" = ${creado.id}`,
      ).rejects.toThrow(/no se pueden cambiar/);
    });
    await enTransaccionRevertida(async (tx) => {
      const creado = await tx.cierreCaja.create({ data: cerrado('2090-01-05', '2090-01-11', 9001) });
      const aprobado = await tx.cierreCaja.update({ where: { id: creado.id }, data: { estado: 'APROBADO', resueltoPorId: usuarioId, resueltoEn: new Date() } });
      expect(aprobado.estado).toBe('APROBADO');
      await expect(tx.$executeRaw`UPDATE "CierreCaja" SET "observacionGerente" = 'cambio' WHERE "id" = ${creado.id}`).rejects.toThrow(/aprobado no se puede modificar/);
    });
    await enTransaccionRevertida(async (tx) => {
      const creado = await tx.cierreCaja.create({ data: cerrado('2090-01-05', '2090-01-11', 9001) });
      // Devolver exige la observación del gerente.
      await expect(
        tx.cierreCaja.update({ where: { id: creado.id }, data: { estado: 'DEVUELTO', resueltoPorId: usuarioId, resueltoEn: new Date() } }),
      ).rejects.toThrow(/devuelto_con_observacion/);
    });
  });

  it('solo un borrador se puede descartar', async () => {
    await enTransaccionRevertida(async (tx) => {
      const b = await tx.cierreCaja.create({ data: borrador('2090-01-05', '2090-01-11') });
      await expect(tx.cierreCaja.delete({ where: { id: b.id } })).resolves.toBeDefined();
    });
    await enTransaccionRevertida(async (tx) => {
      const c = await tx.cierreCaja.create({ data: cerrado('2090-01-05', '2090-01-11', 9001) });
      await expect(tx.$executeRaw`DELETE FROM "CierreCaja" WHERE "id" = ${c.id}`).rejects.toThrow(/Solo se puede descartar/);
    });
  });

  it('el historial de pasos solo se agrega', async () => {
    await enTransaccionRevertida(async (tx) => {
      const c = await tx.cierreCaja.create({ data: cerrado('2090-01-05', '2090-01-11', 9001) });
      const paso = await tx.cierreCajaHistorial.create({ data: { cierreId: c.id, estadoAnterior: 'BORRADOR', estadoNuevo: 'CERRADO', usuarioId } });
      await expect(tx.$executeRaw`UPDATE "CierreCajaHistorial" SET "observacion" = 'x' WHERE "id" = ${paso.id}`).rejects.toThrow(/no se pueden editar ni borrar/);
    });
  });

  it('un día dentro de un cierre cerrado o aprobado se bloquea; borrador y devuelto no bloquean (RF-CAJ-05)', async () => {
    await enTransaccionRevertida(async (tx) => {
      await tx.cierreCaja.create({ data: cerrado('2090-02-02', '2090-02-08', 9002) });
      await expect(exigirFechaAbiertaEnTx(tx, new Date(2090, 1, 5))).rejects.toThrow(/PRUEBA-9002/);
      await expect(exigirFechaAbiertaEnTx(tx, new Date(2090, 1, 2))).rejects.toThrow(/PRUEBA-9002/); // primer día
      await expect(exigirFechaAbiertaEnTx(tx, new Date(2090, 1, 8))).rejects.toThrow(/PRUEBA-9002/); // último día
      await expect(exigirFechaAbiertaEnTx(tx, new Date(2090, 1, 9))).resolves.toBeUndefined(); // día siguiente
      await expect(exigirFechaAbiertaEnTx(tx, new Date(2090, 1, 1))).resolves.toBeUndefined(); // día anterior
    });
    await enTransaccionRevertida(async (tx) => {
      await tx.cierreCaja.create({ data: borrador('2090-03-02', '2090-03-08') });
      await expect(exigirFechaAbiertaEnTx(tx, new Date(2090, 2, 5))).resolves.toBeUndefined();
    });
  });

  it('un cierre en proceso detiene a quien registra dinero hasta que termina (bloqueo ordenado)', async () => {
    // Una transacción "cierra" (bloqueo exclusivo) y otra intenta registrar (bloqueo compartido): la segunda espera.
    let cerroElCierre = false;
    let registroTerminoAntes = false;
    const { bloquearRegistrosParaCierreEnTx } = await import('../src/cierres-caja/fecha-abierta.js');

    const cierre = prisma.$transaction(async (tx) => {
      await bloquearRegistrosParaCierreEnTx(tx);
      await new Promise((resolver) => setTimeout(resolver, 400));
      cerroElCierre = true;
    });
    await new Promise((resolver) => setTimeout(resolver, 100)); // deja que el cierre tome el bloqueo
    const registro = prisma.$transaction(async (tx) => {
      await exigirFechaAbiertaEnTx(tx, new Date(2090, 5, 5));
      registroTerminoAntes = !cerroElCierre;
    });

    await Promise.all([cierre, registro]);
    expect(registroTerminoAntes).toBe(false);
  });

  it('el consecutivo de los cierres usa su propia serie', async () => {
    const { siguienteConsecutivo, SERIE_CIERRE_CAJA } = await import('../src/consecutivos/consecutivo.js');
    expect(SERIE_CIERRE_CAJA).toBe('CIERRE_CAJA');
    await enTransaccionRevertida(async (tx) => {
      const a = await siguienteConsecutivo(tx, SERIE_CIERRE_CAJA);
      const b = await siguienteConsecutivo(tx, SERIE_CIERRE_CAJA);
      expect(b).toBe(a + 1);
    });
  });
});
