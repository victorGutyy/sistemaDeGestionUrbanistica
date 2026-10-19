// Pruebas contra la base de datos de desarrollo (Postgres arriba y backend/.env con DATABASE_URL).
// No dejan datos: lo que escriben va dentro de una transacción que siempre se revierte.
import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CarteraService } from '../src/cartera/cartera.service.js';
import { ClientesService } from '../src/clientes/clientes.service.js';
import { ConfiguracionService } from '../src/configuracion/configuracion.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import type { StorageService } from '../src/storage/storage.service.js';
import type { UsuarioAutenticado } from '../src/auth/usuario-autenticado.js';

const REVERTIR = new Error('revertir');

describe('Clientes contra Postgres real (RF-CLI-01, RF-CLI-03, RF-CLI-04, RF-CAR-03)', () => {
  const prisma = new PrismaService();
  const storage = { leer: async () => Buffer.alloc(0) } as unknown as StorageService;
  const configuracion = new ConfiguracionService(prisma, storage);
  const clientes = new ClientesService(prisma, configuracion, storage);
  const cartera = new CarteraService(prisma, configuracion);
  let gerente: UsuarioAutenticado;

  beforeAll(async () => {
    await prisma.$connect();
    const usuario = await prisma.usuario.findFirstOrThrow({ include: { rol: true } });
    gerente = {
      id: usuario.id,
      email: usuario.email,
      nombre: usuario.nombre,
      rol: { id: usuario.rol.id, clave: usuario.rol.clave, nombre: usuario.rol.nombre },
      permisos: usuario.rol.permisos,
      proyectoIds: null,
    };
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

  it('los clientes que ya existían quedaron con tipo CC y sin autorización, y la base lo exige', async () => {
    await enTransaccionRevertida(async (tx) => {
      const documento = `E2E-${Date.now()}`;
      const creado = await tx.cliente.create({ data: { nombre: 'Cliente de Prueba E2E', documento } });
      expect(creado).toMatchObject({ tipoDocumento: 'CC', autorizaDatos: false, fechaAutorizacion: null });
      // Una autorización registrada siempre lleva fecha: lo impide la base de datos, no solo la aplicación.
      await expect(tx.$executeRaw`UPDATE "Cliente" SET "autorizaDatos" = true WHERE "id" = ${creado.id}`).rejects.toThrow(/autorizacion_con_fecha/);
    });
  });

  it('la ficha de cada cliente coincide con la cartera: mismo semáforo, saldo vencido e interés de mora', async () => {
    const filas = await cartera.listarPorCliente(gerente);
    expect(filas.length).toBeGreaterThan(0);

    for (const fila of filas.slice(0, 15)) {
      const ficha = await clientes.ficha(fila.cliente.id, gerente);
      expect(ficha.resumen.semaforo).toBe(fila.semaforo);
      expect(ficha.resumen.saldoVencido.toString()).toBe(fila.saldoVencido.toString());
      expect(ficha.resumen.interesMora.toString()).toBe(fila.interesMora.toString());
      // Total vendido menos lo pagado es el saldo, y cada venta vigente aporta su parte.
      expect(ficha.resumen.saldo.toString()).toBe(ficha.resumen.totalVendido.minus(ficha.resumen.totalPagado).toString());
      const sumaDeSaldos = ficha.ventas.filter((venta) => venta.vigente).reduce((total, venta) => total.plus(venta.saldo ?? 0), ficha.resumen.saldo.minus(ficha.resumen.saldo));
      expect(sumaDeSaldos.toString()).toBe(ficha.resumen.saldo.toString());
    }
  });

  it('el estado de cuenta en PDF se genera para un cliente con ventas', async () => {
    const [fila] = await cartera.listarPorCliente(gerente);
    const { buffer, nombreArchivo } = await clientes.estadoCuentaPdf(fila.cliente.id, gerente);
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(nombreArchivo).toBe(`estado-de-cuenta-${fila.cliente.documento}.pdf`);
  });

  it('la búsqueda encuentra al cliente por parte del nombre o del documento', async () => {
    const [fila] = await cartera.listarPorCliente(gerente);
    const porNombre = await clientes.listar(gerente, fila.cliente.nombre.slice(1, 6).toUpperCase());
    expect(porNombre.map((cliente) => cliente.id)).toContain(fila.cliente.id);
    const porDocumento = await clientes.listar(gerente, fila.cliente.documento);
    expect(porDocumento.map((cliente) => cliente.id)).toContain(fila.cliente.id);
    expect(await clientes.listar(gerente, 'zzzz-no-existe-zzzz')).toEqual([]);
  });
});
