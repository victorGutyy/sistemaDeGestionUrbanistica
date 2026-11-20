import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PERMISOS } from '../auth/permisos.js';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoCuota, EstadoVenta, FormaPago } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import { AjustarPlanService } from './ajustar-plan.service.js';

const d = (anio: number, mes: number, dia: number) => new Date(anio, mes - 1, dia);

const D = (v: number) => new Prisma.Decimal(v);

interface CuotaDeLaBase {
  id: string;
  numero: number;
  fechaVencimiento: Date;
  valor: Prisma.Decimal;
  estado: EstadoCuota;
  aplicaciones: { valor: Prisma.Decimal }[];
}

interface Montaje {
  visible?: boolean;
  venta?: { estado: EstadoVenta; formaPago: FormaPago } | null;
  cuotas?: CuotaDeLaBase[];
  plazoMaximo?: number;
}

// Plan de ejemplo: cuota inicial de $16.200.000 y tres cuotas de $12.600.000 (suman $54.000.000), todas pendientes.
const CUOTAS: CuotaDeLaBase[] = [0, 1, 2, 3].map((numero) => ({
  id: `c${numero}`,
  numero,
  fechaVencimiento: d(2026, 11 + numero, 12),
  valor: D(numero === 0 ? 16_200_000 : 12_600_000),
  estado: EstadoCuota.PENDIENTE,
  aplicaciones: [],
}));

