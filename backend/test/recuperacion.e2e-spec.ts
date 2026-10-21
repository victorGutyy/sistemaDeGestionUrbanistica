// Pruebas contra la base de datos de desarrollo (Postgres arriba y backend/.env con DATABASE_URL).
// No dejan datos: cada prueba corre dentro de una transacción que siempre se revierte.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { generarToken } from '../src/auth/recuperacion-token.js';
import { RecuperacionService } from '../src/auth/recuperacion.service.js';
import type { ConfiguracionService } from '../src/configuracion/configuracion.service.js';
import type { EmailService } from '../src/email/email.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const REVERTIR = new Error('revertir');

describe('Recuperación de contraseña contra Postgres real (RF-USR-06)', () => {
  const prisma = new PrismaService();
  let rolId: string;

  beforeAll(async () => {
    await prisma.$connect();
    rolId = (await prisma.rolUsuario.findFirstOrThrow({ where: { activo: true }, select: { id: true } })).id;
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

  async function usuarioNuevo(tx: Tx, extra: Record<string, unknown> = {}) {
    const sufijo = randomUUID().slice(0, 8);
    return tx.usuario.create({
      data: { nombre: `Usuario E2E ${sufijo}`, email: `recuperacion-${sufijo}@ejemplo.test`, passwordHash: await bcrypt.hash('clave-vieja-123', 4), rolId, ...extra },
    });
  }

  const enUnaHora = () => new Date(Date.now() + 60 * 60_000);

  describe('reglas de la base de datos', () => {
    async function enlace(tx: Tx) {
      const usuario = await usuarioNuevo(tx);
      const { huella } = generarToken();
      const fila = await tx.recuperacionPassword.create({ data: { usuarioId: usuario.id, tokenHash: huella, venceEn: enUnaHora() } });
      return { usuario, fila, huella };
    }

    it('el enlace solo se puede marcar como usado, y una sola vez', async () => {
      await enTransaccionRevertida(async (tx) => {
        const { fila } = await enlace(tx);
        const usado = await tx.recuperacionPassword.update({ where: { id: fila.id }, data: { usadoEn: new Date() } });
        expect(usado.usadoEn).toBeInstanceOf(Date);
      });
      await enTransaccionRevertida(async (tx) => {
        const { fila } = await enlace(tx);
        await tx.recuperacionPassword.update({ where: { id: fila.id }, data: { usadoEn: new Date() } });
        await expect(tx.$executeRaw`UPDATE "RecuperacionPassword" SET "usadoEn" = NULL WHERE "id" = ${fila.id}`).rejects.toThrow(/ya usado/);
      });
    });

    it.each([
      ['cambiar el vencimiento', (id: string) => `UPDATE "RecuperacionPassword" SET "venceEn" = now() + interval '30 days' WHERE "id" = '${id}'`, /no se puede editar/],
      ['cambiar la huella', (id: string) => `UPDATE "RecuperacionPassword" SET "tokenHash" = '${'a'.repeat(64)}' WHERE "id" = '${id}'`, /no se puede editar/],
      ['borrarlo', (id: string) => `DELETE FROM "RecuperacionPassword" WHERE "id" = '${id}'`, /no se puede borrar/],
    ])('la base rechaza %s', async (_nombre, sql, mensaje) => {
      await enTransaccionRevertida(async (tx) => {
        const { fila } = await enlace(tx);
        await expect(tx.$executeRawUnsafe(sql(fila.id))).rejects.toThrow(mensaje);
      });
    });

    it('rechaza una huella que no es un SHA-256, un vencimiento anterior a la creación y una huella repetida', async () => {
      await enTransaccionRevertida(async (tx) => {
        const usuario = await usuarioNuevo(tx);
        await expect(tx.recuperacionPassword.create({ data: { usuarioId: usuario.id, tokenHash: 'no-es-una-huella', venceEn: enUnaHora() } })).rejects.toThrow();
      });
      await enTransaccionRevertida(async (tx) => {
        const usuario = await usuarioNuevo(tx);
        await expect(tx.recuperacionPassword.create({ data: { usuarioId: usuario.id, tokenHash: generarToken().huella, venceEn: new Date(Date.now() - 60_000) } })).rejects.toThrow();
      });
      await enTransaccionRevertida(async (tx) => {
        const { usuario, huella } = await enlace(tx);
        await expect(tx.recuperacionPassword.create({ data: { usuarioId: usuario.id, tokenHash: huella, venceEn: enUnaHora() } })).rejects.toThrow();
      });
    });

    it('la configuración trae los parámetros nuevos y no admite ceros', async () => {
      const empresa = await prisma.configuracionEmpresa.findUniqueOrThrow({ where: { id: 1 } });
      expect(empresa.minutosVigenciaRecuperacion).toBeGreaterThanOrEqual(1);
      expect(empresa.recuperacionesPorHora).toBeGreaterThanOrEqual(1);
      await enTransaccionRevertida(async (tx) => {
        await expect(tx.$executeRaw`UPDATE "ConfiguracionEmpresa" SET "minutosVigenciaRecuperacion" = 0 WHERE "id" = 1`).rejects.toThrow();
      });
      await enTransaccionRevertida(async (tx) => {
        await expect(tx.$executeRaw`UPDATE "ConfiguracionEmpresa" SET "recuperacionesPorHora" = 0 WHERE "id" = 1`).rejects.toThrow();
      });
    });
  });

  describe('flujo completo con el servicio real', () => {
    function servicio(tx: Tx) {
      const email = { estaConfigurado: vi.fn().mockReturnValue(true), enviar: vi.fn().mockResolvedValue(undefined) };
      const configuracion = { obtenerEmpresa: () => tx.configuracionEmpresa.findUniqueOrThrow({ where: { id: 1 } }) };
      const service = new RecuperacionService(tx as unknown as PrismaService, email as unknown as EmailService, configuracion as unknown as ConfiguracionService);
      const tokenEnviado = (indice = -1) => {
        const llamadas = email.enviar.mock.calls.filter(([datos]) => /restablecer\?token=/.test((datos as { html: string }).html));
        const html = (llamadas.at(indice)?.[0] as { html: string } | undefined)?.html ?? '';
        return /restablecer\?token=([A-Za-z0-9_-]{43})/.exec(html)?.[1] as string;
      };
      return { service, email, tokenEnviado };
    }

    it('pide el enlace, cambia la contraseña, cierra sesiones, desbloquea y el enlace ya no sirve', async () => {
      await enTransaccionRevertida(async (tx) => {
        const usuario = await usuarioNuevo(tx, { intentosFallidos: 3, bloqueadoHasta: enUnaHora() });
        const { service, tokenEnviado, email } = servicio(tx);

        await service.solicitar(usuario.email);
        const token = tokenEnviado();
        await service.restablecer(token, 'clave-nueva-456');

        const despues = await tx.usuario.findUniqueOrThrow({ where: { id: usuario.id } });
        expect(await bcrypt.compare('clave-nueva-456', despues.passwordHash)).toBe(true);
        expect(await bcrypt.compare('clave-vieja-123', despues.passwordHash)).toBe(false);
        expect(despues).toMatchObject({ intentosFallidos: 0, bloqueadoHasta: null });
        expect(despues.sesionesValidasDesde).toBeInstanceOf(Date);
        expect(await tx.registroAuditoria.count({ where: { accion: 'USUARIO_RECUPERAR_PASSWORD', entidadId: usuario.id } })).toBe(1);
        expect(email.enviar.mock.calls.some(([datos]) => /Tu contraseña cambió/.test((datos as { subject: string }).subject))).toBe(true);

        await expect(service.restablecer(token, 'otra-clave-789')).rejects.toThrow(/no es válido o ya venció/);
        expect(await bcrypt.compare('clave-nueva-456', (await tx.usuario.findUniqueOrThrow({ where: { id: usuario.id } })).passwordHash)).toBe(true);
      });
    });

    it('al cambiar la contraseña los demás enlaces pendientes de la cuenta dejan de servir', async () => {
      await enTransaccionRevertida(async (tx) => {
        const usuario = await usuarioNuevo(tx);
        const { service, tokenEnviado } = servicio(tx);

        await service.solicitar(usuario.email);
        await service.solicitar(usuario.email);
        const primero = tokenEnviado(0);
        const segundo = tokenEnviado(1);
        expect(primero).not.toBe(segundo);

        await service.restablecer(segundo, 'clave-nueva-456');
        await expect(service.restablecer(primero, 'clave-nueva-789')).rejects.toThrow(/no es válido o ya venció/);
      });
    });

    it('un enlace vencido no sirve', async () => {
      await enTransaccionRevertida(async (tx) => {
        const usuario = await usuarioNuevo(tx);
        const { service } = servicio(tx);
        const { token, huella } = generarToken();
        // Se inserta ya vencido (creado hace dos horas, venció hace una).
        await tx.recuperacionPassword.create({
          data: { usuarioId: usuario.id, tokenHash: huella, createdAt: new Date(Date.now() - 2 * 60 * 60_000), venceEn: new Date(Date.now() - 60 * 60_000) },
        });

        await expect(service.restablecer(token, 'clave-nueva-456')).rejects.toThrow(/no es válido o ya venció/);
      });
    });

    it('una cuenta desactivada no recibe enlace', async () => {
      await enTransaccionRevertida(async (tx) => {
        const usuario = await usuarioNuevo(tx, { estado: 'INACTIVO' });
        const { service, email } = servicio(tx);

        await service.solicitar(usuario.email);

        expect(email.enviar).not.toHaveBeenCalled();
        expect(await tx.recuperacionPassword.count({ where: { usuarioId: usuario.id } })).toBe(0);
      });
    });

    it('el tope por hora se respeta: a partir de la solicitud siguiente al tope no se crea ni se manda nada', async () => {
      await enTransaccionRevertida(async (tx) => {
        const usuario = await usuarioNuevo(tx);
        const { service, email } = servicio(tx);
        const tope = (await tx.configuracionEmpresa.findUniqueOrThrow({ where: { id: 1 } })).recuperacionesPorHora;

        for (let i = 0; i < tope + 2; i++) await service.solicitar(usuario.email);

        expect(await tx.recuperacionPassword.count({ where: { usuarioId: usuario.id } })).toBe(tope);
        expect(email.enviar).toHaveBeenCalledTimes(tope);
      });
    });

    it('un correo con otras mayúsculas encuentra la cuenta', async () => {
      await enTransaccionRevertida(async (tx) => {
        const usuario = await usuarioNuevo(tx);
        const { service, email } = servicio(tx);

        await service.solicitar(usuario.email.toUpperCase());

        expect(email.enviar).toHaveBeenCalledTimes(1);
      });
    });
  });
});
