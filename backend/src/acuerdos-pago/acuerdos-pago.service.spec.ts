import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import { AcuerdosPagoService } from './acuerdos-pago.service.js';

const dia = (desplazamiento: number) => {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + desplazamiento);
};
const iso = (fecha: Date) => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;

interface Montaje {
  venta?: object | null;
  ventaVisible?: boolean;
  existentes?: object[];
  acuerdo?: object | null;
}

function montar({ venta = { estado: 'ACTIVA', formaPago: 'FINANCIADO' }, ventaVisible = true, existentes = [], acuerdo = null }: Montaje = {}) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    venta: { findUnique: vi.fn().mockResolvedValue(venta) },
    acuerdoPago: {
      findMany: vi.fn().mockResolvedValue(existentes),
      findFirst: vi.fn().mockResolvedValue(acuerdo),
      create: vi.fn().mockImplementation(({ data }: { data: object }) => Promise.resolve({ id: 'a-nuevo', hastaPrevista: null, finalizadoEn: null, motivoFin: null, ...data })),
      update: vi.fn().mockImplementation(({ data }: { data: object }) => Promise.resolve({ ...(acuerdo as object), ...data })),
    },
    registroAuditoria: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    venta: { findFirst: vi.fn().mockResolvedValue(ventaVisible ? { id: 'v-1' } : null) },
    acuerdoPago: { findMany: vi.fn().mockResolvedValue(existentes) },
    $transaction: vi.fn().mockImplementation((fn: (cliente: typeof tx) => unknown) => fn(tx)),
  };
  return { servicio: new AcuerdosPagoService(prisma as unknown as PrismaService), tx, prisma };
}

const MOTIVO = 'Acuerdo verbal: las últimas 3 cuotas se pagan al final';