function montar({ visible = true, venta = { estado: EstadoVenta.ACTIVA, formaPago: FormaPago.FINANCIADO }, cuotas = CUOTAS, plazoMaximo = 12 }: Montaje = {}) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    venta: { findUnique: vi.fn().mockResolvedValue(venta), update: vi.fn().mockResolvedValue({}) },
    cuota: { findMany: vi.fn().mockResolvedValue(cuotas), update: vi.fn().mockResolvedValue({}), create: vi.fn().mockResolvedValue({}) },
    registroAuditoria: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    venta: { findFirst: vi.fn().mockResolvedValue(visible ? { id: 'v-1' } : null) },
    configuracionEmpresa: { findUnique: vi.fn().mockResolvedValue({ plazoMaximoMeses: plazoMaximo }) },
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
    expect(auditoria.antes.cuotas).toHaveLength(4);
    expect(auditoria.despues.motivo).toBe(MOTIVO);
  });

  it('solo cambia fechas: nunca el valor de una cuota', async () => {
    const { servicio, tx } = montar();
    await servicio.ajustar('v-1', { motivo: MOTIVO, fechaPrimeraCuotaPendiente: '2027-02-05' }, usuarioDePrueba());
    for (const [llamada] of tx.cuota.update.mock.calls) {
      expect(Object.keys(llamada.data).sort()).toEqual(['fechaVencimiento', 'recordatorioEnviadoEn']);
    }
    expect(tx.venta.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ cuotaInicial: expect.anything() }) }));
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
    expect(tx.registroAuditoria.create.mock.calls[0][0].data.despues.cuotas).toEqual([{ numero: 3, fecha: '2027-03-15', valor: '12600000' }]);
  });

  describe('valores de las cuotas', () => {
    it('cambia el valor de las cuotas pendientes sin tocar las fechas, con el total fijo, y lo audita', async () => {
      const { servicio, tx } = montar();
      const r = await servicio.ajustar(
        'v-1',
        { motivo: MOTIVO, valoresCuotas: [{ numero: 2, valor: '20000000' }, { numero: 3, valor: '5200000' }] },
        usuarioDePrueba(),
      );
      expect(r.guardado).toBe(true);
      expect(r.cambios.map((c) => [c.numero, c.valorAntes, c.valorDespues])).toEqual([[2, '12600000', '20000000'], [3, '12600000', '5200000']]);
      for (const [llamada] of tx.cuota.update.mock.calls) {
        expect(Object.keys(llamada.data).sort()).toEqual(['estado', 'recordatorioEnviadoEn', 'valor']);
      }
      expect(tx.cuota.update.mock.calls[0][0].data.valor.toString()).toBe('20000000');
      const auditoria = tx.registroAuditoria.create.mock.calls[0][0].data;
      expect(auditoria.accion).toBe('VENTA_AJUSTAR_PLAN');
      expect(auditoria.antes.cuotas).toEqual([{ numero: 2, fecha: '2027-01-12', valor: '12600000' }, { numero: 3, fecha: '2027-02-12', valor: '12600000' }]);
      expect(auditoria.despues.cuotas.map((c: { valor: string }) => c.valor)).toEqual(['20000000', '5200000']);
      expect(auditoria.despues.totalCuotas).toBe('54000000');
    });

    it('rechaza si el total cambia y no guarda nada', async () => {
      const { servicio, tx } = montar();
      await expect(servicio.ajustar('v-1', { motivo: MOTIVO, valoresCuotas: [{ numero: 2, valor: '13000000' }] }, usuarioDePrueba())).rejects.toThrow(/sobran \$400\.000/);
      expect(tx.cuota.update).not.toHaveBeenCalled();
    });

    it('si cambia el valor de la cuota inicial, la cuota inicial de la venta se actualiza igual', async () => {
      const { servicio, tx } = montar();
      await servicio.ajustar('v-1', { motivo: MOTIVO, valoresCuotas: [{ numero: 0, valor: '14200000' }, { numero: 3, valor: '14600000' }] }, usuarioDePrueba());
      expect(tx.venta.update).toHaveBeenCalledWith({ where: { id: 'v-1' }, data: { cuotaInicial: D(14_200_000) } });
    });

    it('una cuota con pagos parciales no puede quedar por debajo de lo ya pagado', async () => {
      const cuotas = CUOTAS.map((c) => (c.numero === 2 ? { ...c, estado: EstadoCuota.PARCIAL, aplicaciones: [{ valor: D(5_000_000) }] } : c));
      const { servicio, tx } = montar({ cuotas });
      await expect(servicio.ajustar('v-1', { motivo: MOTIVO, valoresCuotas: [{ numero: 2, valor: '4000000' }, { numero: 3, valor: '21200000' }] }, usuarioDePrueba())).rejects.toThrow(/ya tiene \$5\.000\.000 pagados/);
      expect(tx.cuota.update).not.toHaveBeenCalled();
    });

    it('si el nuevo valor es justo lo ya pagado, la cuota queda pagada', async () => {
      const cuotas = CUOTAS.map((c) => (c.numero === 2 ? { ...c, estado: EstadoCuota.PARCIAL, aplicaciones: [{ valor: D(5_000_000) }] } : c));
      const { servicio, tx } = montar({ cuotas });
      await servicio.ajustar('v-1', { motivo: MOTIVO, valoresCuotas: [{ numero: 2, valor: '5000000' }, { numero: 3, valor: '20200000' }] }, usuarioDePrueba());
      const cuota2 = tx.cuota.update.mock.calls.find(([a]) => a.where.id === 'c2')![0];
      expect(cuota2.data.estado).toBe(EstadoCuota.PAGADA);
    });

    it('las fechas y los valores se pueden cambiar en el mismo ajuste, y una fecha igual no es un error cuando se piden valores', async () => {
      const { servicio, tx } = montar();
      await servicio.ajustar(
        'v-1',
        { motivo: MOTIVO, fechasCuotas: [{ numero: 3, fecha: '2027-03-15' }], valoresCuotas: [{ numero: 2, valor: '10000000' }, { numero: 3, valor: '15200000' }] },
        usuarioDePrueba(),
      );
      const cuota3 = tx.cuota.update.mock.calls.find(([a]) => a.where.id === 'c3')![0];
      expect(cuota3.data.fechaVencimiento).toEqual(d(2027, 3, 15));
      expect(cuota3.data.valor.toString()).toBe('15200000');
      // Fechas iguales a las actuales y solo valores: no es un error.
      const otro = montar();
      await otro.servicio.ajustar('v-1', { motivo: MOTIVO, fechaCuotaInicial: '2026-11-12', valoresCuotas: [{ numero: 2, valor: '10000000' }, { numero: 3, valor: '15200000' }] }, usuarioDePrueba());
      expect(otro.tx.cuota.update).toHaveBeenCalledTimes(2);
    });

    it('la vista previa muestra los cambios y el total sin guardar', async () => {
      const { servicio, tx } = montar();
      const r = await servicio.ajustar('v-1', { motivo: MOTIVO, valoresCuotas: [{ numero: 2, valor: '20000000' }, { numero: 3, valor: '5200000' }], soloVistaPrevia: true }, usuarioDePrueba());
      expect(r.guardado).toBe(false);
      expect(r.totalCuotas).toBe('54000000');
      expect(tx.cuota.update).not.toHaveBeenCalled();
    });

    it('exige indicar qué se ajusta', async () => {
      const { servicio } = montar();
      await expect(servicio.ajustar('v-1', { motivo: MOTIVO }, usuarioDePrueba())).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // RF-VEN-17: ampliar el plazo agregando cuotas al final. El plan de ejemplo (cuota inicial + 3 cuotas de $12.600.000) pasa a 5 cuotas.
  describe('ampliar el plazo (agregar cuotas)', () => {
    const IGUALES = [1, 2, 3, 4, 5].map((numero) => ({ numero, valor: '7560000' })); // 5 x 7.560.000 = 37.800.000, lo mismo que 3 x 12.600.000

    it('agrega las cuotas nuevas al final, con las fechas siguientes, y reparte el saldo con el total fijo', async () => {
      const { servicio, tx } = montar();
      const r = await servicio.ajustar('v-1', { motivo: MOTIVO, numeroCuotas: 5, valoresCuotas: IGUALES }, usuarioDePrueba());

      expect(r.guardado).toBe(true);
      expect(r.numeroCuotasAntes).toBe(3);
      expect(r.numeroCuotasDespues).toBe(5);
      expect(r.totalCuotas).toBe('54000000');
      // Las dos cuotas nuevas se crean pendientes, con su valor y los días siguientes de la serie (12/03 y 12/04 de 2027).
      expect(tx.cuota.create).toHaveBeenCalledTimes(2);
      const [primera, segunda] = tx.cuota.create.mock.calls.map(([a]) => a.data);
      expect(primera).toMatchObject({ ventaId: 'v-1', numero: 4, fechaVencimiento: d(2027, 3, 12), estado: EstadoCuota.PENDIENTE });
      expect(primera.valor.toString()).toBe('7560000');
      expect(segunda).toMatchObject({ numero: 5, fechaVencimiento: d(2027, 4, 12) });
      // Las existentes cambian de valor, sin tocar su fecha, y el "financiada en N cuotas" de la venta sigue al plan.
      expect(tx.cuota.update).toHaveBeenCalledTimes(3);
      for (const [llamada] of tx.cuota.update.mock.calls) expect(Object.keys(llamada.data).sort()).toEqual(['estado', 'recordatorioEnviadoEn', 'valor']);
      expect(tx.venta.update).toHaveBeenCalledWith({ where: { id: 'v-1' }, data: { numeroCuotas: 5 } });
    });

    it('la presentación marca las cuotas nuevas y la auditoría deja el número de cuotas de antes y de después', async () => {
      const { servicio, tx } = montar();
      const r = await servicio.ajustar('v-1', { motivo: MOTIVO, numeroCuotas: 5, valoresCuotas: IGUALES }, usuarioDePrueba());
      expect(r.cambios.map((c) => [c.numero, c.nueva, c.valorAntes, c.valorDespues])).toEqual([
        [1, false, '12600000', '7560000'],
        [2, false, '12600000', '7560000'],
        [3, false, '12600000', '7560000'],
        [4, true, '0', '7560000'],
        [5, true, '0', '7560000'],
      ]);
      const auditoria = tx.registroAuditoria.create.mock.calls[0][0].data;
      expect(auditoria.accion).toBe('VENTA_AJUSTAR_PLAN');
      expect(auditoria.resumen).toMatch(/plazo de 3 a 5 cuotas \(2 nuevas\)/);
      expect(auditoria.antes.numeroCuotas).toBe(3);
      expect(auditoria.antes.cuotas.map((c: { numero: number }) => c.numero)).toEqual([1, 2, 3]); // las nuevas no existían
      expect(auditoria.despues.numeroCuotas).toBe(5);
      expect(auditoria.despues.cuotas.filter((c: { nueva?: boolean }) => c.nueva).map((c: { numero: number }) => c.numero)).toEqual([4, 5]);
    });

    it('la vista previa muestra las cuotas nuevas sin crear nada', async () => {
      const { servicio, tx } = montar();
      const r = await servicio.ajustar('v-1', { motivo: MOTIVO, numeroCuotas: 5, valoresCuotas: IGUALES, soloVistaPrevia: true }, usuarioDePrueba());
      expect(r.guardado).toBe(false);
      expect(r.numeroCuotasDespues).toBe(5);
      expect(r.cambios.filter((c) => c.nueva)).toHaveLength(2);
      expect(tx.cuota.create).not.toHaveBeenCalled();
      expect(tx.cuota.update).not.toHaveBeenCalled();
      expect(tx.venta.update).not.toHaveBeenCalled();
    });

    it('exige indicar el valor de las cuotas: no se amplía el plazo sin decir cómo queda el saldo', async () => {
      const { servicio, tx } = montar();
      await expect(servicio.ajustar('v-1', { motivo: MOTIVO, numeroCuotas: 5 }, usuarioDePrueba())).rejects.toThrow(/indica el valor de las cuotas/);
      expect(tx.cuota.create).not.toHaveBeenCalled();
    });

    it('exige el valor de CADA cuota nueva', async () => {
      const { servicio, tx } = montar();
      const sinLaQuinta = IGUALES.slice(0, 4).map((v) => ({ ...v, valor: '9450000' })); // 4 x 9.450.000 = 37.800.000
      await expect(servicio.ajustar('v-1', { motivo: MOTIVO, numeroCuotas: 5, valoresCuotas: sinLaQuinta }, usuarioDePrueba())).rejects.toThrow(/valor de la cuota 5, que es nueva/);
      expect(tx.cuota.create).not.toHaveBeenCalled();
    });

    it('el total del plan sigue fijo: si los valores no suman lo mismo, no guarda nada y dice cuánto falta', async () => {
      const { servicio, tx } = montar();
      const de = IGUALES.map((v) => ({ ...v, valor: '7500000' })); // 37.500.000: faltan 300.000
      await expect(servicio.ajustar('v-1', { motivo: MOTIVO, numeroCuotas: 5, valoresCuotas: de }, usuarioDePrueba())).rejects.toThrow(/faltan \$300\.000 por distribuir/);
      expect(tx.cuota.create).not.toHaveBeenCalled();
      expect(tx.venta.update).not.toHaveBeenCalled();
    });

    it('no amplía a un número igual o menor al de cuotas actuales', async () => {
      const { servicio } = montar();
      await expect(servicio.ajustar('v-1', { motivo: MOTIVO, numeroCuotas: 3, valoresCuotas: [{ numero: 1, valor: '13000000' }] }, usuarioDePrueba())).rejects.toThrow(/ya tiene 3 cuotas/);
    });

    it('si cambian a la vez las fechas de las existentes, las cuotas nuevas siguen a la última ya reprogramada', async () => {
      const { servicio, tx } = montar();
      await servicio.ajustar('v-1', { motivo: MOTIVO, numeroCuotas: 5, valoresCuotas: IGUALES, fechasCuotas: [{ numero: 3, fecha: '2027-03-15' }] }, usuarioDePrueba());
      const fechas = tx.cuota.create.mock.calls.map(([a]) => a.data.fechaVencimiento);
      // La cuota 3 pasó al 15/03, así que la 4 cae el 15/04 y la 5 el 15/05 (nunca antes de la anterior).
      expect(fechas).toEqual([d(2027, 4, 15), d(2027, 5, 15)]);
    });

    it('las fechas de las cuotas nuevas se pueden elegir una por una', async () => {
      const { servicio, tx } = montar();
      await servicio.ajustar('v-1', { motivo: MOTIVO, numeroCuotas: 5, valoresCuotas: IGUALES, fechasCuotas: [{ numero: 5, fecha: '2027-06-30' }] }, usuarioDePrueba());
      const fechas = tx.cuota.create.mock.calls.map(([a]) => a.data.fechaVencimiento);
      expect(fechas).toEqual([d(2027, 3, 12), d(2027, 6, 30)]);
    });

    it('una fecha elegida para una cuota nueva no puede ser anterior a la de la cuota que la precede', async () => {
      const { servicio, tx } = montar();
      await expect(
        servicio.ajustar('v-1', { motivo: MOTIVO, numeroCuotas: 5, valoresCuotas: IGUALES, fechasCuotas: [{ numero: 4, fecha: '2027-01-01' }] }, usuarioDePrueba()),
      ).rejects.toThrow(/no puede vencer antes que la cuota 3/);
      expect(tx.cuota.create).not.toHaveBeenCalled();
    });

    it('una cuota con pagos parciales se conserva (y se completa si su nuevo valor es justo lo pagado)', async () => {
      const cuotas = CUOTAS.map((c) => (c.numero === 1 ? { ...c, estado: EstadoCuota.PARCIAL, aplicaciones: [{ valor: D(7_560_000) }] } : c));
      const { servicio, tx } = montar({ cuotas });
      await servicio.ajustar('v-1', { motivo: MOTIVO, numeroCuotas: 5, valoresCuotas: IGUALES }, usuarioDePrueba());
      const cuota1 = tx.cuota.update.mock.calls.find(([a]) => a.where.id === 'c1')![0];
      expect(cuota1.data.estado).toBe(EstadoCuota.PAGADA);
      expect(tx.cuota.create).toHaveBeenCalledTimes(2);
    });

    describe('plazo máximo configurado', () => {
      it('pasar del máximo exige la autorización del gerente y no guarda nada sin ella', async () => {
        const { servicio, tx } = montar({ plazoMaximo: 4 });
        await expect(servicio.ajustar('v-1', { motivo: MOTIVO, numeroCuotas: 5, valoresCuotas: IGUALES }, usuarioDePrueba())).rejects.toBeInstanceOf(ForbiddenException);
        expect(tx.cuota.create).not.toHaveBeenCalled();
      });

      it('con el permiso de autorizar (gerente) sí se puede pasar del máximo', async () => {
        const { servicio, tx } = montar({ plazoMaximo: 4 });
        const gerente = { ...usuarioDePrueba(), permisos: [PERMISOS.VENTAS_AUTORIZAR] };
        const r = await servicio.ajustar('v-1', { motivo: MOTIVO, numeroCuotas: 5, valoresCuotas: IGUALES }, gerente);
        expect(r.guardado).toBe(true);
        expect(tx.cuota.create).toHaveBeenCalledTimes(2);
      });

      it('dentro del máximo no hace falta autorización', async () => {
        const { servicio } = montar({ plazoMaximo: 5 });
        const r = await servicio.ajustar('v-1', { motivo: MOTIVO, numeroCuotas: 5, valoresCuotas: IGUALES }, usuarioDePrueba());
        expect(r.guardado).toBe(true);
      });
    });
  });

  it('un error de las reglas (por ejemplo, nada que cambiar) llega como solicitud inválida y no guarda nada', async () => {
    const { servicio, tx } = montar();
    await expect(servicio.ajustar('v-1', { motivo: MOTIVO, fechaCuotaInicial: '2026-11-12' }, usuarioDePrueba())).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.cuota.update).not.toHaveBeenCalled();
  });
});
