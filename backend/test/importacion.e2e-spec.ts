// Pruebas contra la base de datos de desarrollo (Postgres arriba y backend/.env con DATABASE_URL).
// No dejan datos: cada prueba corre dentro de una transacción que siempre se revierte (también los consecutivos).
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { empresaParaRecibo } from '../src/abonos/recibo-contenido.js';
import type { ContextoRecibo } from '../src/abonos/crear-abono-tx.js';
import type { Celda } from '../src/importacion/celdas.js';
import { ejecutarPlanEnTx } from '../src/importacion/ejecutar.js';
import type { FilaLeida, LibroLeido } from '../src/importacion/leer-libro.js';
import type { ClaveHoja } from '../src/importacion/plantilla-definicion.js';
import { validarImportacion, type ContextoValidacion } from '../src/importacion/validar.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const REVERTIR = new Error('revertir');

type Filas = Partial<Record<ClaveHoja, Record<string, Celda>[]>>;

function libro(filas: Filas): LibroLeido {
  const hojas = {} as LibroLeido['hojas'];
  for (const clave of ['proyectos', 'lotes', 'clientes', 'ventas', 'cuotas', 'abonos'] as ClaveHoja[]) {
    const datos = filas[clave] ?? [];
    hojas[clave] = { clave, presente: datos.length > 0, filas: datos.map((celdas, indice): FilaLeida => ({ fila: indice + 2, celdas })) };
  }
  return { hojas, problemas: [] };
}

