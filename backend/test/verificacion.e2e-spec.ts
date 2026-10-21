// Pruebas contra la base de datos de desarrollo (Postgres arriba y backend/.env con DATABASE_URL).
// No dejan datos: cada prueba corre dentro de una transacción que siempre se revierte.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearAbonoEnTx, type ContextoRecibo } from '../src/abonos/crear-abono-tx.js';
import { VerificacionService } from '../src/abonos/verificacion.service.js';
import type { ConfiguracionService } from '../src/configuracion/configuracion.service.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { usuarioDePrueba } from '../src/test-utils/usuario-prueba.js';

const REVERTIR = new Error('revertir');

describe('Verificación de abonos contra Postgres real (RF-REC-10)', () => {
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

  // Una venta activa con una cuota de un millón.
  async function escenario(tx: Tx) {
    const sufijo = randomUUID().slice(0, 8);
    const proyecto = await tx.proyecto.create({ data: { nombre: `Verificación E2E ${sufijo}`, areaTotal: 1000 } });
    const lote = await tx.lote.create({ data: { proyectoId: proyecto.id, numero: `L-${sufijo}`, area: 100, valorVenta: 50_000_000 } });
    const cliente = await tx.cliente.create({ data: { nombre: `Cliente E2E ${sufijo}`, documento: `E2E-${sufijo}` } });
    const cuenta = await tx.cuentaBancaria.create({ data: { banco: 'Banco E2E', tipo: 'AHORROS', numero: sufijo, alias: `Cuenta ${sufijo}` } });
    const venta = await tx.venta.create({ data: { loteId: lote.id, clienteId: cliente.id, valorTotal: 1_000_000, cuotaInicial: 0, formaPago: 'CONTADO' } });
    await tx.cuota.create({ data: { ventaId: venta.id, numero: 1, fechaVencimiento: new Date(), valor: 1_000_000 } });
    return { sufijo, proyecto, venta, cuenta, cliente };
  }

  const contexto = (): ContextoRecibo => ({
    empresa: { nombreComercial: 'Prueba', razonSocial: 'Prueba SAS', nit: '1', direccion: null, telefonos: null, correo: null, logoRuta: null, colorPrimario: '#2563eb', textoLegal: null },
    prefijoRecibo: 'RC-',
    recibidoPor: 'Prueba',
    usuario,
  });

  const datos = (e: Awaited<ReturnType<typeof escenario>>, extra: Record<string, unknown> = {}) => ({
    ventaId: e.venta.id,
    fecha: new Date(),
    valor: new Prisma.Decimal(100_000),
    medioPago: 'TRANSFERENCIA' as const,
    cuentaDestinoId: e.cuenta.id,
    referencia: `T-${e.sufijo}`,
    registradoPorId: usuario.id,
    ...extra,
  });

  describe('al registrar el abono', () => {
    it('una transferencia nace por verificar, el efectivo no, y un abono histórico tampoco', async () => {
      await enTransaccionRevertida(async (tx) => {
        const e = await escenario(tx);
        const transferencia = await crearAbonoEnTx(tx, datos(e), contexto());
        const efectivo = await crearAbonoEnTx(tx, datos(e, { medioPago: 'EFECTIVO', cuentaDestinoId: null, referencia: null }), contexto());
        const historico = await crearAbonoEnTx(tx, datos(e, { referencia: `H-${e.sufijo}`, esHistorico: true }), contexto());

        expect(transferencia.abono.verificacion).toBe('POR_VERIFICAR');
        expect(efectivo.abono.verificacion).toBe('NO_REQUIERE');
        expect(historico.abono.verificacion).toBe('NO_REQUIERE');
      });
    });

    it('lo decide la configuración del medio: una transferencia sin verificación y un efectivo con verificación', async () => {
      await enTransaccionRevertida(async (tx) => {
        const e = await escenario(tx);
        await tx.medioPagoConfig.upsert({ where: { medio: 'TRANSFERENCIA' }, update: { requiereVerificacion: false }, create: { medio: 'TRANSFERENCIA', requiereVerificacion: false } });
        await tx.medioPagoConfig.upsert({ where: { medio: 'EFECTIVO' }, update: { requiereVerificacion: true }, create: { medio: 'EFECTIVO', requiereVerificacion: true } });

        const transferencia = await crearAbonoEnTx(tx, datos(e), contexto());
        const efectivo = await crearAbonoEnTx(tx, datos(e, { medioPago: 'EFECTIVO', cuentaDestinoId: null, referencia: null }), contexto());

        expect(transferencia.abono.verificacion).toBe('NO_REQUIERE');
        expect(efectivo.abono.verificacion).toBe('POR_VERIFICAR');
      });
    });
  });

  describe('reglas de la base de datos', () => {
    async function abonoPorVerificar(tx: Tx) {
      const e = await escenario(tx);
      const { abono } = await crearAbonoEnTx(tx, datos(e), contexto());
      expect(abono.verificacion).toBe('POR_VERIFICAR');
      return abono;
    }

    it('pasa de por verificar a verificado con quién y cuándo', async () => {
      await enTransaccionRevertida(async (tx) => {
        const abono = await abonoPorVerificar(tx);
        const verificado = await tx.abono.update({ where: { id: abono.id }, data: { verificacion: 'VERIFICADO', verificadoPorId: usuario.id, verificadoEn: new Date(), notaVerificacion: 'Mov. 77' } });
        expect(verificado).toMatchObject({ verificacion: 'VERIFICADO', verificadoPorId: usuario.id, notaVerificacion: 'Mov. 77' });
      });
    });

    it.each([
      ['un verificado no vuelve a por verificar', async (tx: Tx, id: string) => {
        await tx.abono.update({ where: { id }, data: { verificacion: 'VERIFICADO', verificadoPorId: usuario.id, verificadoEn: new Date() } });
        await tx.$executeRaw`UPDATE "Abono" SET "verificacion" = 'POR_VERIFICAR', "verificadoPorId" = NULL, "verificadoEn" = NULL WHERE "id" = ${id}`;
      }, /solo pasa de/],
      ['los datos de una verificación no se cambian', async (tx: Tx, id: string) => {
        await tx.abono.update({ where: { id }, data: { verificacion: 'VERIFICADO', verificadoPorId: usuario.id, verificadoEn: new Date(), notaVerificacion: 'A' } });
        await tx.$executeRaw`UPDATE "Abono" SET "notaVerificacion" = 'B' WHERE "id" = ${id}`;
      }, /no se modifican/],
      ['por verificar no puede pasar a no requiere', async (tx: Tx, id: string) => {
        await tx.$executeRaw`UPDATE "Abono" SET "verificacion" = 'NO_REQUIERE' WHERE "id" = ${id}`;
      }, /solo pasa de/],
      ['seguir editando el valor sigue prohibido', async (tx: Tx, id: string) => {
        await tx.$executeRaw`UPDATE "Abono" SET "valor" = 1 WHERE "id" = ${id}`;
      }, /no se puede editar/],
    ])('la base rechaza: %s', async (_nombre, accion, mensaje) => {
      await enTransaccionRevertida(async (tx) => {
        const abono = await abonoPorVerificar(tx);
        await expect(accion(tx, abono.id)).rejects.toThrow(mensaje);
      });
    });

    it('un abono anulado no se puede verificar', async () => {
      await enTransaccionRevertida(async (tx) => {
        const abono = await abonoPorVerificar(tx);
        await tx.abono.update({ where: { id: abono.id }, data: { estado: 'ANULADO', anuladoPorId: usuario.id, anuladoEn: new Date(), motivoAnulacion: 'Prueba' } });

        await expect(tx.$executeRaw`UPDATE "Abono" SET "verificacion" = 'VERIFICADO', "verificadoEn" = now() WHERE "id" = ${abono.id}`).rejects.toThrow(/anulado/);
      });
    });

    it('el CHECK exige datos coherentes en cada estado', async () => {
      await enTransaccionRevertida(async (tx) => {
        const abono = await abonoPorVerificar(tx);
        await expect(tx.$executeRaw`UPDATE "Abono" SET "verificacion" = 'VERIFICADO' WHERE "id" = ${abono.id}`).rejects.toThrow(/verificacion_coherente/);
      });
      // Un abono que no está verificado no puede traer datos de verificación (se prueba al insertar: al editar, el
      // trigger lo frena antes que el CHECK).
      await enTransaccionRevertida(async (tx) => {
        const e = await escenario(tx);
        await expect(
          tx.abono.create({ data: { ventaId: e.venta.id, fecha: new Date(), valor: 1000, medioPago: 'EFECTIVO', verificacion: 'POR_VERIFICAR', notaVerificacion: 'x' } }),
        ).rejects.toThrow();
      });
    });

    it('la configuración no admite días de alerta negativos', async () => {
      await enTransaccionRevertida(async (tx) => {
        await expect(tx.$executeRaw`UPDATE "ConfiguracionEmpresa" SET "diasAlertaVerificacion" = -1 WHERE "id" = 1`).rejects.toThrow();
      });
    });
  });

  describe('servicio de verificación', () => {
    function servicio(tx: Tx) {
      const configuracion = { obtenerEmpresa: () => tx.configuracionEmpresa.findUniqueOrThrow({ where: { id: 1 } }) };
      return new VerificacionService(tx as unknown as PrismaService, configuracion as unknown as ConfiguracionService);
    }

    it('lista lo pendiente, lo verifica y deja de listarlo, con su auditoría', async () => {
      await enTransaccionRevertida(async (tx) => {
        const e = await escenario(tx);
        const { abono } = await crearAbonoEnTx(tx, datos(e), contexto());
        const service = servicio(tx);
        const gerente = { ...usuarioDePrueba(), id: usuario.id, nombre: usuario.nombre, email: usuario.email };

        const antes = await service.listarPorVerificar({ proyectoId: e.proyecto.id }, gerente);
        expect(antes.total).toBe(1);
        expect(antes.abonos[0]).toMatchObject({ id: abono.id, diasEspera: 0, enAlerta: false });
        expect(antes.valorTotal.toString()).toBe('100000');

        const resultado = await service.verificar([abono.id], 'Extracto de octubre', gerente);
        expect(resultado.verificados).toBe(1);

        const despues = await service.listarPorVerificar({ proyectoId: e.proyecto.id }, gerente);
        expect(despues.total).toBe(0);
        const guardado = await tx.abono.findUniqueOrThrow({ where: { id: abono.id } });
        expect(guardado).toMatchObject({ verificacion: 'VERIFICADO', verificadoPorId: usuario.id, notaVerificacion: 'Extracto de octubre' });
        expect(guardado.verificadoEn).toBeInstanceOf(Date);
        expect(await tx.registroAuditoria.count({ where: { accion: 'ABONO_VERIFICAR', entidadId: abono.id } })).toBe(1);
      });
    });

    it('no se verifica dos veces', async () => {
      await enTransaccionRevertida(async (tx) => {
        const e = await escenario(tx);
        const { abono } = await crearAbonoEnTx(tx, datos(e), contexto());
        const service = servicio(tx);
        const gerente = { ...usuarioDePrueba(), id: usuario.id, nombre: usuario.nombre, email: usuario.email };

        await service.verificar([abono.id], undefined, gerente);
        await expect(service.verificar([abono.id], undefined, gerente)).rejects.toThrow(/ya fue verificado/);
      });
    });

    it('el rol restringido a otro proyecto no ve ni puede verificar el abono', async () => {
      await enTransaccionRevertida(async (tx) => {
        const e = await escenario(tx);
        const { abono } = await crearAbonoEnTx(tx, datos(e), contexto());
        const service = servicio(tx);
        const ajeno = { ...usuarioDePrueba([randomUUID()]), id: usuario.id };

        expect((await service.listarPorVerificar({}, ajeno)).abonos.some((a) => a.id === abono.id)).toBe(false);
        await expect(service.verificar([abono.id], undefined, ajeno)).rejects.toThrow(/no existe/);
      });
    });

    it('el resumen del panel cuenta lo pendiente y se pone en alerta con umbral 0', async () => {
      await enTransaccionRevertida(async (tx) => {
        const e = await escenario(tx);
        await crearAbonoEnTx(tx, datos(e), contexto());
        await tx.configuracionEmpresa.update({ where: { id: 1 }, data: { diasAlertaVerificacion: 0 } });
        const service = servicio(tx);

        const resumen = await service.resumenPorVerificar({ ...usuarioDePrueba(), id: usuario.id }, e.proyecto.id);

        expect(resumen).toMatchObject({ cantidad: 1, masAntiguaDias: 0, enAlerta: true });
        expect(resumen.valor.toString()).toBe('100000');
      });
    });
  });
});
