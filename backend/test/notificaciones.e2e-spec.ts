// Pruebas contra la base de datos de desarrollo (Postgres arriba y backend/.env con DATABASE_URL).
// No dejan datos: cada prueba corre dentro de una transacción que siempre se revierte.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ConfiguracionService } from '../src/configuracion/configuracion.service.js';
import type { EmailService } from '../src/email/email.service.js';
import { NotificacionesService } from '../src/notificaciones/notificaciones.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RecordatoriosService } from '../src/recordatorios/recordatorios.service.js';
import type { StorageService } from '../src/storage/storage.service.js';

const REVERTIR = new Error('revertir');

describe('Notificaciones contra Postgres real (RF-NOT-01 a 06)', () => {
  const prisma = new PrismaService();

  beforeAll(async () => {
    await prisma.$connect();
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

  const dias = (n: number) => {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + n);
    return fecha;
  };

  // Una venta activa con dos cuotas, cada una con el vencimiento que pida la prueba.
  async function escenario(tx: Tx, vencimientos: number[], correo: string | null = null) {
    const sufijo = randomUUID().slice(0, 8);
    const proyecto = await tx.proyecto.create({ data: { nombre: `Notificaciones E2E ${sufijo}`, areaTotal: 1000 } });
    const lote = await tx.lote.create({ data: { proyectoId: proyecto.id, numero: `L-${sufijo}`, area: 100, valorVenta: 50_000_000 } });
    const cliente = await tx.cliente.create({
      data: { nombre: `Cliente E2E ${sufijo}`, documento: `E2E-${sufijo}`, email: correo ?? `cliente-${sufijo}@ejemplo.test`, telefono: '3001234567' },
    });
    const venta = await tx.venta.create({ data: { loteId: lote.id, clienteId: cliente.id, valorTotal: 50_000_000, cuotaInicial: 0, formaPago: 'FINANCIADO', numeroCuotas: vencimientos.length } });
    const cuotas = [];
    for (const [indice, dia] of vencimientos.entries()) {
      cuotas.push(await tx.cuota.create({ data: { ventaId: venta.id, numero: indice + 1, fechaVencimiento: dias(dia), valor: 1_000_000 } }));
    }
    return { sufijo, proyecto, lote, cliente, venta, cuotas };
  }

  type Escenario = Awaited<ReturnType<typeof escenario>>;

  const base = (e: Escenario) => ({ clienteId: e.cliente.id, ventaId: e.venta.id });

  describe('reglas de la base de datos', () => {
    it('una cuota no puede tener dos recordatorios por correo enviados (RF-NOT-05)', async () => {
      await enTransaccionRevertida(async (tx) => {
        const e = await escenario(tx, [2]);
        const datos = { ...base(e), cuotaId: e.cuotas[0].id, tipo: 'RECORDATORIO' as const, canal: 'CORREO' as const, estado: 'ENVIADA' as const };
        await tx.notificacion.create({ data: datos });
        await expect(tx.notificacion.create({ data: datos })).rejects.toThrow();
      });
    });

    it('sí admite varios intentos fallidos u omitidos, enlaces de WhatsApp y un envío final de la misma cuota', async () => {
      await enTransaccionRevertida(async (tx) => {
        const e = await escenario(tx, [2]);
        const cuotaId = e.cuotas[0].id;
        const intento = (canal: 'CORREO' | 'WHATSAPP', estado: 'ENVIADA' | 'FALLIDA' | 'OMITIDA' | 'ENLACE_ABIERTO') =>
          tx.notificacion.create({ data: { ...base(e), cuotaId, tipo: 'RECORDATORIO', canal, estado } });
        await intento('CORREO', 'FALLIDA');
        await intento('CORREO', 'FALLIDA');
        await intento('CORREO', 'OMITIDA');
        await intento('WHATSAPP', 'ENLACE_ABIERTO');
        await intento('WHATSAPP', 'ENLACE_ABIERTO');
        await intento('CORREO', 'ENVIADA');
        expect(await tx.notificacion.count({ where: { cuotaId } })).toBe(6);
      });
    });

    it('cuotas distintas pueden tener cada una su recordatorio enviado', async () => {
      await enTransaccionRevertida(async (tx) => {
        const e = await escenario(tx, [2, 3]);
        for (const cuota of e.cuotas) {
          await tx.notificacion.create({ data: { ...base(e), cuotaId: cuota.id, tipo: 'RECORDATORIO', canal: 'CORREO', estado: 'ENVIADA' } });
        }
        expect(await tx.notificacion.count({ where: { ventaId: e.venta.id, estado: 'ENVIADA' } })).toBe(2);
      });
    });

    it.each([
      ['un recibo sin su abono', { tipo: 'RECIBO', canal: 'CORREO', estado: 'ENVIADA' }],
      ['un recordatorio sin su cuota', { tipo: 'RECORDATORIO', canal: 'CORREO', estado: 'ENVIADA' }],
      ['WhatsApp con un estado distinto de enlace abierto', { tipo: 'MORA', canal: 'WHATSAPP', estado: 'ENVIADA' }],
      ['un correo con estado de enlace abierto', { tipo: 'MORA', canal: 'CORREO', estado: 'ENLACE_ABIERTO' }],
    ] as const)('la base rechaza %s', async (_nombre, datos) => {
      await enTransaccionRevertida(async (tx) => {
        const e = await escenario(tx, [2]);
        await expect(tx.notificacion.create({ data: { ...base(e), ...datos } })).rejects.toThrow();
      });
    });

    it('el historial no se edita ni se borra, ni con acceso directo a la base (RF-NOT-06)', async () => {
      await enTransaccionRevertida(async (tx) => {
        const e = await escenario(tx, [2]);
        const fila = await tx.notificacion.create({ data: { ...base(e), tipo: 'MORA', canal: 'CORREO', estado: 'FALLIDA', detalle: 'timeout' } });

        await expect(tx.$executeRaw`UPDATE "Notificacion" SET "estado" = 'ENVIADA' WHERE "id" = ${fila.id}`).rejects.toThrow(/no se pueden editar ni borrar/);
      });
      await enTransaccionRevertida(async (tx) => {
        const e = await escenario(tx, [2]);
        const fila = await tx.notificacion.create({ data: { ...base(e), tipo: 'MORA', canal: 'CORREO', estado: 'FALLIDA' } });

        await expect(tx.$executeRaw`DELETE FROM "Notificacion" WHERE "id" = ${fila.id}`).rejects.toThrow(/no se pueden editar ni borrar/);
      });
    });

    it('la configuración trae los parámetros nuevos y no admite menos de un día entre avisos de mora', async () => {
      const empresa = await prisma.configuracionEmpresa.findUniqueOrThrow({ where: { id: 1 } });
      expect(empresa.diasEntreAvisosMora).toBeGreaterThanOrEqual(1);
      expect(typeof empresa.enviarReciboPorCorreo).toBe('boolean');

      await enTransaccionRevertida(async (tx) => {
        await expect(tx.$executeRaw`UPDATE "ConfiguracionEmpresa" SET "diasEntreAvisosMora" = 0 WHERE "id" = 1`).rejects.toThrow();
      });
    });
  });

  // Los servicios reales, con la transacción como base de datos (todo se revierte) y un correo falso que cuenta envíos.
  function servicios(tx: Tx, opciones: { configurado?: boolean; falla?: boolean } = {}) {
    const email = {
      enviar: vi.fn().mockImplementation(() => (opciones.falla ? Promise.reject(new Error('SMTP caído')) : Promise.resolve())),
      estaConfigurado: vi.fn().mockReturnValue(opciones.configurado ?? true),
    };
    const configuracion = { obtenerEmpresa: () => tx.configuracionEmpresa.findUniqueOrThrow({ where: { id: 1 } }) };
    const notificaciones = new NotificacionesService(
      tx as unknown as PrismaService,
      email as unknown as EmailService,
      configuracion as unknown as ConfiguracionService,
      {} as StorageService,
    );
    const recordatorios = new RecordatoriosService(tx as unknown as PrismaService, notificaciones, configuracion as unknown as ConfiguracionService);
    const enviadosA = (correo: string) => email.enviar.mock.calls.filter(([datos]) => (datos as { to: string }).to === correo).length;
    return { email, notificaciones, recordatorios, enviadosA };
  }

  describe('recordatorio de cuota (RF-NOT-02 y 05)', () => {
    it('envía el recordatorio, lo registra y al correr otra vez no lo repite', async () => {
      await enTransaccionRevertida(async (tx) => {
        const e = await escenario(tx, [2]);
        const { recordatorios, enviadosA } = servicios(tx);
        const correo = e.cliente.email as string;

        await recordatorios.enviarRecordatoriosPendientes();
        await recordatorios.enviarRecordatoriosPendientes();

        expect(enviadosA(correo)).toBe(1);
        const filas = await tx.notificacion.findMany({ where: { ventaId: e.venta.id } });
        expect(filas).toHaveLength(1);
        expect(filas[0]).toMatchObject({ tipo: 'RECORDATORIO', canal: 'CORREO', estado: 'ENVIADA', cuotaId: e.cuotas[0].id, destinatario: correo, usuarioId: null });
        expect((await tx.cuota.findUniqueOrThrow({ where: { id: e.cuotas[0].id } })).recordatorioEnviadoEn).not.toBeNull();
      });
    });

    it('una cuota fuera de la ventana de aviso no se recuerda', async () => {
      await enTransaccionRevertida(async (tx) => {
        const e = await escenario(tx, [40]);
        const { recordatorios, enviadosA } = servicios(tx);

        await recordatorios.enviarRecordatoriosPendientes();

        expect(enviadosA(e.cliente.email as string)).toBe(0);
        expect(await tx.notificacion.count({ where: { ventaId: e.venta.id } })).toBe(0);
      });
    });

    it('si el envío falla queda registrada la falla, la cuota se libera y la siguiente ejecución lo reintenta', async () => {
      await enTransaccionRevertida(async (tx) => {
        const e = await escenario(tx, [2]);
        const { recordatorios: conFalla } = servicios(tx, { falla: true });

        await conFalla.enviarRecordatoriosPendientes();

        expect((await tx.cuota.findUniqueOrThrow({ where: { id: e.cuotas[0].id } })).recordatorioEnviadoEn).toBeNull();
        expect(await tx.notificacion.findMany({ where: { ventaId: e.venta.id } })).toEqual([expect.objectContaining({ estado: 'FALLIDA', detalle: 'SMTP caído' })]);

        const { recordatorios: sinFalla, enviadosA } = servicios(tx);
        await sinFalla.enviarRecordatoriosPendientes();

        expect(enviadosA(e.cliente.email as string)).toBe(1);
        expect(await tx.notificacion.count({ where: { ventaId: e.venta.id, estado: 'ENVIADA' } })).toBe(1);
      });
    });

    it('con el correo de la empresa sin configurar anota la omisión una sola vez y no gasta la cuota', async () => {
      await enTransaccionRevertida(async (tx) => {
        const e = await escenario(tx, [2]);
        const { recordatorios, email } = servicios(tx, { configurado: false });

        await recordatorios.enviarRecordatoriosPendientes();
        await recordatorios.enviarRecordatoriosPendientes();

        expect(email.enviar).not.toHaveBeenCalled();
        const filas = await tx.notificacion.findMany({ where: { ventaId: e.venta.id } });
        expect(filas).toEqual([expect.objectContaining({ estado: 'OMITIDA', detalle: 'El correo de la empresa no está configurado' })]);
        expect((await tx.cuota.findUniqueOrThrow({ where: { id: e.cuotas[0].id } })).recordatorioEnviadoEn).toBeNull();
      });
    });
  });

  describe('aviso de mora (RF-NOT-03)', () => {
    it('avisa una vez las cuotas vencidas y no repite antes de los días configurados', async () => {
      await enTransaccionRevertida(async (tx) => {
        const e = await escenario(tx, [-10, -3, 20]);
        const { recordatorios, enviadosA } = servicios(tx);
        const correo = e.cliente.email as string;

        const primera = await recordatorios.enviarAvisosMora();
        const segunda = await recordatorios.enviarAvisosMora();

        expect(primera.enviados).toBeGreaterThanOrEqual(1);
        expect(segunda.enviados).toBe(0);
        expect(enviadosA(correo)).toBe(1);
        const filas = await tx.notificacion.findMany({ where: { ventaId: e.venta.id } });
        expect(filas).toEqual([expect.objectContaining({ tipo: 'MORA', canal: 'CORREO', estado: 'ENVIADA', cuotaId: null })]);
      });
    });

    it('vuelve a avisar cuando ya pasaron los días entre avisos', async () => {
      await enTransaccionRevertida(async (tx) => {
        const e = await escenario(tx, [-10]);
        const empresa = await tx.configuracionEmpresa.findUniqueOrThrow({ where: { id: 1 } });
        // El aviso anterior se anota ya vencido el intervalo (la tabla no se edita, pero sí se puede insertar con otra fecha).
        const antes = new Date(Date.now() - (empresa.diasEntreAvisosMora + 1) * 86_400_000);
        await tx.notificacion.create({ data: { ...base(e), tipo: 'MORA', canal: 'CORREO', estado: 'ENVIADA', createdAt: antes } });
        const { recordatorios, enviadosA } = servicios(tx);

        await recordatorios.enviarAvisosMora();

        expect(enviadosA(e.cliente.email as string)).toBe(1);
        expect(await tx.notificacion.count({ where: { ventaId: e.venta.id, estado: 'ENVIADA' } })).toBe(2);
      });
    });

    it('una venta al día no recibe aviso de mora', async () => {
      await enTransaccionRevertida(async (tx) => {
        const e = await escenario(tx, [5, 35]);
        const { recordatorios, enviadosA } = servicios(tx);

        await recordatorios.enviarAvisosMora();

        expect(enviadosA(e.cliente.email as string)).toBe(0);
        expect(await tx.notificacion.count({ where: { ventaId: e.venta.id, tipo: 'MORA' } })).toBe(0);
      });
    });

    it('una cuota ya pagada no se avisa, aunque su fecha haya vencido', async () => {
      await enTransaccionRevertida(async (tx) => {
        const e = await escenario(tx, [-10]);
        await tx.cuota.update({ where: { id: e.cuotas[0].id }, data: { estado: 'PAGADA' } });
        const { recordatorios, enviadosA } = servicios(tx);

        await recordatorios.enviarAvisosMora();

        expect(enviadosA(e.cliente.email as string)).toBe(0);
      });
    });
  });
});
