// Pruebas contra la base de datos de desarrollo (Postgres arriba y backend/.env con DATABASE_URL).
// No dejan datos: cada prueba crea sus filas dentro de una transacción que siempre se revierte.
import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registrarAuditoria } from '../src/auditoria/auditoria.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const REVERTIR = new Error('revertir');

describe('Auditoría contra Postgres real (RF-AUD-03)', () => {
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

  const evento = { usuario: undefined as unknown, accion: 'LOTE_CREAR' as const, entidad: 'LOTE' as const, entidadId: 'prueba', resumen: 'Registro de prueba', despues: { numero: 'L-1' } };

  it('se puede agregar un registro, pero nadie lo edita ni lo borra, ni siquiera con acceso directo a la base', async () => {
    await enTransaccionRevertida(async (tx) => {
      await registrarAuditoria(tx, { ...evento, usuario });
      const registro = await tx.registroAuditoria.findFirstOrThrow({ where: { entidadId: 'prueba' } });
      expect(registro).toMatchObject({ usuarioId: usuario.id, usuarioNombre: usuario.nombre, accion: 'LOTE_CREAR', despues: { numero: 'L-1' } });
      await expect(tx.$executeRaw`UPDATE "RegistroAuditoria" SET "resumen" = 'alterado' WHERE "id" = ${registro.id}`).rejects.toThrow(/no se pueden editar ni borrar/);
    });
    await enTransaccionRevertida(async (tx) => {
      await registrarAuditoria(tx, { ...evento, usuario });
      const registro = await tx.registroAuditoria.findFirstOrThrow({ where: { entidadId: 'prueba' } });
      await expect(tx.$executeRaw`DELETE FROM "RegistroAuditoria" WHERE "id" = ${registro.id}`).rejects.toThrow(/no se pueden editar ni borrar/);
    });
  });

  it('la acción y su auditoría son atómicas: si una falla, la base revierte las dos', async () => {
    const antes = await prisma.registroAuditoria.count({ where: { entidadId: 'prueba-atomica' } });
    const categoria = await prisma.categoriaIngreso.findFirstOrThrow();

    await expect(
      prisma.$transaction(async (tx) => {
        // La "acción": un ingreso de verdad...
        await tx.movimientoFinanciero.create({
          data: { tipo: 'INGRESO', fecha: new Date(2026, 9, 1), valor: 1000, descripcion: 'Prueba atómica', categoriaIngresoId: categoria.id, medioPago: 'EFECTIVO', registradoPorId: usuario.id },
        });
        // ...y su auditoría, que falla (resumen vacío: lo rechaza la base de datos).
        await registrarAuditoria(tx, { ...evento, usuario, entidadId: 'prueba-atomica', resumen: '   ' });
      }),
    ).rejects.toThrow(/resumen_no_vacio/);

    expect(await prisma.registroAuditoria.count({ where: { entidadId: 'prueba-atomica' } })).toBe(antes);
    expect(await prisma.movimientoFinanciero.count({ where: { descripcion: 'Prueba atómica' } })).toBe(0);
  });

  it('el registro exige un usuario real y un resumen en español', async () => {
    await enTransaccionRevertida(async (tx) => {
      await expect(registrarAuditoria(tx, { ...evento, usuario: { id: '00000000-0000-4000-8000-000000000000', nombre: 'Nadie', email: 'nadie@ejemplo.test' } })).rejects.toThrow();
    });
  });

  it('solo el gerente tiene el permiso de consulta de la auditoría', async () => {
    const roles = await prisma.rolUsuario.findMany({ select: { clave: true, permisos: true } });
    expect(roles.filter((r) => r.permisos.includes('auditoria.ver')).map((r) => r.clave)).toEqual(['GERENTE']);
  });
});
