import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { TipoNovedad } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { NominaService } from './nomina.service.js';

function crearPrismaFalso() {
  return {
    trabajador: { findUnique: vi.fn() },
    pagoNomina: { create: vi.fn(), findMany: vi.fn() },
  };
}

const TRABAJADOR = { id: 'trabajador-1', salarioBase: new Prisma.Decimal('1500000') };

describe('NominaService.crearPago', () => {
  let prisma: ReturnType<typeof crearPrismaFalso>;
  let service: NominaService;

  beforeEach(() => {
    prisma = crearPrismaFalso();
    service = new NominaService(prisma as unknown as PrismaService);
  });

  it('rechaza si el trabajador no existe', async () => {
    prisma.trabajador.findUnique.mockResolvedValue(null);

    await expect(
      service.crearPago({
        trabajadorId: 'trabajador-x',
        periodoInicio: '2026-09-01',
        periodoFin: '2026-09-30',
        fechaPago: '2026-09-30',
      }),
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
      novedades: [
        { tipo: TipoNovedad.HORAS_EXTRA, valor: '100000' },
        { tipo: TipoNovedad.DESCUENTO, valor: '20000' },
      ],
    });

    const llamada = prisma.pagoNomina.create.mock.calls[0][0];
    expect(llamada.data.salarioBase.toString()).toBe('1500000');
    expect(llamada.data.valorPagado.toString()).toBe('1580000');
    expect(llamada.data.novedades.create).toHaveLength(2);
  });
});
