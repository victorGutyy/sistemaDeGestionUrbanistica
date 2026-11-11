import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { auditoriaDe, auditoriasDe } from '../test-utils/auditoria.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import type { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { NominaService } from './nomina.service.js';

const D = (valor: string | number) => new Prisma.Decimal(valor);

function crearPrismaFalso() {
  const tablas = {
    cargoNomina: { findUnique: vi.fn(), findFirst: vi.fn().mockResolvedValue(null), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    registroAuditoria: { create: vi.fn() },
  };
  return { ...tablas, $transaction: vi.fn((accion: (tx: typeof tablas) => unknown) => accion(tablas)) };
}

const servicio = (prisma: ReturnType<typeof crearPrismaFalso>) => new NominaService(prisma as unknown as PrismaService, {} as ConfiguracionService);

describe('Cargos de nómina (CC-05, RF-PER-19)', () => {
  it('para los formularios solo salen los cargos activos; la administración pide todos', async () => {
    const prisma = crearPrismaFalso();
    prisma.cargoNomina.findMany.mockResolvedValue([]);

    await servicio(prisma).listarCargos();
    expect(prisma.cargoNomina.findMany.mock.calls[0][0].where).toEqual({ activo: true });

    await servicio(prisma).listarCargos(true);
    expect(prisma.cargoNomina.findMany.mock.calls[1][0].where).toBeUndefined();
  });

  it('el gerente crea un cargo con su valor día sugerido y queda en la auditoría', async () => {
    const prisma = crearPrismaFalso();
    prisma.cargoNomina.create.mockResolvedValue({ id: 'c-1', nombre: 'Oficial', valorDia: D('90000'), activo: true });

    await servicio(prisma).crearCargo({ nombre: '  Oficial ', valorDia: '90000' }, usuarioDePrueba());

    const llamada = prisma.cargoNomina.create.mock.calls[0][0];
    expect(llamada.data.nombre).toBe('Oficial');
    expect(llamada.data.valorDia.toString()).toBe('90000');
    const registro = auditoriaDe(prisma.registroAuditoria.create, 'CONFIGURACION_CARGO_NOMINA');
    expect(registro).toMatchObject({ entidad: 'CONFIGURACION', entidadId: 'c-1' });
    expect(registro.resumen).toContain('$90.000');
  });

  it('un nombre repetido (sin importar mayúsculas) se rechaza sin auditar', async () => {
    const prisma = crearPrismaFalso();
    prisma.cargoNomina.findFirst.mockResolvedValue({ id: 'c-1', nombre: 'Oficial' });
    await expect(servicio(prisma).crearCargo({ nombre: 'OFICIAL', valorDia: '90000' }, usuarioDePrueba())).rejects.toBeInstanceOf(ConflictException);
    expect(auditoriasDe(prisma.registroAuditoria.create)).toEqual([]);
  });

  it('un valor día en cero se rechaza', async () => {
    const prisma = crearPrismaFalso();
    await expect(servicio(prisma).crearCargo({ nombre: 'Oficial', valorDia: '0' }, usuarioDePrueba())).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.cargoNomina.create).not.toHaveBeenCalled();
  });

  it('cambiar el valor sugerido deja el anterior en la auditoría y dice de cuánto a cuánto', async () => {
    const prisma = crearPrismaFalso();
    prisma.cargoNomina.findUnique.mockResolvedValue({ id: 'c-1', nombre: 'Oficial', valorDia: D('90000'), activo: true });
    prisma.cargoNomina.update.mockResolvedValue({ id: 'c-1', nombre: 'Oficial', valorDia: D('95000'), activo: true });

    await servicio(prisma).actualizarCargo('c-1', { valorDia: '95000' }, usuarioDePrueba());

    const registro = auditoriaDe(prisma.registroAuditoria.create, 'CONFIGURACION_CARGO_NOMINA');
    expect(registro.resumen).toMatch(/de \$90\.000 a \$95\.000/);
    expect(registro.antes).toMatchObject({ valorDia: '90000' });
    expect(registro.despues).toMatchObject({ valorDia: '95000' });
  });

  it('desactivar un cargo no lo borra y queda dicho; uno inexistente es 404', async () => {
    const prisma = crearPrismaFalso();
    prisma.cargoNomina.findUnique.mockResolvedValue({ id: 'c-1', nombre: 'Oficial', valorDia: D('90000'), activo: true });
    prisma.cargoNomina.update.mockResolvedValue({ id: 'c-1', nombre: 'Oficial', valorDia: D('90000'), activo: false });

    await servicio(prisma).actualizarCargo('c-1', { activo: false }, usuarioDePrueba());
    expect(auditoriaDe(prisma.registroAuditoria.create, 'CONFIGURACION_CARGO_NOMINA').resumen).toMatch(/lo desactivó/);

    prisma.cargoNomina.findUnique.mockResolvedValue(null);
    await expect(servicio(prisma).actualizarCargo('c-x', { activo: true }, usuarioDePrueba())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('renombrar a un nombre que ya tiene otro cargo se rechaza', async () => {
    const prisma = crearPrismaFalso();
    prisma.cargoNomina.findUnique.mockResolvedValue({ id: 'c-1', nombre: 'Oficial', valorDia: D('90000'), activo: true });
    prisma.cargoNomina.findFirst.mockResolvedValue({ id: 'c-2', nombre: 'Maestro' });
    await expect(servicio(prisma).actualizarCargo('c-1', { nombre: 'maestro' }, usuarioDePrueba())).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.cargoNomina.update).not.toHaveBeenCalled();
  });
});
