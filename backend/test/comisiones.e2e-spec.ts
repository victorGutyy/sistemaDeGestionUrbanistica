// Pruebas contra la base de datos de desarrollo (Postgres arriba y backend/.env con DATABASE_URL).
// No dejan datos: cada prueba corre dentro de una transacción que siempre se revierte.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anularComisionEnTx, pagarComisionEnTx } from '../src/comisiones/comision-tx.js';
import { generarComisionEnTx } from '../src/comisiones/generar-comision-tx.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const REVERTIR = new Error('revertir');
const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('Comisiones contra Postgres real (RF-COM-01 a 03)', () => {
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

  // Una venta activa con vendedor, en un proyecto propio de la prueba.
  async function escenario(tx: Tx, tipo: 'ASESOR_INMOBILIARIO' | 'REFERIDO' = 'ASESOR_INMOBILIARIO') {
    const sufijo = randomUUID().slice(0, 8);
    const proyecto = await tx.proyecto.create({ data: { nombre: `Comisiones E2E ${sufijo}`, areaTotal: 1000 } });
    const lote = await tx.lote.create({ data: { proyectoId: proyecto.id, numero: `L-${sufijo}`, area: 100, valorVenta: 50_000_000 } });
    const cliente = await tx.cliente.create({ data: { nombre: `Cliente E2E ${sufijo}`, documento: `E2E-${sufijo}` } });
    const vendedor = await tx.vendedor.create({ data: { tipo, nombre: `Vendedor E2E ${sufijo}`, documento: `V-${sufijo}` } });
    const venta = await tx.venta.create({
      data: { loteId: lote.id, clienteId: cliente.id, vendedorId: vendedor.id, valorTotal: 50_000_000, cuotaInicial: 15_000_000, formaPago: 'CONTADO' },
    });
    return { sufijo, proyecto, lote, cliente, vendedor, venta };
  }

  type Escenario = Awaited<ReturnType<typeof escenario>>;

  const generar = (tx: Tx, e: Escenario) => generarComisionEnTx(tx, { id: e.venta.id, vendedorId: e.vendedor.id, numeroLote: e.lote.numero }, usuario);

  // El valor configurado de cada tipo se fija dentro de la transacción (se revierte), para no depender de lo que haya en la base.
  async function configurar(tx: Tx, tipo: 'ASESOR_INMOBILIARIO' | 'REFERIDO', valor: number) {
    await tx.comisionTipoVendedor.upsert({ where: { tipo }, update: { valor }, create: { tipo, valor } });
  }

  const datosPago = { fecha: new Date(), medioPago: 'EFECTIVO' as const, cuentaId: null, motivoSinSoporte: 'Pago en efectivo sin recibo del vendedor' };

  describe('generar (RF-COM-01)', () => {
    it('crea la comisión con el valor configurado del tipo de vendedor y deja la auditoría', async () => {
      await enTransaccionRevertida(async (tx) => {
        await configurar(tx, 'ASESOR_INMOBILIARIO', 1_000_000);
        const e = await escenario(tx);
        const comision = await generar(tx, e);

        expect(comision).toMatchObject({ ventaId: e.venta.id, vendedorId: e.vendedor.id, tipoVendedor: 'ASESOR_INMOBILIARIO', estado: 'PENDIENTE' });
        expect(comision?.valor.toString()).toBe('1000000');
        expect(await tx.registroAuditoria.count({ where: { accion: 'COMISION_GENERAR', entidadId: comision!.id } })).toBe(1);
      });
    });

    it('un referido recibe el valor de su propio tipo', async () => {
      await enTransaccionRevertida(async (tx) => {
        await configurar(tx, 'REFERIDO', 500_000);
        const e = await escenario(tx, 'REFERIDO');
        expect((await generar(tx, e))?.valor.toString()).toBe('500000');
      });
    });

    it('llamarla dos veces no duplica la comisión', async () => {
      await enTransaccionRevertida(async (tx) => {
        await configurar(tx, 'ASESOR_INMOBILIARIO', 1_000_000);
        const e = await escenario(tx);
        expect(await generar(tx, e)).not.toBeNull();
        expect(await generar(tx, e)).toBeNull();
        expect(await tx.comision.count({ where: { ventaId: e.venta.id } })).toBe(1);
      });
    });

    it('sin valor configurado no se genera, y la base tampoco admite dos comisiones para la misma venta', async () => {
      await enTransaccionRevertida(async (tx) => {
        await configurar(tx, 'ASESOR_INMOBILIARIO', 0);
        const e = await escenario(tx);
        expect(await generar(tx, e)).toBeNull();
      });
      await enTransaccionRevertida(async (tx) => {
        const e = await escenario(tx);
        const datos = { ventaId: e.venta.id, vendedorId: e.vendedor.id, tipoVendedor: 'ASESOR_INMOBILIARIO' as const, valor: 1_000_000 };
        await tx.comision.create({ data: datos });
        await expect(tx.comision.create({ data: datos })).rejects.toThrow();
      });
    });

    it('el valor de una comisión ya generada no cambia si después se cambia la configuración', async () => {
      await enTransaccionRevertida(async (tx) => {
        await configurar(tx, 'ASESOR_INMOBILIARIO', 1_000_000);
        const e = await escenario(tx);
        const comision = await generar(tx, e);
        await configurar(tx, 'ASESOR_INMOBILIARIO', 2_000_000);
        expect((await tx.comision.findUniqueOrThrow({ where: { id: comision!.id } })).valor.toString()).toBe('1000000');
      });
    });
  });

  describe('reglas de la base de datos', () => {
    const nueva = async (tx: Tx, valor: number | string = 1_000_000) => {
      const e = await escenario(tx);
      const comision = await tx.comision.create({ data: { ventaId: e.venta.id, vendedorId: e.vendedor.id, tipoVendedor: 'ASESOR_INMOBILIARIO', valor } });
      return { e, comision };
    };

    it('una comisión no se borra, ni con acceso directo a la base de datos', async () => {
      await enTransaccionRevertida(async (tx) => {
        const { comision } = await nueva(tx);
        await expect(tx.$executeRaw`DELETE FROM "Comision" WHERE "id" = ${comision.id}`).rejects.toThrow(/no se puede borrar/);
      });
    });

    it('el valor es un número entero de pesos mayor a cero', async () => {
      await enTransaccionRevertida(async (tx) => {
        await expect(nueva(tx, 0)).rejects.toThrow(/valor_entero_positivo/);
      });
      await enTransaccionRevertida(async (tx) => {
        await expect(nueva(tx, '1000000.50')).rejects.toThrow(/valor_entero_positivo/);
      });
    });

    it('la venta, el vendedor y el valor de una comisión no se modifican', async () => {
      await enTransaccionRevertida(async (tx) => {
        const { comision } = await nueva(tx);
        await expect(tx.$executeRaw`UPDATE "Comision" SET "valor" = 9000000 WHERE "id" = ${comision.id}`).rejects.toThrow(/no se modifican/);
      });
    });

    it('cada estado lleva los datos que le corresponden', async () => {
      await enTransaccionRevertida(async (tx) => {
        const { comision } = await nueva(tx);
        // Pagada sin su egreso.
        await expect(tx.$executeRaw`UPDATE "Comision" SET "estado" = 'PAGADA' WHERE "id" = ${comision.id}`).rejects.toThrow(/estado_coherente/);
      });
      await enTransaccionRevertida(async (tx) => {
        const { comision } = await nueva(tx);
        // Anulada sin motivo, o con un motivo en blanco.
        await expect(
          tx.$executeRaw`UPDATE "Comision" SET "estado" = 'ANULADA', "anuladaPorId" = ${usuario.id}, "anuladaEn" = now() WHERE "id" = ${comision.id}`,
        ).rejects.toThrow(/estado_coherente/);
      });
      await enTransaccionRevertida(async (tx) => {
        const { comision } = await nueva(tx);
        await expect(
          tx.$executeRaw`UPDATE "Comision" SET "estado" = 'ANULADA', "anuladaPorId" = ${usuario.id}, "anuladaEn" = now(), "motivoAnulacion" = '   ' WHERE "id" = ${comision.id}`,
        ).rejects.toThrow(/estado_coherente/);
      });
    });

    it('el egreso de una comisión debe ser un egreso de origen COMISION', async () => {
      await enTransaccionRevertida(async (tx) => {
        const { e, comision } = await nueva(tx);
        const categoria = await tx.categoriaGasto.findFirstOrThrow({ where: { nombre: 'Comisiones' } });
        const manual = await tx.movimientoFinanciero.create({
          data: { tipo: 'GASTO', fecha: new Date(), valor: 1_000_000, descripcion: 'Egreso manual', proyectoId: e.proyecto.id, categoriaGastoId: categoria.id, medioPago: 'EFECTIVO', motivoSinSoporte: 'x' },
        });
        await expect(
          tx.comision.update({ where: { id: comision.id }, data: { estado: 'PAGADA', movimientoId: manual.id, pagadaPorId: usuario.id, pagadaEn: new Date() } }),
        ).rejects.toThrow(/egreso de origen COMISION/);
      });
    });
  });

  describe('pagar (RF-COM-02 y 03)', () => {
    it('crea el egreso de la categoría Comisiones en el proyecto de la venta y deja la comisión pagada', async () => {
      await enTransaccionRevertida(async (tx) => {
        await configurar(tx, 'ASESOR_INMOBILIARIO', 1_000_000);
        const e = await escenario(tx);
        const comision = await generar(tx, e);
        const pagada = await pagarComisionEnTx(tx, comision!.id, datosPago, usuario);

        expect(pagada).toMatchObject({ estado: 'PAGADA', pagadaPorId: usuario.id });
        const egreso = await tx.movimientoFinanciero.findUniqueOrThrow({ where: { id: pagada.movimientoId! }, include: { categoriaGasto: true } });
        expect(egreso).toMatchObject({ tipo: 'GASTO', origen: 'COMISION', proyectoId: e.proyecto.id, terceroNombre: e.vendedor.nombre, estado: 'ACTIVO' });
        expect(egreso.categoriaGasto?.nombre).toBe('Comisiones');
        expect(egreso.valor.toString()).toBe('1000000');
        expect(await tx.registroAuditoria.count({ where: { accion: 'COMISION_PAGAR', entidadId: comision!.id } })).toBe(1);
      });
    });

    it('no se paga dos veces', async () => {
      await enTransaccionRevertida(async (tx) => {
        await configurar(tx, 'ASESOR_INMOBILIARIO', 1_000_000);
        const e = await escenario(tx);
        const comision = await generar(tx, e);
        await pagarComisionEnTx(tx, comision!.id, datosPago, usuario);
        await expect(pagarComisionEnTx(tx, comision!.id, datosPago, usuario)).rejects.toThrow(/ya está pagada/);
        expect(await tx.movimientoFinanciero.count({ where: { proyectoId: e.proyecto.id, origen: 'COMISION' } })).toBe(1);
      });
    });

    it('un día de caja ya cerrado no admite el pago, y la comisión sigue pendiente', async () => {
      await enTransaccionRevertida(async (tx) => {
        await configurar(tx, 'ASESOR_INMOBILIARIO', 1_000_000);
        const e = await escenario(tx);
        const comision = await generar(tx, e);
        await tx.cierreCaja.create({
          data: {
            tipo: 'SEMANAL',
            desde: dia('2090-01-05'),
            hasta: dia('2090-01-11'),
            efectivoInicial: 0,
            creadoPorId: usuario.id,
            estado: 'CERRADO',
            numero: 9001,
            numeroTexto: 'PRUEBA-9001',
            efectivoEsperado: 100,
            efectivoContado: 100,
            diferencia: 0,
            contenido: { prueba: true },
            cerradoPorId: usuario.id,
            cerradoEn: new Date(),
          },
        });
        await tx.$executeRaw`SAVEPOINT antes_del_pago`;
        await expect(pagarComisionEnTx(tx, comision!.id, { ...datosPago, fecha: new Date(2090, 0, 7) }, usuario)).rejects.toThrow(/cierre de caja/);
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT antes_del_pago`;
        expect((await tx.comision.findUniqueOrThrow({ where: { id: comision!.id } })).estado).toBe('PENDIENTE');
      });
    });

    it('un pago sin soporte ni motivo se rechaza', async () => {
      await enTransaccionRevertida(async (tx) => {
        await configurar(tx, 'ASESOR_INMOBILIARIO', 1_000_000);
        const e = await escenario(tx);
        const comision = await generar(tx, e);
        await tx.$executeRaw`SAVEPOINT antes_del_pago`;
        await expect(pagarComisionEnTx(tx, comision!.id, { ...datosPago, motivoSinSoporte: null }, usuario)).rejects.toThrow(/soporte/);
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT antes_del_pago`;
      });
    });
  });

  describe('anular (RF-COM-02)', () => {
    it('una pendiente se anula con su motivo y no vuelve a cambiar', async () => {
      await enTransaccionRevertida(async (tx) => {
        await configurar(tx, 'ASESOR_INMOBILIARIO', 1_000_000);
        const e = await escenario(tx);
        const comision = await generar(tx, e);
        const anulada = await anularComisionEnTx(tx, comision!.id, 'La venta se cayó', usuario);

        expect(anulada).toMatchObject({ estado: 'ANULADA', anuladaPorId: usuario.id, motivoAnulacion: 'La venta se cayó' });
        await tx.$executeRaw`SAVEPOINT antes`;
        await expect(tx.$executeRaw`UPDATE "Comision" SET "motivoAnulacion" = 'otro' WHERE "id" = ${comision!.id}`).rejects.toThrow(/anulada no se puede modificar/);
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT antes`;
        await expect(anularComisionEnTx(tx, comision!.id, 'Otra vez', usuario)).rejects.toThrow(/ya está anulada/);
        await expect(pagarComisionEnTx(tx, comision!.id, datosPago, usuario)).rejects.toThrow(/ya está anulada/);
      });
    });

    it('una pagada se anula junto con su egreso: la caja y las finanzas dejan de contarla', async () => {
      await enTransaccionRevertida(async (tx) => {
        await configurar(tx, 'ASESOR_INMOBILIARIO', 1_000_000);
        const e = await escenario(tx);
        const comision = await generar(tx, e);
        const pagada = await pagarComisionEnTx(tx, comision!.id, datosPago, usuario);
        await anularComisionEnTx(tx, comision!.id, 'El vendedor devolvió el dinero', usuario);

        const egreso = await tx.movimientoFinanciero.findUniqueOrThrow({ where: { id: pagada.movimientoId! } });
        expect(egreso).toMatchObject({ estado: 'ANULADO', anuladoPorId: usuario.id });
        expect(egreso.motivoAnulacion).toContain('El vendedor devolvió el dinero');
        const final = await tx.comision.findUniqueOrThrow({ where: { id: comision!.id } });
        // Conserva los datos del pago, para el historial.
        expect(final).toMatchObject({ estado: 'ANULADA', movimientoId: pagada.movimientoId });
        const acciones = (await tx.registroAuditoria.findMany({ where: { entidadId: { in: [comision!.id, pagada.movimientoId!] } }, select: { accion: true } })).map((a) => a.accion);
        expect(acciones).toEqual(expect.arrayContaining(['COMISION_PAGAR', 'MOVIMIENTO_ANULAR', 'COMISION_ANULAR']));
      });
    });

    it('una pagada no vuelve a pendiente, ni cambia su pago', async () => {
      await enTransaccionRevertida(async (tx) => {
        await configurar(tx, 'ASESOR_INMOBILIARIO', 1_000_000);
        const e = await escenario(tx);
        const comision = await generar(tx, e);
        await pagarComisionEnTx(tx, comision!.id, datosPago, usuario);
        await tx.$executeRaw`SAVEPOINT antes`;
        await expect(
          tx.$executeRaw`UPDATE "Comision" SET "estado" = 'PENDIENTE', "movimientoId" = NULL, "pagadaPorId" = NULL, "pagadaEn" = NULL WHERE "id" = ${comision!.id}`,
        ).rejects.toThrow(/no vuelve a pendiente/);
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT antes`;
      });
    });
  });
});
