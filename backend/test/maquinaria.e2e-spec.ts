// Pruebas contra la base de datos de desarrollo (Postgres arriba y backend/.env con DATABASE_URL).
// No dejan datos: cada prueba corre dentro de una transacción que siempre se revierte.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearMovimientoEnTx } from '../src/finanzas/crear-movimiento-tx.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const REVERTIR = new Error('revertir');

describe('Maquinaria contra Postgres real (RF-MAQ-01, 03, 04 y 07)', () => {
  const prisma = new PrismaService();
  let usuario: { id: string; nombre: string; email: string };

  beforeAll(async () => {
    await prisma.$connect();
    usuario = await prisma.usuario.findFirstOrThrow({ select: { id: true, nombre: true, email: true } });
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

  // Un proyecto de maquinaria con un tipo de equipo y un equipo.
  async function escenario(tx: Tx) {
    const sufijo = randomUUID().slice(0, 8);
    const proyecto = await tx.proyecto.create({ data: { nombre: `Maquinaria E2E ${sufijo}`, tipo: 'MAQUINARIA', areaTotal: 1 } });
    const tipo = await tx.tipoEquipo.create({ data: { nombre: `Tipo E2E ${sufijo}` } });
    const equipo = await tx.equipo.create({ data: { proyectoId: proyecto.id, nombre: `Equipo E2E ${sufijo}`, tipoEquipoId: tipo.id, placaSerie: `PL-${sufijo}` } });
    const categoriaGasto = await tx.categoriaGasto.create({ data: { nombre: `Combustible E2E ${sufijo}`, soloMaquinaria: true } });
    const categoriaIngreso = await tx.categoriaIngreso.create({ data: { nombre: `Alquiler E2E ${sufijo}` } });
    return { sufijo, proyecto, tipo, equipo, categoriaGasto, categoriaIngreso };
  }

  const datosEgreso = (e: Awaited<ReturnType<typeof escenario>>) => ({
    tipo: 'GASTO' as const,
    fecha: new Date(2026, 9, 1),
    valor: new Prisma.Decimal(300_000),
    descripcion: 'Combustible de la excavadora',
    proyectoId: e.proyecto.id,
    categoriaId: e.categoriaGasto.id,
    medioPago: 'EFECTIVO' as const,
    motivoSinSoporte: 'Tanqueo sin factura',
    usuario,
  });

  it('un equipo no se borra (ni su tipo), ni con acceso directo a la base de datos', async () => {
    await enTransaccionRevertida(async (tx) => {
      const { equipo } = await escenario(tx);
      await expect(tx.$executeRaw`DELETE FROM "Equipo" WHERE "id" = ${equipo.id}`).rejects.toThrow(/no se puede borrar/);
    });
    await enTransaccionRevertida(async (tx) => {
      const { tipo } = await escenario(tx);
      await expect(tx.$executeRaw`DELETE FROM "TipoEquipo" WHERE "id" = ${tipo.id}`).rejects.toThrow(/no se puede borrar/);
    });
  });

  it('la placa o serie no se repite, sin importar mayúsculas; los equipos sin placa sí pueden repetirse', async () => {
    await enTransaccionRevertida(async (tx) => {
      const { proyecto, tipo, equipo } = await escenario(tx);
      await expect(
        tx.equipo.create({ data: { proyectoId: proyecto.id, nombre: 'Otro equipo', tipoEquipoId: tipo.id, placaSerie: equipo.placaSerie?.toLowerCase() } }),
      ).rejects.toThrow(/Unique constraint|placaSerie/);
    });
    await enTransaccionRevertida(async (tx) => {
      const { proyecto, tipo } = await escenario(tx);
      await tx.equipo.create({ data: { proyectoId: proyecto.id, nombre: 'Sin placa uno', tipoEquipoId: tipo.id } });
      await tx.equipo.create({ data: { proyectoId: proyecto.id, nombre: 'Sin placa dos', tipoEquipoId: tipo.id } });
    });
  });

  it('una baja lleva siempre fecha y motivo (lo exige la base de datos)', async () => {
    await enTransaccionRevertida(async (tx) => {
      const { equipo } = await escenario(tx);
      await tx.$executeRaw`SAVEPOINT intento`;
      await expect(tx.$executeRaw`UPDATE "Equipo" SET "bajaEn" = now() WHERE "id" = ${equipo.id}`).rejects.toThrow(/baja_con_motivo/);
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT intento`;
      await tx.$executeRaw`UPDATE "Equipo" SET "bajaEn" = now(), "bajaMotivo" = 'Vendido' WHERE "id" = ${equipo.id}`;
    });
  });

  it('un movimiento de maquinaria se guarda con su equipo, su flota y su período, y la base lo protege de ediciones', async () => {
    await enTransaccionRevertida(async (tx) => {
      const e = await escenario(tx);
      const egreso = await crearMovimientoEnTx(tx, { ...datosEgreso(e), equipoId: e.equipo.id });
      expect(egreso).toMatchObject({ equipoId: e.equipo.id, flota: false });

      const flota = await crearMovimientoEnTx(tx, { ...datosEgreso(e), flota: true });
      expect(flota).toMatchObject({ equipoId: null, flota: true });

      const alquiler = await crearMovimientoEnTx(tx, {
        tipo: 'INGRESO',
        fecha: new Date(2026, 9, 16),
        valor: new Prisma.Decimal(4_000_000),
        descripcion: 'Alquiler de la excavadora',
        proyectoId: e.proyecto.id,
        categoriaId: e.categoriaIngreso.id,
        medioPago: 'EFECTIVO',
        motivoSinSoporte: 'Pago en efectivo sin recibo',
        equipoId: e.equipo.id,
        terceroNombre: 'Cliente de Prueba',
        terceroDocumento: '1000000001',
        periodoDesde: new Date(2026, 9, 1),
        periodoHasta: new Date(2026, 9, 15),
        usuario,
      });
      expect(alquiler.periodoDesde?.toISOString().slice(0, 10)).toBe('2026-10-01');

      // Inmutabilidad: las columnas nuevas también quedan protegidas.
      await expect(tx.$executeRaw`UPDATE "MovimientoFinanciero" SET "flota" = true, "equipoId" = NULL WHERE "id" = ${egreso.id}`).rejects.toThrow(/no se puede editar/);
    });
  });

  it('las reglas de la base de datos: equipo y flota a la vez, período al revés y equipo de otro proyecto', async () => {
    await enTransaccionRevertida(async (tx) => {
      const e = await escenario(tx);
      const base = {
        tipo: 'GASTO' as const,
        fecha: new Date(2026, 9, 1),
        valor: 1000,
        descripcion: 'Prueba de reglas',
        proyectoId: e.proyecto.id,
        categoriaGastoId: e.categoriaGasto.id,
        medioPago: 'EFECTIVO' as const,
        motivoSinSoporte: 'x',
      };
      const intentar = async (extra: object) => {
        await tx.$executeRaw`SAVEPOINT intento`;
        try {
          await tx.movimientoFinanciero.create({ data: { ...base, ...extra } });
          return null;
        } catch (error) {
          await tx.$executeRaw`ROLLBACK TO SAVEPOINT intento`;
          return error instanceof Error ? error.message : String(error);
        }
      };

      expect(await intentar({ equipoId: e.equipo.id, flota: true })).toMatch(/equipo_o_flota/);
      expect(await intentar({ periodoDesde: new Date(2026, 9, 15), periodoHasta: new Date(2026, 9, 1) })).toMatch(/periodo_completo/);
      expect(await intentar({ periodoDesde: new Date(2026, 9, 15) })).toMatch(/periodo_completo/);
      expect(await intentar({ proyectoId: null, flota: true })).toMatch(/equipo_con_proyecto/);

      const otro = await tx.proyecto.create({ data: { nombre: `Otra maquinaria ${e.sufijo}`, tipo: 'MAQUINARIA', areaTotal: 1 } });
      expect(await intentar({ proyectoId: otro.id, equipoId: e.equipo.id })).toMatch(/mismo proyecto/);

      expect(await intentar({ equipoId: e.equipo.id })).toBeNull();
    });
  });

  it('el servicio rechaza lo que la base también rechazaría, con mensajes claros', async () => {
    await enTransaccionRevertida(async (tx) => {
      const e = await escenario(tx);
      await expect(crearMovimientoEnTx(tx, datosEgreso(e))).rejects.toThrow(/Indica el equipo/);
      await expect(crearMovimientoEnTx(tx, { ...datosEgreso(e), equipoId: e.equipo.id, flota: true })).rejects.toThrow(/no las dos cosas/);

      // Un equipo dado de baja ya no recibe movimientos.
      await tx.$executeRaw`UPDATE "Equipo" SET "bajaEn" = now(), "bajaMotivo" = 'Vendido' WHERE "id" = ${e.equipo.id}`;
      await expect(crearMovimientoEnTx(tx, { ...datosEgreso(e), equipoId: e.equipo.id })).rejects.toThrow(/dado de baja/);
    });
  });

  it('solo el gerente tiene los permisos de baja y de gestión de equipos', async () => {
    const roles = await prisma.rolUsuario.findMany({ select: { clave: true, permisos: true } });
    expect(roles.filter((rol) => rol.permisos.includes('equipos.baja')).map((rol) => rol.clave)).toEqual(['GERENTE']);
    expect(roles.find((rol) => rol.clave === 'GERENTE')?.permisos).toContain('equipos.gestionar');
  });
});
