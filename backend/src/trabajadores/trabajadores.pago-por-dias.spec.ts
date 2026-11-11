import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { auditoriaDe } from '../test-utils/auditoria.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import { TrabajadoresService } from './trabajadores.service.js';

const D = (valor: string | number) => new Prisma.Decimal(valor);

// CC-05: valor día, cargo de nómina y datos de pago del trabajador. Datos inventados.
const ACTUAL = {
  id: 't-1',
  nombre: 'Persona Inventada',
  nombres: null,
  apellidos: null,
  documento: '000111',
  tipoDocumento: 'CC',
  fechaNacimiento: null,
  sexo: null,
  area: null,
  cargo: 'Auxiliar',
  tipoContrato: 'OBRA_LABOR',
  salarioBase: D('1500000'),
  cargoNominaId: null as string | null,
  valorDia: null as Prisma.Decimal | null,
  banco: null as string | null,
  tipoCuenta: null as string | null,
  numeroCuenta: null as string | null,
  fechaIngreso: new Date(2026, 0, 1),
  fechaRetiro: null,
  motivoRetiro: null,
  telefono: null,
  celular: null,
  email: null,
  estado: 'ACTIVO',
  autorizaDatosSalud: false,
  fechaAutorizacionSalud: null,
  autorizacionSaludRegistradaPorId: null,
};
const CARGO = { id: 'c-1', nombre: 'Auxiliar', valorDia: D('60000'), activo: true };

function montar(actual: object | null = ACTUAL, cargo: object | null = CARGO) {
  const tablas = {
    trabajador: { findUnique: vi.fn().mockResolvedValue(actual), findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn() },
    cargoNomina: { findUnique: vi.fn().mockResolvedValue(cargo) },
    registroAuditoria: { create: vi.fn() },
  };
  tablas.trabajador.create.mockImplementation(({ data }: { data: object }) => Promise.resolve({ ...ACTUAL, ...data }));
  tablas.trabajador.update.mockImplementation(({ data }: { data: object }) => Promise.resolve({ ...ACTUAL, ...data }));
  const prisma = { ...tablas, $transaction: vi.fn((accion: (tx: typeof tablas) => unknown) => accion(tablas)) };
  return { tablas, servicio: new TrabajadoresService(prisma as unknown as PrismaService) };
}

const BASE = { nombre: 'Persona Inventada', documento: '999', cargo: 'Auxiliar', salarioBase: '1800000', fechaIngreso: '2026-01-01' };

