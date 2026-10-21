// Pruebas contra la base de datos de desarrollo (Postgres arriba y backend/.env con DATABASE_URL).
// Solo LEEN: comprueban que los reportes cuadran con los totales que ya calculan el consolidado de caja y la cartera,
// sea cual sea el contenido de la base (por eso no dependen de datos concretos).
import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { UsuarioAutenticado } from '../src/auth/usuario-autenticado.js';
import { CarteraService } from '../src/cartera/cartera.service.js';
import { hoyISO } from '../src/cierres-caja/periodo.js';
import { ConfiguracionService } from '../src/configuracion/configuracion.service.js';
import { FinanzasService } from '../src/finanzas/finanzas.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ReportesService } from '../src/reportes/reportes.service.js';
import type { SeccionReporte } from '../src/reportes/modelo.js';
import type { StorageService } from '../src/storage/storage.service.js';

describe('Reportes contra Postgres real (RF-REP-04 a 07 y 11)', () => {
  const prisma = new PrismaService();
  const storage = { leer: async () => Buffer.alloc(0) } as unknown as StorageService;
  const configuracion = new ConfiguracionService(prisma, storage);
  const finanzas = new FinanzasService(prisma, storage, configuracion);
  const cartera = new CarteraService(prisma, configuracion);
  const reportes = new ReportesService(prisma, configuracion, storage);
  let gerente: UsuarioAutenticado;

  beforeAll(async () => {
    await prisma.$connect();
    const usuario = await prisma.usuario.findFirstOrThrow({ include: { rol: true } });
    gerente = {
      id: usuario.id,
      email: usuario.email,
      nombre: usuario.nombre,
      rol: { id: usuario.rol.id, clave: usuario.rol.clave, nombre: usuario.rol.nombre },
      // El gerente del sistema tiene todos los permisos, también los de los reportes.
      permisos: [...new Set([...usuario.rol.permisos, 'reportes.ver', 'finanzas.ver'])],
      proyectoIds: null,
    };
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const total = (secciones: SeccionReporte[], titulo: string, clave: string) => Number(secciones.find((s) => s.titulo === titulo)?.totales?.[clave]);

  it('el recaudo total coincide con los ingresos por ventas del consolidado de caja', async () => {
    const consolidado = await finanzas.consolidado({}, gerente);
    const reporte = await reportes.generar('recaudo', {}, gerente);
    expect(total(reporte.secciones, 'Por medio de pago', 'total')).toBe(Math.round(Number(consolidado.ingresosPorVentas.toString())));
    // Las cuatro vistas del recaudo suman lo mismo.
    expect(total(reporte.secciones, 'Por cuenta', 'total')).toBe(total(reporte.secciones, 'Por medio de pago', 'total'));
    expect(total(reporte.secciones, 'Por usuario que lo registró', 'total')).toBe(total(reporte.secciones, 'Por medio de pago', 'total'));
  });

  it('los egresos totales (con la nómina) coinciden con los gastos del consolidado de caja', async () => {
    const consolidado = await finanzas.consolidado({}, gerente);
    const reporte = await reportes.generar('egresos', {}, gerente);
    expect(total(reporte.secciones, 'Por categoría', 'total')).toBe(Math.round(Number(consolidado.gastos.toString())));
    expect(total(reporte.secciones, 'Por proyecto', 'total')).toBe(total(reporte.secciones, 'Por categoría', 'total'));
    expect(total(reporte.secciones, 'Categoría por proyecto', 'total')).toBe(total(reporte.secciones, 'Por categoría', 'total'));
  });

  it('el saldo final del flujo de caja de todo el historial es la caja neta del consolidado', async () => {
    const consolidado = await finanzas.consolidado({}, gerente);
    const reporte = await reportes.generar('flujo-caja', { desde: '2015-01-01', hasta: hoyISO(), granularidad: 'MES' }, gerente);
    expect(total(reporte.secciones, 'Flujo de caja por mes', 'saldo')).toBe(Math.round(Number(consolidado.cajaNeta.toString())));
  });

  it('la cartera por edades suma lo mismo que la cartera por proyecto (vencida más por vencer)', async () => {
    const consolidado = (await cartera.reportePorProyecto(gerente)).consolidado;
    const reporte = await reportes.generar('cartera-edades', {}, gerente);
    const esperado = Math.round(Number(consolidado.saldoVencido.toString()) + Number(consolidado.saldoPorVencer.toString()));
    expect(total(reporte.secciones, 'Resumen por edad de mora', 'saldo')).toBe(esperado);
  });

  it('el inventario cuenta todos los lotes de la base', async () => {
    const reporte = await reportes.generar('inventario-lotes', {}, gerente);
    expect(total(reporte.secciones, 'Lotes por proyecto y estado', 'total')).toBe(await prisma.lote.count());
  });

  it('un reporte exportado a PDF y a Excel sale con el contenido de la base', async () => {
    const pdf = await reportes.exportar('recaudo', { formato: 'pdf' }, gerente);
    expect(pdf.buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    const excel = await reportes.exportar('cartera-edades', { formato: 'excel' }, gerente);
    expect(excel.buffer.subarray(0, 2).toString('ascii')).toBe('PK');
  });
});
