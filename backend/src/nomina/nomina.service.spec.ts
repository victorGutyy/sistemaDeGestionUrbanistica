import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import type { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { MedioPago, TipoNovedad } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import { NominaService } from './nomina.service.js';
import { auditoriaDe, auditoriasDe } from '../test-utils/auditoria.js';

function crearPrismaFalso() {
  const base = {
    trabajador: { findUnique: vi.fn() },
    cuentaBancaria: { findUnique: vi.fn() },
    pagoNomina: { create: vi.fn(), findMany: vi.fn() },
    // El pago se crea en una transacción que primero revisa que el día no esté en un cierre de caja cerrado.
    $executeRaw: vi.fn().mockResolvedValue(0),
    cierreCaja: { findFirst: vi.fn().mockResolvedValue(null) },
    registroAuditoria: { create: vi.fn() },
  };
  return { ...base, $transaction: vi.fn((callback: (tx: typeof base) => unknown) => callback(base)) };
}

const USUARIO = usuarioDePrueba();
const TRABAJADOR = { id: 'trabajador-1', salarioBase: new Prisma.Decimal('1500000') };

describe('NominaService.crearPago', () => {
  let prisma: ReturnType<typeof crearPrismaFalso>;
  let service: NominaService;

  beforeEach(() => {
    prisma = crearPrismaFalso();
    service = new NominaService(prisma as unknown as PrismaService, {
      exigirMedioPagoActivo: vi.fn().mockResolvedValue(undefined),
    } as unknown as ConfiguracionService);
  });

  it('rechaza si el trabajador no existe', async () => {
    prisma.trabajador.findUnique.mockResolvedValue(null);

    await expect(
      service.crearPago({
        trabajadorId: 'trabajador-x',
        periodoInicio: '2026-09-01',
        periodoFin: '2026-09-30',
        fechaPago: '2026-09-30',
        medioPago: MedioPago.EFECTIVO,
      }, USUARIO),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('usa el salario base actual del trabajador y calcula el valor pagado con las novedades', async () => {
    prisma.trabajador.findUnique.mockResolvedValue(TRABAJADOR);
    prisma.pagoNomina.create.mockResolvedValue({ id: 'pago-1' });

    await service.crearPago({
      trabajadorId: 'trabajador-1',
      periodoInicio: '2026-09-01',
      periodoFin: '2026-09-30',
      fechaPago: '2026-09-30',
      medioPago: MedioPago.EFECTIVO,
      novedades: [
        { tipo: TipoNovedad.HORAS_EXTRA, valor: '100000' },
        { tipo: TipoNovedad.DESCUENTO, valor: '20000' },
      ],
    }, USUARIO);

    const llamada = prisma.pagoNomina.create.mock.calls[0][0];
    expect(llamada.data.salarioBase.toString()).toBe('1500000');
    expect(llamada.data.valorPagado.toString()).toBe('1580000');
    expect(llamada.data.novedades.create).toHaveLength(2);
    expect(llamada.data).toMatchObject({ medioPago: MedioPago.EFECTIVO, cuentaId: null });
  });

  it('no registra un pago con fecha dentro de un cierre de caja cerrado o aprobado (RF-CAJ-05)', async () => {
    prisma.trabajador.findUnique.mockResolvedValue(TRABAJADOR);
    prisma.cierreCaja.findFirst.mockResolvedValue({ numeroTexto: 'CC-000003', desde: new Date('2026-09-01T00:00:00Z'), hasta: new Date('2026-09-30T00:00:00Z') });

    await expect(
      service.crearPago({
        trabajadorId: 'trabajador-1',
        periodoInicio: '2026-09-01',
        periodoFin: '2026-09-30',
        fechaPago: '2026-09-30',
        medioPago: MedioPago.EFECTIVO,
      }, USUARIO),
    ).rejects.toThrow(/CC-000003/);
    expect(prisma.pagoNomina.create).not.toHaveBeenCalled();
  });

  it('un pago por transferencia exige la cuenta de donde salió el dinero y no guarda nada sin ella', async () => {
    prisma.trabajador.findUnique.mockResolvedValue(TRABAJADOR);

    await expect(
      service.crearPago({
        trabajadorId: 'trabajador-1',
        periodoInicio: '2026-09-01',
        periodoFin: '2026-09-30',
        fechaPago: '2026-09-30',
        medioPago: MedioPago.TRANSFERENCIA,
      }, USUARIO),
    ).rejects.toThrow(/de donde salió el dinero/);
    expect(prisma.pagoNomina.create).not.toHaveBeenCalled();
  });

  it('guarda la cuenta de salida cuando el pago no es en efectivo', async () => {
    prisma.trabajador.findUnique.mockResolvedValue(TRABAJADOR);
    prisma.cuentaBancaria.findUnique.mockResolvedValue({ id: 'cuenta-1', alias: 'Ahorros', activa: true });
    prisma.pagoNomina.create.mockResolvedValue({ id: 'pago-1' });

    await service.crearPago({
      trabajadorId: 'trabajador-1',
      periodoInicio: '2026-09-01',
      periodoFin: '2026-09-30',
      fechaPago: '2026-09-30',
      medioPago: MedioPago.TRANSFERENCIA,
      cuentaId: 'cuenta-1',
    }, USUARIO);

    expect(prisma.pagoNomina.create.mock.calls[0][0].data).toMatchObject({ medioPago: MedioPago.TRANSFERENCIA, cuentaId: 'cuenta-1' });
  });
});

describe('NominaService: auditoría (RF-AUD-01)', () => {
  it('registrar un pago deja quién lo hizo, a quién y por cuánto, con sus novedades', async () => {
    const prisma = crearPrismaFalso();
    const service = new NominaService(prisma as unknown as PrismaService, { exigirMedioPagoActivo: vi.fn().mockResolvedValue(undefined) } as unknown as ConfiguracionService);
    prisma.trabajador.findUnique.mockResolvedValue({ ...TRABAJADOR, nombre: 'Trabajador de Prueba' });
    prisma.pagoNomina.create.mockResolvedValue({ id: 'pago-9' });

    await service.crearPago(
      {
        trabajadorId: 'trabajador-1',
        periodoInicio: '2026-09-01',
        periodoFin: '2026-09-30',
        fechaPago: '2026-09-30',
        medioPago: MedioPago.EFECTIVO,
        novedades: [{ tipo: TipoNovedad.DESCUENTO, valor: '20000' }],
      },
      USUARIO,
    );

    const registro = auditoriaDe(prisma.registroAuditoria.create, 'NOMINA_REGISTRAR_PAGO');
    expect(registro).toMatchObject({ entidad: 'NOMINA', entidadId: 'pago-9', usuarioId: USUARIO.id });
    expect(registro.resumen).toContain('Trabajador de Prueba');
    expect(registro.despues).toMatchObject({ salarioBase: '1500000', valorPagado: '1480000', medioPago: 'EFECTIVO', novedades: [{ tipo: 'DESCUENTO', valor: '20000' }] });
  });

  it('un pago rechazado (trabajador inexistente) no deja nada en la auditoría', async () => {
    const prisma = crearPrismaFalso();
    const service = new NominaService(prisma as unknown as PrismaService, { exigirMedioPagoActivo: vi.fn() } as unknown as ConfiguracionService);
    prisma.trabajador.findUnique.mockResolvedValue(null);
    await expect(service.crearPago({ trabajadorId: 'x', periodoInicio: '2026-09-01', periodoFin: '2026-09-30', fechaPago: '2026-09-30', medioPago: MedioPago.EFECTIVO }, USUARIO)).rejects.toBeInstanceOf(NotFoundException);
    expect(auditoriasDe(prisma.registroAuditoria.create)).toEqual([]);
  });
});