describe('Importación de Excel contra Postgres real (RF-MIG-02 a 04)', () => {
  const prisma = new PrismaService();
  let usuario: { id: string; nombre: string; email: string };
  let contextoRecibo: ContextoRecibo;
  let cuentaId: string;
  let cuentaAlias: string;

  beforeAll(async () => {
    await prisma.$connect();
    usuario = await prisma.usuario.findFirstOrThrow({ select: { id: true, nombre: true, email: true } });
    const empresa = await prisma.configuracionEmpresa.findUniqueOrThrow({ where: { id: 1 } });
    contextoRecibo = { empresa: empresaParaRecibo(empresa), prefijoRecibo: empresa.prefijoRecibo, recibidoPor: usuario.nombre, usuario };
    const cuenta = await prisma.cuentaBancaria.findFirstOrThrow({ where: { activa: true } });
    cuentaId = cuenta.id;
    cuentaAlias = cuenta.alias;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  type Tx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

  async function enTransaccionRevertida(prueba: (tx: Tx) => Promise<void>) {
    await expect(
      prisma.$transaction(
        async (tx) => {
          await prueba(tx);
          throw REVERTIR;
        },
        { timeout: 60_000 },
      ),
    ).rejects.toBe(REVERTIR);
  }

  // Contexto de validación sin nada existente salvo la cuenta de recaudo real (la carga de prueba usa nombres únicos).
  function contexto(): ContextoValidacion {
    return {
      hoy: '2099-12-31',
      proyectos: [],
      clientes: [],
      vendedores: [],
      cuentas: [{ id: cuentaId, alias: cuentaAlias, activa: true }],
      mediosActivos: ['EFECTIVO', 'CONSIGNACION', 'TRANSFERENCIA'],
      referencias: [],
      cierresBloqueantes: [],
    };
  }

  function carga(sufijo: string): Filas {
    const proyecto = `Proyecto Importación ${sufijo}`;
    const documentoUno = `9${sufijo.replace(/\D/g, '').padEnd(8, '1')}1`;
    const documentoDos = `9${sufijo.replace(/\D/g, '').padEnd(8, '1')}2`;
    const lote = (numero: string) => ({ proyecto, manzana: 'A', numero });
    return {
      proyectos: [{ nombre: proyecto, areaTotal: 1000 }],
      lotes: [
        { ...lote('1'), area: 90, valorVenta: 45_000_000 },
        { ...lote('2'), area: 100, valorVenta: 30_000_000 },
        { ...lote('3'), area: 110, valorVenta: 50_000_000 },
      ],
      clientes: [
        { documento: documentoUno, nombre: 'Cliente de Prueba Uno' },
        { documento: documentoDos, nombre: 'Cliente de Prueba Dos' },
      ],
      ventas: [
        { ...lote('1'), documentoCliente: documentoUno, fechaVenta: '10/05/2026', formaPago: 'Financiado', valorTotal: 45_000_000, cuotaInicial: 13_500_000, numeroCuotas: 3, saldoSegunExcel: 21_000_000 },
        { ...lote('2'), documentoCliente: documentoDos, fechaVenta: '15/05/2026', formaPago: 'Contado', valorTotal: 30_000_000 },
      ],
      abonos: [
        { ...lote('1'), fecha: '10/06/2026', valor: 10_500_000, medioPago: 'Efectivo' },
        { ...lote('1'), fecha: '10/05/2026', valor: 13_500_000, medioPago: 'Consignación', cuenta: cuentaAlias, referencia: `REF-${sufijo}-1` },
        { ...lote('2'), fecha: '15/05/2026', valor: 30_000_000, medioPago: 'Transferencia', cuenta: cuentaAlias, referencia: `REF-${sufijo}-2` },
      ],
    };
  }

  it('guarda proyectos, lotes, clientes, ventas, abonos y recibos históricos H- seguidos y sin saltos', async () => {
    const sufijo = randomUUID().slice(0, 8);
    const resultado = validarImportacion(libro(carga(sufijo)), contexto());
    expect(resultado.errores).toEqual([]);
    expect(resultado.conciliacion.find((fila) => fila.lote === '1')).toMatchObject({ saldo: '21000000', estado: 'COINCIDE' });

    await enTransaccionRevertida(async (tx) => {
      const ejecucion = await ejecutarPlanEnTx(tx, resultado.plan, usuario, contextoRecibo);
      expect(ejecucion).toMatchObject({ proyectos: 1, manzanas: 1, lotes: 3, clientes: 2, ventas: 2, abonos: 3 });
      expect(ejecucion.cuotas).toBe(5); // 4 de la venta financiada (0 a 3) y 1 de la de contado

      // Los lotes vendidos quedan VENDIDO (con su historial) y el que no tuvo venta sigue DISPONIBLE.
      const lotes = await tx.lote.findMany({ where: { proyecto: { nombre: `Proyecto Importación ${sufijo}` } }, orderBy: { numero: 'asc' }, include: { historial: true } });
      expect(lotes.map((lote) => [lote.numero, lote.estado])).toEqual([['1', 'VENDIDO'], ['2', 'VENDIDO'], ['3', 'DISPONIBLE']]);
      expect(lotes[0].historial.map((evento) => evento.tipo).sort()).toEqual(['CAMBIO_ESTADO', 'CREACION']);

      // Los abonos entran con recibo histórico: serie H-, números seguidos, en el orden en que se aplicaron.
      const recibos = await tx.recibo.findMany({ where: { abono: { venta: { lote: { proyecto: { nombre: `Proyecto Importación ${sufijo}` } } } } }, orderBy: { numero: 'asc' }, include: { abono: true } });
      expect(recibos).toHaveLength(3);
      expect(recibos.every((recibo) => recibo.esHistorico && recibo.serie === 'RECIBO_HISTORICO' && recibo.numeroTexto.startsWith('H-'))).toBe(true);
      expect(recibos.map((recibo) => recibo.numero - recibos[0].numero)).toEqual([0, 1, 2]);
      expect(ejecucion.recibosHistoricos).toEqual({ cantidad: 3, primero: recibos[0].numeroTexto, ultimo: recibos[2].numeroTexto });
      expect(JSON.stringify(recibos[0].contenido)).toMatch(/Registro histórico/);

      // El pago del 10/05 (consignación) es el primero aunque la hoja lo traiga segundo: se aplica por fecha.
      expect(recibos[0].abono.fecha.toISOString().slice(0, 10)).toBe('2026-05-10');
      expect(recibos[0].abono.registradoPorId).toBe(usuario.id);

      // El dinero aplicado a las cuotas cuadra con el plan de la conciliación.
      const venta = await tx.venta.findFirstOrThrow({
        where: { lote: { numero: '1', proyecto: { nombre: `Proyecto Importación ${sufijo}` } } },
        include: { cuotas: { orderBy: { numero: 'asc' } }, abonos: true },
      });
      expect(venta).toMatchObject({ estado: 'ACTIVA', esExcepcion: false });
      expect(venta.cuotas.map((cuota) => [cuota.numero, cuota.estado])).toEqual([[0, 'PAGADA'], [1, 'PAGADA'], [2, 'PENDIENTE'], [3, 'PENDIENTE']]);
      expect(venta.abonos.reduce((total, abono) => total + Number(abono.valor), 0)).toBe(24_000_000);

      // Quedó la auditoría de lo importado.
      const acciones = await tx.registroAuditoria.groupBy({ by: ['accion'], where: { createdAt: { gte: new Date(Date.now() - 60_000) }, resumen: { contains: sufijo } }, _count: true });
      expect(acciones.map((fila) => fila.accion)).toEqual(expect.arrayContaining(['PROYECTO_CREAR']));
      const auditoriaAbonos = await tx.registroAuditoria.count({ where: { accion: 'ABONO_REGISTRAR', entidadId: { in: recibos.map((recibo) => recibo.abonoId) } } });
      expect(auditoriaAbonos).toBe(3);
    });
  });

  it('todo o nada: si falla una venta a la mitad, no queda nada y el consecutivo no se consume', async () => {
    const sufijo = randomUUID().slice(0, 8);
    const resultado = validarImportacion(libro(carga(sufijo)), contexto());
    expect(resultado.errores).toEqual([]);
    // Se daña la segunda venta (apunta a un lote que no existe) después de que la primera ya se guardó con sus recibos.
    resultado.plan.ventas[1].loteId = randomUUID();

    const antes = await prisma.consecutivo.findUnique({ where: { serie: 'RECIBO_HISTORICO' } });
    await expect(prisma.$transaction((tx) => ejecutarPlanEnTx(tx, resultado.plan, usuario, contextoRecibo), { timeout: 60_000 })).rejects.toThrow();

    expect(await prisma.proyecto.count({ where: { nombre: `Proyecto Importación ${sufijo}` } })).toBe(0);
    expect(await prisma.cliente.count({ where: { documento: { startsWith: '9' }, nombre: { startsWith: 'Cliente de Prueba' }, ventas: { some: { lote: { proyecto: { nombre: `Proyecto Importación ${sufijo}` } } } } } })).toBe(0);
    const despues = await prisma.consecutivo.findUnique({ where: { serie: 'RECIBO_HISTORICO' } });
    expect(despues?.ultimo).toBe(antes?.ultimo);
  });

  it('el registro de una importación no se edita ni se borra, ni siquiera con acceso directo a la base', async () => {
    await enTransaccionRevertida(async (tx) => {
      const huella = randomUUID().replace(/-/g, '').padEnd(64, '0');
      const creada = await tx.importacion.create({ data: { usuarioId: usuario.id, nombreArchivo: 'prueba.xlsx', huella, resumen: {}, conciliacion: [] } });
      await expect(tx.$executeRaw`UPDATE "Importacion" SET "nombreArchivo" = 'otro.xlsx' WHERE "id" = ${creada.id}`).rejects.toThrow(/no se pueden editar ni borrar/);
    });
    await enTransaccionRevertida(async (tx) => {
      const huella = randomUUID().replace(/-/g, '').padEnd(64, '1');
      const creada = await tx.importacion.create({ data: { usuarioId: usuario.id, nombreArchivo: 'prueba.xlsx', huella, resumen: {}, conciliacion: [] } });
      await expect(tx.$executeRaw`DELETE FROM "Importacion" WHERE "id" = ${creada.id}`).rejects.toThrow(/no se pueden editar ni borrar/);
    });
  });

  it('el mismo archivo (misma huella) no se importa dos veces: lo impide la base de datos', async () => {
    const huella = randomUUID().replace(/-/g, '').padEnd(64, '2');
    await enTransaccionRevertida(async (tx) => {
      await tx.importacion.create({ data: { usuarioId: usuario.id, nombreArchivo: 'a.xlsx', huella, resumen: {}, conciliacion: [] } });
      await expect(tx.importacion.create({ data: { usuarioId: usuario.id, nombreArchivo: 'b.xlsx', huella, resumen: {}, conciliacion: [] } })).rejects.toThrow(/Unique constraint|huella/);
    });
  });

  it('solo el gerente tiene el permiso de importar', async () => {
    const roles = await prisma.rolUsuario.findMany({ select: { clave: true, permisos: true } });
    expect(roles.filter((rol) => rol.permisos.includes('importacion.gestionar')).map((rol) => rol.clave)).toEqual(['GERENTE']);
  });
});
