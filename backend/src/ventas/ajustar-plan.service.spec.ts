import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { EstadoCuota, EstadoVenta, FormaPago } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import { AjustarPlanService } from './ajustar-plan.service.js';

const d = (anio: number, mes: number, dia: number) => new Date(anio, mes - 1, dia);

interface Montaje {
  visible?: boolean;
  venta?: { estado: EstadoVenta; formaPago: FormaPago } | null;
  cuotas?: { id: string; numero: number; fechaVencimiento: Date; estado: EstadoCuota }[];
}

const CUOTAS = [0, 1, 2, 3].map((numero) => ({ id: `c${numero}`, numero, fechaVencimiento: d(2026, 11 + numero, 12), estado: EstadoCuota.PENDIENTE }));

function montar({ visible = true, venta = { estado: EstadoVenta.ACTIVA, formaPago: FormaPago.FINANCIADO }, cuotas = CUOTAS }: Montaje = {}) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    venta: { findUnique: vi.fn().mockResolvedValue(venta), update: vi.fn().mockResolvedValue({}) },
    cuota: { findMany: vi.fn().mockResolvedValue(cuotas), update: vi.fn().mockResolvedValue({}) },
    registroAuditoria: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    venta: { findFirst: vi.fn().mockResolvedValue(visible ? { id: 'v-1' } : null) },
    $transaction: vi.fn().mockImplementation((fn: (cliente: typeof tx) => unknown) => fn(tx)),
  };
  return { servicio: new AjustarPlanService(prisma as unknown as PrismaService), tx, prisma };
}

const MOTIVO = 'El contrato fija las cuotas desde febrero, los 5 de cada mes';

describe('AjustarPlanService', () => {
  it('reprograma las cuotas pendientes, libera sus recordatorios, actualiza la fecha de la cuota inicial y lo audita', async () => {
    const { servicio, tx } = montar();
    const r = await servicio.ajustar('v-1', { motivo: MOTIVO, fechaCuotaInicial: '2026-12-28', fechaPrimeraCuotaPendiente: '2027-02-05' }, usuarioDePrueba());

    expect(r.guardado).toBe(true);
    expect(r.cambios.map((c) => c.numero)).toEqual([0, 1, 2, 3]);
    expect(tx.cuota.update).toHaveBeenCalledTimes(4);
    // Cada cuota que cambia de fecha libera su recordatorio para que el cliente reciba el de su nueva fecha.
    expect(tx.cuota.update.mock.calls[0][0].data).toMatchObject({ recordatorioEnviadoEn: null });
    expect(tx.venta.update).toHaveBeenCalledWith({ where: { id: 'v-1' }, data: { fechaCuotaInicial: d(2026, 12, 28) } });
    const auditoria = tx.registroAuditoria.create.mock.calls[0][0].data;
    expect(auditoria).toMatchObject({ accion: 'VENTA_AJUSTAR_PLAN', entidad: 'VENTA' });
    expect(auditoria.antes.fechas).toHaveLength(4);
    expect(auditoria.despues.motivo).toBe(MOTIVO);
  });

  it('solo cambia fechas: nunca el valor de una cuota', async () => {
    const { servicio, tx } = montar();
    await servicio.ajustar('v-1', { motivo: MOTIVO, fechaPrimeraCuotaPendiente: '2027-02-05' }, usuarioDePrueba());
    for (const [llamada] of tx.cuota.update.mock.calls) {
      expect(Object.keys(llamada.data).sort()).toEqual(['fechaVencimiento', 'recordatorioEnviadoEn']);
    }
  });

  it('la vista previa muestra los cambios sin guardar nada', async () => {
    const { servicio, tx } = montar();
    const r = await servicio.ajustar('v-1', { motivo: MOTIVO, fechaPrimeraCuotaPendiente: '2027-02-05', soloVistaPrevia: true }, usuarioDePrueba());
    expect(r.guardado).toBe(false);
    expect(r.cambios).toHaveLength(3);
    expect(tx.cuota.update).not.toHaveBeenCalled();
    expect(tx.registroAuditoria.create).not.toHaveBeenCalled();
  });

  it('bloquea la venta mientras ajusta (un abono simultáneo espera su turno)', async () => {
    const { servicio, tx } = montar();
    await servicio.ajustar('v-1', { motivo: MOTIVO, fechaPrimeraCuotaPendiente: '2027-02-05' }, usuarioDePrueba());
    expect(tx.$queryRaw).toHaveBeenCalled();
  });

  it('rechaza un motivo corto', async () => {
    const { servicio } = montar();
    await expect(servicio.ajustar('v-1', { motivo: '  corto ', fechaPrimeraCuotaPendiente: '2027-02-05' }, usuarioDePrueba())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('solo una venta activa y financiada', async () => {
    await expect(montar({ venta: { estado: EstadoVenta.DESISTIDA, formaPago: FormaPago.FINANCIADO } }).servicio.ajustar('v-1', { motivo: MOTIVO, fechaPrimeraCuotaPendiente: '2027-02-05' }, usuarioDePrueba())).rejects.toBeInstanceOf(ConflictException);
    await expect(montar({ venta: { estado: EstadoVenta.ACTIVA, formaPago: FormaPago.CONTADO } }).servicio.ajustar('v-1', { motivo: MOTIVO, fechaPrimeraCuotaPendiente: '2027-02-05' }, usuarioDePrueba())).rejects.toBeInstanceOf(ConflictException);
  });

  it('una venta fuera del alcance del usuario no existe para él', async () => {
    const { servicio, tx } = montar({ visible: false });
    await expect(servicio.ajustar('v-1', { motivo: MOTIVO, fechaPrimeraCuotaPendiente: '2027-02-05' }, usuarioDePrueba())).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.cuota.update).not.toHaveBeenCalled();
  });

  it('con las fechas de cada cuota mueve solo esa cuota a su fecha y la audita', async () => {
    const { servicio, tx } = montar();
    // La cuota 2 pasa al 15/12/2027, aunque no sea el mes siguiente a la 1; las demás quedan como están.
    const r = await servicio.ajustar('v-1', { motivo: MOTIVO, fechasCuotas: [{ numero: 3, fecha: '2027-03-15' }] }, usuarioDePrueba());
    expect(r.cambios.map((c) => c.numero)).toEqual([3]);
    expect(tx.cuota.update).toHaveBeenCalledTimes(1);
    expect(tx.cuota.update.mock.calls[0][0]).toMatchObject({ where: { id: 'c3' } });
    expect(tx.cuota.update.mock.calls[0][0].data.fechaVencimiento).toEqual(d(2027, 3, 15));
    expect(tx.registroAuditoria.create.mock.calls[0][0].data.despues.fechas).toEqual([{ numero: 3, fecha: '2027-03-15' }]);
  });

  it('un error de las reglas (por ejemplo, nada que cambiar) llega como solicitud inválida y no guarda nada', async () => {
    const { servicio, tx } = montar();
    await expect(servicio.ajustar('v-1', { motivo: MOTIVO, fechaCuotaInicial: '2026-11-12' }, usuarioDePrueba())).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.cuota.update).not.toHaveBeenCalled();
  });
});
