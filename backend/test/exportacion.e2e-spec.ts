// Pruebas contra la base de datos de desarrollo (Postgres arriba y backend/.env con DATABASE_URL).
// La exportación solo lee; deja un registro de auditoría (que es el comportamiento que se prueba).
import 'dotenv/config';
import { PassThrough } from 'node:stream';
import ExcelJS from 'exceljs';
import type { Response } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { UsuarioAutenticado } from '../src/auth/usuario-autenticado.js';
import { ConfiguracionService } from '../src/configuracion/configuracion.service.js';
import { ExportacionService, tablasExportables } from '../src/exportacion/exportacion.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import type { StorageService } from '../src/storage/storage.service.js';

// Un "Response" de mentira: junta lo que se escribe para poder abrir el libro después.
function respuestaFalsa() {
  const flujo = new PassThrough();
  const trozos: Buffer[] = [];
  flujo.on('data', (trozo: Buffer) => trozos.push(trozo));
  const cabeceras: Record<string, string> = {};
  const res = Object.assign(flujo, { set: (valores: Record<string, string>) => Object.assign(cabeceras, valores) }) as unknown as Response;
  return { res, cabeceras, contenido: () => Buffer.concat(trozos), terminado: new Promise<void>((resolver) => flujo.on('end', resolver)) };
}

describe('Exportación completa contra Postgres real (RNF-LEG-02)', () => {
  const prisma = new PrismaService();
  const configuracion = new ConfiguracionService(prisma, { leer: async () => Buffer.alloc(0) } as unknown as StorageService);
  const servicio = new ExportacionService(prisma, configuracion);
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

  it('el libro trae una hoja por cada tabla del esquema y las filas coinciden con las de la base', async () => {
    const { res, cabeceras, contenido, terminado } = respuestaFalsa();
    await servicio.exportar(res, gerente);
    await terminado;

    expect(cabeceras['Content-Type']).toMatch(/spreadsheetml/);
    expect(cabeceras['Content-Disposition']).toMatch(/exportacion-completa-\d{4}-\d{2}-\d{2}\.xlsx/);

    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(contenido() as unknown as ExcelJS.Buffer);
    const tablas = tablasExportables();
    expect(libro.worksheets.map((hoja) => hoja.name)).toEqual(['Resumen', ...tablas.map((tabla) => tabla.modelo)]);

    // Las tablas que más importan para una auditoría de datos: todas sus filas, ni una más ni una menos.
    for (const modelo of ['Cliente', 'Venta', 'Cuota', 'Abono', 'Recibo', 'Lote', 'Proyecto', 'MovimientoFinanciero']) {
      const delegado = (prisma as unknown as Record<string, { count(): Promise<number> }>)[modelo.charAt(0).toLowerCase() + modelo.slice(1)];
      const hoja = libro.getWorksheet(modelo) as ExcelJS.Worksheet;
      expect(hoja.actualRowCount - 1, `filas de ${modelo}`).toBe(await delegado.count());
    }
  });

  it('nunca incluye contraseñas ni tokens, pero sí los demás datos de los usuarios', async () => {
    const { res, contenido, terminado } = respuestaFalsa();
    await servicio.exportar(res, gerente);
    await terminado;

    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(contenido() as unknown as ExcelJS.Buffer);
    const encabezados = (libro.getWorksheet('Usuario') as ExcelJS.Worksheet).getRow(1).values as string[];
    expect(encabezados.filter(Boolean)).toEqual(expect.arrayContaining(['id', 'nombre', 'email', 'estado']));
    expect(encabezados.join(' ')).not.toMatch(/hash|password|token/i);
    // Ninguna celda de todo el libro trae un hash de bcrypt.
    for (const hoja of libro.worksheets) {
      hoja.eachRow((fila) => {
        for (const valor of fila.values as unknown[]) {
          if (typeof valor === 'string') expect(valor.startsWith('$2b$')).toBe(false);
        }
      });
    }
  });

  it('el dinero y las fechas salen con formato usable: números exactos y dd/mm/aaaa', async () => {
    const { res, contenido, terminado } = respuestaFalsa();
    await servicio.exportar(res, gerente);
    await terminado;

    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(contenido() as unknown as ExcelJS.Buffer);
    const hoja = libro.getWorksheet('Venta') as ExcelJS.Worksheet;
    const encabezados = hoja.getRow(1).values as string[];
    const columnaValor = encabezados.indexOf('valorTotal');
    const columnaFecha = encabezados.indexOf('fechaVenta');
    const fila = hoja.getRow(2).values as unknown[];
    expect(typeof fila[columnaValor]).toBe('number');
    expect(String(fila[columnaFecha])).toMatch(/^\d{2}\/\d{2}\/\d{4}( \d{2}:\d{2})?$/);
  });

  it('cada exportación deja en la auditoría quién la hizo', async () => {
    const antes = await prisma.registroAuditoria.count({ where: { accion: 'EXPORTACION_COMPLETA' } });
    const { res, terminado } = respuestaFalsa();
    await servicio.exportar(res, gerente);
    await terminado;
    expect(await prisma.registroAuditoria.count({ where: { accion: 'EXPORTACION_COMPLETA' } })).toBe(antes + 1);
    const registro = await prisma.registroAuditoria.findFirstOrThrow({ where: { accion: 'EXPORTACION_COMPLETA' }, orderBy: { createdAt: 'desc' } });
    expect(registro).toMatchObject({ usuarioId: gerente.id, entidad: 'EXPORTACION' });
  });
});
