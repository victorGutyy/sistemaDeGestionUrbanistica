import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoCuota } from '../generated/prisma/enums.js';
import type { EmailService } from '../email/email.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { RecordatoriosService } from './recordatorios.service.js';

function crearPrismaFalso() {
  return {
    venta: { findMany: vi.fn() },
    cuota: { update: vi.fn() },
  };
}

const HOY = new Date();

function cuotaQueVenceEn(dias: number, overrides: Partial<{ estado: EstadoCuota; recordatorioEnviadoEn: Date | null }> = {}) {
  const fecha = new Date(HOY);
  fecha.setDate(fecha.getDate() + dias);
  return {
    id: `cuota-${dias}`,
    numero: 1,
    fechaVencimiento: fecha,
    valor: new Prisma.Decimal('1000000'),
    estado: overrides.estado ?? EstadoCuota.PENDIENTE,
    recordatorioEnviadoEn: overrides.recordatorioEnviadoEn ?? null,
  };
}

describe('RecordatoriosService.enviarRecordatoriosPendientes', () => {
  let prisma: ReturnType<typeof crearPrismaFalso>;
  let email: { enviar: ReturnType<typeof vi.fn> };
  let service: RecordatoriosService;

  beforeEach(() => {
    prisma = crearPrismaFalso();
    email = { enviar: vi.fn() };
    service = new RecordatoriosService(prisma as unknown as PrismaService, email as unknown as EmailService);
  });

  it('envía el correo y marca la cuota cuando el cliente tiene email y la cuota está en la ventana de aviso', async () => {
    const cuota = cuotaQueVenceEn(3);
    prisma.venta.findMany.mockResolvedValue([
      {
        cliente: { email: 'cliente@test.com', nombre: 'Ana' },
        lote: { numero: 'L-1', proyecto: { nombre: 'Proyecto Test' } },
        cuotas: [cuota],
      },
    ]);

    const resultado = await service.enviarRecordatoriosPendientes();

    expect(email.enviar).toHaveBeenCalledTimes(1);
    expect(email.enviar).toHaveBeenCalledWith(expect.objectContaining({ to: 'cliente@test.com' }));
    expect(prisma.cuota.update).toHaveBeenCalledWith({
      where: { id: cuota.id },
      data: { recordatorioEnviadoEn: expect.any(Date) },
    });
    expect(resultado.enviados).toBe(1);
    expect(resultado.omitidosSinCorreo).toBe(0);
  });

  it('omite (sin enviar ni marcar) cuando el cliente no tiene correo registrado', async () => {
    const cuota = cuotaQueVenceEn(2);
    prisma.venta.findMany.mockResolvedValue([
      {
        cliente: { email: null, nombre: 'Ana' },
        lote: { numero: 'L-1', proyecto: { nombre: 'Proyecto Test' } },
        cuotas: [cuota],
      },
    ]);

    const resultado = await service.enviarRecordatoriosPendientes();

    expect(email.enviar).not.toHaveBeenCalled();
    expect(prisma.cuota.update).not.toHaveBeenCalled();
    expect(resultado.omitidosSinCorreo).toBe(1);
  });

  it('no envía nada si ninguna cuota está en la ventana de aviso', async () => {
    const cuota = cuotaQueVenceEn(20);
    prisma.venta.findMany.mockResolvedValue([
      {
        cliente: { email: 'cliente@test.com', nombre: 'Ana' },
        lote: { numero: 'L-1', proyecto: { nombre: 'Proyecto Test' } },
        cuotas: [cuota],
      },
    ]);

    const resultado = await service.enviarRecordatoriosPendientes();

    expect(email.enviar).not.toHaveBeenCalled();
    expect(resultado.enviados).toBe(0);
  });
});