describe('Trabajador: crear con valor día y datos de pago (CC-05, RF-PER-20)', () => {
  it('sin valor día usa el sugerido del cargo, y guarda el cargo y los datos de pago', async () => {
    const m = montar(null);
    await m.servicio.crear({ ...BASE, cargoNominaId: 'c-1', banco: ' Banco Inventado ', tipoCuenta: 'Ahorros', numeroCuenta: '1234567890' }, usuarioDePrueba());

    const data = m.tablas.trabajador.create.mock.calls[0][0].data;
    expect(data.cargoNominaId).toBe('c-1');
    expect(data.valorDia.toString()).toBe('60000');
    expect(data).toMatchObject({ banco: 'Banco Inventado', tipoCuenta: 'Ahorros', numeroCuenta: '1234567890' });
  });

  it('el valor día que se escribe manda sobre el sugerido del cargo', async () => {
    const m = montar(null);
    await m.servicio.crear({ ...BASE, cargoNominaId: 'c-1', valorDia: '72000' }, usuarioDePrueba());
    expect(m.tablas.trabajador.create.mock.calls[0][0].data.valorDia.toString()).toBe('72000');
  });

  it('sin cargo ni valor día se crea igual (los trabajadores anteriores no lo tienen)', async () => {
    const m = montar(null);
    await m.servicio.crear(BASE, usuarioDePrueba());
    const data = m.tablas.trabajador.create.mock.calls[0][0].data;
    expect(data.valorDia).toBeUndefined();
    expect(data.cargoNominaId).toBeUndefined();
  });

  it('rechaza un cargo que no existe, uno desactivado y un valor día en cero', async () => {
    await expect(montar(null, null).servicio.crear({ ...BASE, cargoNominaId: 'c-x' }, usuarioDePrueba())).rejects.toBeInstanceOf(NotFoundException);
    await expect(montar(null, { ...CARGO, activo: false }).servicio.crear({ ...BASE, cargoNominaId: 'c-1' }, usuarioDePrueba())).rejects.toThrow(/desactivado/);
    await expect(montar(null).servicio.crear({ ...BASE, valorDia: '0' }, usuarioDePrueba())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('en la auditoría de la creación queda el valor día y el cargo, pero no el número de cuenta', async () => {
    const m = montar(null);
    await m.servicio.crear({ ...BASE, cargoNominaId: 'c-1', numeroCuenta: '1234567890' }, usuarioDePrueba());
    const registro = auditoriaDe(m.tablas.registroAuditoria.create, 'TRABAJADOR_CREAR');
    expect(registro.despues).toMatchObject({ valorDia: '60000', cargoNominaId: 'c-1' });
    expect(JSON.stringify(registro.despues)).not.toContain('1234567890');
  });
});

describe('Trabajador: editar valor día y datos de pago (CC-05, RF-PER-20)', () => {
  it('un cambio de valor día queda en la auditoría con el valor anterior (el valor cambia con el tiempo)', async () => {
    const m = montar({ ...ACTUAL, valorDia: D('60000') });
    await m.servicio.actualizar('t-1', { valorDia: '65000' }, usuarioDePrueba());

    expect(m.tablas.trabajador.update.mock.calls[0][0].data.valorDia.toString()).toBe('65000');
    const registro = auditoriaDe(m.tablas.registroAuditoria.create, 'TRABAJADOR_EDITAR');
    expect(registro.resumen).toMatch(/valor día/);
    expect(registro.antes).toMatchObject({ valorDia: '60000' });
    expect(registro.despues).toMatchObject({ valorDia: '65000' });
  });

  it('el mismo valor día no genera cambio ni auditoría', async () => {
    const m = montar({ ...ACTUAL, valorDia: D('60000') });
    await m.servicio.actualizar('t-1', { valorDia: '60000' }, usuarioDePrueba());
    expect(m.tablas.trabajador.update).not.toHaveBeenCalled();
    expect(m.tablas.registroAuditoria.create).not.toHaveBeenCalled();
  });

  it('en la auditoría el número de cuenta solo muestra los últimos 4 dígitos, antes y después', async () => {
    const m = montar({ ...ACTUAL, numeroCuenta: '1111222233334444' });
    await m.servicio.actualizar('t-1', { numeroCuenta: '5555666677778888' }, usuarioDePrueba());

    const registro = auditoriaDe(m.tablas.registroAuditoria.create, 'TRABAJADOR_EDITAR');
    expect(registro.antes).toMatchObject({ numeroCuenta: '••••4444' });
    expect(registro.despues).toMatchObject({ numeroCuenta: '••••8888' });
    expect(JSON.stringify(registro)).not.toContain('1111222233334444');
    expect(JSON.stringify(registro)).not.toContain('5555666677778888');
    // El valor completo sí se guarda en el trabajador: es el dato con el que se le paga.
    expect(m.tablas.trabajador.update.mock.calls[0][0].data.numeroCuenta).toBe('5555666677778888');
  });

  it('un texto vacío borra el banco, el tipo y el número de cuenta', async () => {
    const m = montar({ ...ACTUAL, banco: 'Banco Inventado', tipoCuenta: 'Ahorros', numeroCuenta: '1234567890' });
    await m.servicio.actualizar('t-1', { banco: '  ', tipoCuenta: '', numeroCuenta: '' }, usuarioDePrueba());
    expect(m.tablas.trabajador.update.mock.calls[0][0].data).toMatchObject({ banco: null, tipoCuenta: null, numeroCuenta: null });
  });

  it('asignar un cargo exige que exista y esté activo', async () => {
    await expect(montar(ACTUAL, null).servicio.actualizar('t-1', { cargoNominaId: 'c-x' }, usuarioDePrueba())).rejects.toBeInstanceOf(NotFoundException);
    await expect(montar(ACTUAL, { ...CARGO, activo: false }).servicio.actualizar('t-1', { cargoNominaId: 'c-1' }, usuarioDePrueba())).rejects.toThrow(/desactivado/);
    const m = montar(ACTUAL);
    await m.servicio.actualizar('t-1', { cargoNominaId: 'c-1' }, usuarioDePrueba());
    expect(m.tablas.trabajador.update.mock.calls[0][0].data.cargoNominaId).toBe('c-1');
  });

  it('un valor día en cero se rechaza', async () => {
    await expect(montar().servicio.actualizar('t-1', { valorDia: '0' }, usuarioDePrueba())).rejects.toBeInstanceOf(BadRequestException);
  });
});
