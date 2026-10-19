import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { describe, expect, it, vi } from 'vitest';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado.js';
import type { ConfiguracionService } from '../configuracion/configuracion.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ImportacionService } from './importacion.service.js';
import { generarPlantilla } from './plantilla.js';

const USUARIO = { id: 'u1', nombre: 'Gerente de Prueba', email: 'gerente@ejemplo.test', permisos: [] } as unknown as UsuarioAutenticado;

// Prisma de mentira: sin datos en el sistema. Cuenta cada escritura para probar que el modo de prueba no guarda nada.
function armar(opciones: { importacionPrevia?: boolean } = {}) {
  const escrituras = vi.fn();
  const vacio = vi.fn().mockResolvedValue([]);
  const db = {
    proyecto: { findMany: vacio, create: escrituras },
    cliente: { findMany: vacio, create: escrituras },
    vendedor: { findMany: vacio, create: escrituras },
    cuentaBancaria: { findMany: vacio },
    abono: { findMany: vacio, create: escrituras },
    cierreCaja: { findMany: vacio },
    importacion: {
      findUnique: vi.fn().mockResolvedValue(opciones.importacionPrevia ? { id: 'previa', createdAt: new Date('2026-10-01T15:00:00Z'), usuario: { nombre: 'Otra Persona' } } : null),
      create: escrituras,
    },
    $executeRaw: vi.fn().mockResolvedValue(0),
  };
  const prisma = { ...db, $transaction: vi.fn(async (funcion: (tx: typeof db) => unknown) => funcion(db)) };
  const configuracion = {
    listarMediosPago: vi.fn().mockResolvedValue([{ medio: 'EFECTIVO', activo: true }]),
    contextoRecibo: vi.fn().mockResolvedValue({}),
  };
  const servicio = new ImportacionService(prisma as unknown as PrismaService, configuracion as unknown as ConfiguracionService);
  return { servicio, escrituras, prisma };
}

async function archivo(llenar: (hojas: (nombre: string) => ExcelJS.Worksheet) => void) {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load((await generarPlantilla()) as unknown as ExcelJS.Buffer);
  llenar((nombre) => libro.getWorksheet(nombre) as ExcelJS.Worksheet);
  const buffer = Buffer.from(await libro.xlsx.writeBuffer());
  return { buffer, originalname: 'carga.xlsx', huella: createHash('sha256').update(buffer).digest('hex') };
}

const conUnCliente = () =>
  archivo((hoja) => {
    hoja('Clientes').getRow(2).values = ['1000000001', 'CC', 'Cliente de Prueba Uno'];
  });

const conErrores = () =>
  archivo((hoja) => {
    hoja('Clientes').getRow(2).values = ['12', 'CC', 'X'];
  });

describe('ImportacionService · modo de prueba', () => {
  it('valida y devuelve el resumen SIN guardar nada', async () => {
    const { servicio, escrituras, prisma } = armar();
    const { buffer, originalname, huella } = await conUnCliente();
    const resultado = await servicio.validar({ buffer, originalname } as Express.Multer.File);

    expect(resultado).toMatchObject({ huella, puedeConfirmar: true, totalErrores: 0, yaImportado: null, resumen: { clientes: { nuevos: 1, existentes: 0 } } });
    expect(escrituras).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('con errores no se puede confirmar y se informan por hoja y fila', async () => {
    const { servicio } = armar();
    const { buffer, originalname } = await conErrores();
    const resultado = await servicio.validar({ buffer, originalname } as Express.Multer.File);
    expect(resultado.puedeConfirmar).toBe(false);
    expect(resultado.errores[0]).toMatchObject({ hoja: 'Clientes', fila: 2 });
  });

  it('avisa que el mismo archivo ya fue importado y no deja confirmarlo', async () => {
    const { servicio } = armar({ importacionPrevia: true });
    const { buffer, originalname } = await conUnCliente();
    const resultado = await servicio.validar({ buffer, originalname } as Express.Multer.File);
    expect(resultado.puedeConfirmar).toBe(false);
    expect(resultado.yaImportado).toMatchObject({ por: 'Otra Persona' });
  });

  it('exige el archivo', async () => {
    const { servicio } = armar();
    await expect(servicio.validar(undefined)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ImportacionService · confirmación', () => {
  it('rechaza una huella distinta a la del archivo validado', async () => {
    const { servicio, escrituras } = armar();
    const { buffer, originalname } = await conUnCliente();
    await expect(servicio.confirmar({ buffer, originalname } as Express.Multer.File, 'a'.repeat(64), USUARIO)).rejects.toThrow(/no es el mismo que se validó/);
    await expect(servicio.confirmar({ buffer, originalname } as Express.Multer.File, undefined, USUARIO)).rejects.toThrow(/no es el mismo que se validó/);
    expect(escrituras).not.toHaveBeenCalled();
  });

  it('no guarda nada si el archivo tiene errores', async () => {
    const { servicio, escrituras } = armar();
    const { buffer, originalname, huella } = await conErrores();
    await expect(servicio.confirmar({ buffer, originalname } as Express.Multer.File, huella, USUARIO)).rejects.toThrow(/tiene \d+ error/);
    expect(escrituras).not.toHaveBeenCalled();
  });

  it('no importa dos veces el mismo archivo', async () => {
    const { servicio, escrituras } = armar({ importacionPrevia: true });
    const { buffer, originalname, huella } = await conUnCliente();
    await expect(servicio.confirmar({ buffer, originalname } as Express.Multer.File, huella, USUARIO)).rejects.toBeInstanceOf(ConflictException);
    expect(escrituras).not.toHaveBeenCalled();
  });
});