describe('AcuerdosPagoService.crear', () => {
  it('registra el acuerdo desde hoy, con quién lo creó, y lo audita', async () => {
    const { servicio, tx } = montar();
    const acuerdo = await servicio.crear('v-1', { motivo: MOTIVO }, usuarioDePrueba());

    expect(tx.acuerdoPago.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ ventaId: 'v-1', motivo: MOTIVO, hastaPrevista: null }) }));
    expect(acuerdo.estado).toBe('VIGENTE');
    expect(tx.registroAuditoria.create).toHaveBeenCalledTimes(1);
    expect(tx.registroAuditoria.create.mock.calls[0][0].data).toMatchObject({ accion: 'ACUERDO_PAGO_CREAR', entidad: 'ACUERDO_PAGO' });
  });

  it('bloquea la venta mientras crea el acuerdo (dos personas a la vez no se montan)', async () => {
    const { servicio, tx } = montar();
    await servicio.crear('v-1', { motivo: MOTIVO }, usuarioDePrueba());
    expect(tx.$queryRaw).toHaveBeenCalled();
  });

  it('con fecha final, el acuerdo queda con su último día', async () => {
    const { servicio, tx } = montar();
    await servicio.crear('v-1', { motivo: MOTIVO, desde: iso(dia(0)), hasta: iso(dia(30)) }, usuarioDePrueba());
    const datos = tx.acuerdoPago.create.mock.calls[0][0].data as { hastaPrevista: Date };
    expect(datos.hastaPrevista).toEqual(dia(30));
  });

  it('un acuerdo que empieza en el futuro queda programado', async () => {
    const { servicio } = montar();
    const acuerdo = await servicio.crear('v-1', { motivo: MOTIVO, desde: iso(dia(5)) }, usuarioDePrueba());
    expect(acuerdo.estado).toBe('PROGRAMADO');
  });

  it('rechaza una fecha final anterior a la inicial', async () => {
    const { servicio } = montar();
    await expect(servicio.crear('v-1', { motivo: MOTIVO, desde: iso(dia(5)), hasta: iso(dia(2)) }, usuarioDePrueba())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza un motivo demasiado corto', async () => {
    const { servicio } = montar();
    await expect(servicio.crear('v-1', { motivo: '   corto  ' }, usuarioDePrueba())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('no permite montar un acuerdo sobre otro que sigue abierto', async () => {
    const abierto = { id: 'a-1', desde: dia(-10), hastaPrevista: null, finalizadoEn: null };
    const { servicio, tx } = montar({ existentes: [abierto] });
    await expect(servicio.crear('v-1', { motivo: MOTIVO }, usuarioDePrueba())).rejects.toBeInstanceOf(ConflictException);
    expect(tx.acuerdoPago.create).not.toHaveBeenCalled();
  });

  it('sí permite uno nuevo cuando el anterior ya terminó', async () => {
    const terminado = { id: 'a-1', desde: dia(-30), hastaPrevista: dia(-10), finalizadoEn: null };
    const { servicio, tx } = montar({ existentes: [terminado] });
    await servicio.crear('v-1', { motivo: MOTIVO }, usuarioDePrueba());
    expect(tx.acuerdoPago.create).toHaveBeenCalled();
  });

  it('solo una venta activa y financiada puede tener acuerdo', async () => {
    const desistida = montar({ venta: { estado: 'DESISTIDA', formaPago: 'FINANCIADO' } });
    await expect(desistida.servicio.crear('v-1', { motivo: MOTIVO }, usuarioDePrueba())).rejects.toBeInstanceOf(ConflictException);
    const contado = montar({ venta: { estado: 'ACTIVA', formaPago: 'CONTADO' } });
    await expect(contado.servicio.crear('v-1', { motivo: MOTIVO }, usuarioDePrueba())).rejects.toBeInstanceOf(ConflictException);
  });

  it('una venta fuera del alcance del usuario no existe para él', async () => {
    const { servicio, tx } = montar({ ventaVisible: false });
    await expect(servicio.crear('v-1', { motivo: MOTIVO }, usuarioDePrueba())).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.acuerdoPago.create).not.toHaveBeenCalled();
  });
});

describe('AcuerdosPagoService.finalizar', () => {
  const abierto = { id: 'a-1', ventaId: 'v-1', motivo: MOTIVO, desde: dia(-10), hastaPrevista: null, finalizadoEn: null, motivoFin: null };

  it('finaliza desde hoy, guarda quién lo hizo y deja el antes y el después en la auditoría', async () => {
    const { servicio, tx } = montar({ acuerdo: abierto });
    const resultado = await servicio.finalizar('v-1', 'a-1', { motivo: 'El cliente se puso al día' }, usuarioDePrueba());

    expect(tx.acuerdoPago.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ finalizadoEn: dia(0), motivoFin: 'El cliente se puso al día' }) }));
    expect(resultado.estado).toBe('FINALIZADO');
    const auditoria = tx.registroAuditoria.create.mock.calls[0][0].data as { accion: string; antes: { finalizadoEn?: unknown }; despues: { finalizadoEn?: unknown } };
    expect(auditoria.accion).toBe('ACUERDO_PAGO_FINALIZAR');
    expect(auditoria.antes.finalizadoEn ?? null).toBeNull();
    expect(auditoria.despues.finalizadoEn).toBeTruthy();
  });

  it('un acuerdo que todavía no empezó se anula en su fecha de inicio (queda sin días)', async () => {
    const futuro = { ...abierto, desde: dia(5) };
    const { servicio, tx } = montar({ acuerdo: futuro });
    await servicio.finalizar('v-1', 'a-1', {}, usuarioDePrueba());
    expect(tx.acuerdoPago.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ finalizadoEn: dia(5) }) }));
  });

  it('no se puede finalizar dos veces', async () => {
    const yaTerminado = { ...abierto, finalizadoEn: dia(-2) };
    const { servicio, tx } = montar({ acuerdo: yaTerminado });
    await expect(servicio.finalizar('v-1', 'a-1', {}, usuarioDePrueba())).rejects.toBeInstanceOf(ConflictException);
    expect(tx.acuerdoPago.update).not.toHaveBeenCalled();
  });

  it('un acuerdo que no es de esa venta no existe', async () => {
    const { servicio } = montar({ acuerdo: null });
    await expect(servicio.finalizar('v-1', 'otro', {}, usuarioDePrueba())).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AcuerdosPagoService.listar', () => {
  it('devuelve el historial con el estado de cada acuerdo', async () => {
    const existentes = [
      { id: 'a-2', desde: dia(-3), hastaPrevista: null, finalizadoEn: null, creadoPor: { nombre: 'Gerente' }, finalizadoPor: null },
      { id: 'a-1', desde: dia(-60), hastaPrevista: dia(-30), finalizadoEn: null, creadoPor: { nombre: 'Gerente' }, finalizadoPor: null },
    ];
    const { servicio } = montar({ existentes });
    const lista = await servicio.listar('v-1', usuarioDePrueba());
    expect(lista.map((a) => [a.id, a.estado])).toEqual([
      ['a-2', 'VIGENTE'],
      ['a-1', 'FINALIZADO'],
    ]);
  });
});
