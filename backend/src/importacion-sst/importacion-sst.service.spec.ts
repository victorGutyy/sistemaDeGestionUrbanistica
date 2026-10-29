import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AusentismoService } from '../ausentismo/ausentismo.service.js';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { CapacitacionesService } from '../sst/capacitaciones.service.js';
import type { EppService } from '../sst/epp.service.js';
import { auditoriaDe } from '../test-utils/auditoria.js';
import type { TrabajadoresService } from '../trabajadores/trabajadores.service.js';
import { cargarLibroSst, type ResultadoCarga } from './cargar.js';
import { ImportacionSstService } from './importacion-sst.service.js';

// La carga en sí se prueba en cargar.spec.ts; aquí se prueba lo que el servicio decide con su resultado: la prueba previa no
// guarda nada, y la confirmación solo guarda si el archivo es el mismo que se validó, no se había cargado y no tiene errores.
vi.mock('./cargar.js', () => ({ cargarLibroSst: vi.fn() }));

const USUARIO = { id: 'u-1', email: 'gerente@ejemplo.test', nombre: 'Gerente Inventado', permisos: [], proyectoIds: null, rol: { id: 'r', clave: 'GERENTE', nombre: 'Gerente' } } as unknown as UsuarioAutenticado;

const RESUMEN = { filas: { trabajadores: 1, ausentismos: 1, entregasEpp: 0, asistencias: 0 }, trabajadores: { nuevos: 1, existentes: 0 }, ausentismos: 1, entregasEpp: 0, asistencias: { registradas: 0, yaRegistradas: 0 } };
const SIN_ERRORES: ResultadoCarga = { errores: [], avisos: [{ hoja: 'Trabajadores', fila: 3, mensaje: 'Ya existe un trabajador' }], resumen: RESUMEN };
const CON_ERRORES: ResultadoCarga = { errores: [{ hoja: 'Ausentismos', fila: 2, columna: 'Tipo de ausentismo', mensaje: 'No existe el tipo' }], avisos: [], resumen: RESUMEN };

async function archivoXlsx(): Promise<Express.Multer.File> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Trabajadores');
  hoja.addRow(['Documento', 'Nombres', 'Apellidos', 'Cargo', 'Salario base', 'Fecha de ingreso']);
  hoja.addRow(['1000000001', 'Persona', 'Inventada', 'Oficial', 1750905, '15/01/2026']);
  const buffer = Buffer.from(await libro.xlsx.writeBuffer());
  return { buffer, originalname: 'carga-de-prueba.xlsx' } as Express.Multer.File;
}
const huellaDe = (archivo: Express.Multer.File) => createHash('sha256').update(archivo.buffer).digest('hex');

function montar() {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    importacion: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'imp-1', createdAt: new Date(2026, 9, 29), ...data })) },
    registroAuditoria: { create: vi.fn() },
  };
  const prisma = {
    ...tx,
    // Igual que la base de datos: si la función falla, la transacción se revierte y el error sale.
    $transaction: vi.fn((accion: (t: typeof tx) => Promise<unknown>) => accion(tx)),
  };
  const servicio = new ImportacionSstService(prisma as unknown as PrismaService, {} as TrabajadoresService, {} as AusentismoService, {} as EppService, {} as CapacitacionesService);
  return { tx, prisma, servicio };
}

describe('ImportacionSstService.validar: la prueba previa (RF-SST-23)', () => {
  let m: ReturnType<typeof montar>;
  let archivo: Express.Multer.File;
  beforeEach(async () => {
    vi.mocked(cargarLibroSst).mockReset();
    m = montar();
    archivo = await archivoXlsx();
  });

  it('corre la carga y SIEMPRE revierte la transacción: no guarda nada, ni con éxito', async () => {
    vi.mocked(cargarLibroSst).mockResolvedValue(SIN_ERRORES);
    const resultado = await m.servicio.validar(archivo, USUARIO);
    // El error que revierte no sale hacia afuera: la prueba previa responde con lo que habría pasado.
    expect(resultado).toMatchObject({ nombreArchivo: 'carga-de-prueba.xlsx', huella: huellaDe(archivo), puedeConfirmar: true, yaImportado: null, totalErrores: 0, totalAvisos: 1, resumen: RESUMEN });
    expect(m.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(m.tx.importacion.create).not.toHaveBeenCalled();
    expect(m.tx.registroAuditoria.create).not.toHaveBeenCalled();
    // La transacción terminó con un error (así Postgres la deshace), y la carga usó esa misma transacción.
    await expect(m.prisma.$transaction.mock.results[0].value).rejects.toThrow('prueba previa');
    expect(vi.mocked(cargarLibroSst).mock.calls[0][0]).toBe(m.tx);
  });

  it('con errores no se puede confirmar, y los muestra con su hoja, fila y columna', async () => {
    vi.mocked(cargarLibroSst).mockResolvedValue(CON_ERRORES);
    const resultado = await m.servicio.validar(archivo, USUARIO);
    expect(resultado).toMatchObject({ puedeConfirmar: false, totalErrores: 1, errores: CON_ERRORES.errores });
  });

  it('un archivo que ya se cargó no se puede confirmar de nuevo, y dice quién y cuándo', async () => {
    vi.mocked(cargarLibroSst).mockResolvedValue(SIN_ERRORES);
    m.prisma.importacion.findUnique.mockResolvedValue({ createdAt: new Date(2026, 9, 1), usuario: { nombre: 'Otra Persona' } });
    const resultado = await m.servicio.validar(archivo, USUARIO);
    expect(resultado.puedeConfirmar).toBe(false);
    expect(resultado.yaImportado).toEqual({ fecha: new Date(2026, 9, 1), por: 'Otra Persona' });
  });

  it('un error inesperado de la carga sale como error, no como resultado', async () => {
    vi.mocked(cargarLibroSst).mockRejectedValue(new Error('se cayó la base de datos'));
    await expect(m.servicio.validar(archivo, USUARIO)).rejects.toThrow('se cayó la base de datos');
  });

  it('sin archivo o con algo que no es un libro de Excel, rechaza', async () => {
    await expect(m.servicio.validar(undefined, USUARIO)).rejects.toBeInstanceOf(BadRequestException);
    await expect(m.servicio.validar({ buffer: Buffer.from('no es excel'), originalname: 'x.xlsx' } as Express.Multer.File, USUARIO)).rejects.toThrow(/no es un libro de Excel/);
  });
});

describe('ImportacionSstService.confirmar: todo o nada (RF-SST-23)', () => {
  let m: ReturnType<typeof montar>;
  let archivo: Express.Multer.File;
  beforeEach(async () => {
    vi.mocked(cargarLibroSst).mockReset();
    m = montar();
    archivo = await archivoXlsx();
  });

  it('sin errores guarda la importación como de SST, con su resumen, y deja rastro en la auditoría', async () => {
    vi.mocked(cargarLibroSst).mockResolvedValue(SIN_ERRORES);
    const resultado = await m.servicio.confirmar(archivo, huellaDe(archivo), USUARIO);
    expect(resultado).toMatchObject({ id: 'imp-1', nombreArchivo: 'carga-de-prueba.xlsx', resumen: RESUMEN, totalAvisos: 1 });
    expect(m.tx.importacion.create.mock.calls[0][0].data).toMatchObject({ usuarioId: 'u-1', nombreArchivo: 'carga-de-prueba.xlsx', huella: huellaDe(archivo), tipo: 'SST', conciliacion: [] });
    const registro = auditoriaDe(m.tx.registroAuditoria.create, 'IMPORTACION_EJECUTAR');
    expect(registro.resumen).toMatch(/Cargó el archivo "carga-de-prueba.xlsx" de seguridad y salud en el trabajo: 1 trabajador\(es\) nuevo\(s\), 1 ausentismo\(s\)/);
    // Toma el bloqueo antes de cargar, para que no corran dos cargas a la vez.
    expect(m.tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('con un solo error no guarda NADA: ni la importación ni nada de lo cargado', async () => {
    vi.mocked(cargarLibroSst).mockResolvedValue(CON_ERRORES);
    const promesa = m.servicio.confirmar(archivo, huellaDe(archivo), USUARIO);
    await expect(promesa).rejects.toBeInstanceOf(BadRequestException);
    await expect(promesa).rejects.toMatchObject({ response: expect.objectContaining({ codigo: 'IMPORTACION_CON_ERRORES', totalErrores: 1, errores: CON_ERRORES.errores }) });
    expect(m.tx.importacion.create).not.toHaveBeenCalled();
    expect(m.tx.registroAuditoria.create).not.toHaveBeenCalled();
  });

  it('exige el mismo archivo que se validó (la huella) antes de tocar nada', async () => {
    await expect(m.servicio.confirmar(archivo, undefined, USUARIO)).rejects.toThrow(/no es el mismo/);
    await expect(m.servicio.confirmar(archivo, 'a'.repeat(64), USUARIO)).rejects.toThrow(/no es el mismo/);
    await expect(m.servicio.confirmar(archivo, 'no-es-una-huella', USUARIO)).rejects.toThrow(/no es el mismo/);
    expect(m.prisma.$transaction).not.toHaveBeenCalled();
    expect(cargarLibroSst).not.toHaveBeenCalled();
  });

  it('un archivo que ya se cargó no se carga dos veces', async () => {
    m.tx.importacion.findUnique.mockResolvedValue({ id: 'previa' });
    await expect(m.servicio.confirmar(archivo, huellaDe(archivo), USUARIO)).rejects.toBeInstanceOf(ConflictException);
    expect(cargarLibroSst).not.toHaveBeenCalled();
  });

  it('dos confirmaciones a la vez del mismo archivo: la base de datos deja pasar solo una', async () => {
    vi.mocked(cargarLibroSst).mockResolvedValue(SIN_ERRORES);
    m.tx.importacion.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('único', { code: 'P2002', clientVersion: 'prueba' }));
    await expect(m.servicio.confirmar(archivo, huellaDe(archivo), USUARIO)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('ImportacionSstService: plantilla y listado', () => {
  it('la plantilla es un libro de Excel con las hojas de SST', async () => {
    const { servicio } = montar();
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load((await servicio.plantilla()) as unknown as ArrayBuffer);
    expect(libro.worksheets.map((h) => h.name)).toEqual(['Instrucciones', 'Trabajadores', 'Ausentismos', 'Entregas EPP', 'Asistencias']);
  });

  it('el listado trae solo las cargas de SST', async () => {
    const m = montar();
    (m.prisma as unknown as { importacion: { findMany: ReturnType<typeof vi.fn> } }).importacion.findMany = vi.fn().mockResolvedValue([]);
    await m.servicio.listar();
    expect((m.prisma as unknown as { importacion: { findMany: ReturnType<typeof vi.fn> } }).importacion.findMany.mock.calls[0][0].where).toEqual({ tipo: 'SST' });
  });
});
