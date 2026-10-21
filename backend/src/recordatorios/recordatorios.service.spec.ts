import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoCuota, EstadoNotificacion } from '../generated/prisma/enums.js';
import type { NotificacionesService } from '../notificaciones/notificaciones.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { RecordatoriosService } from './recordatorios.service.js';

function crearPrismaFalso() {
  return {
    venta: { findMany: vi.fn() },
    cuota: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    notificacion: { groupBy: vi.fn().mockResolvedValue([]) },
  };
}

const HOY = new Date();

const EMPRESA = {
  nombreComercial: 'Empresa de Prueba',
  colorPrimario: '#2563eb',
  telefonos: null,
  correo: null,
  diasAntesRecordatorio: 3,
  diasEntreAvisosMora: 7,
  diasGraciaMora: 0,
  tasaMoraMensual: null,
};

function enDias(dias: number): Date {
  const fecha = new Date(HOY);
  fecha.setDate(fecha.getDate() + dias);
  return fecha;
}

function cuotaQueVenceEn(dias: number, extra: Partial<{ id: string; numero: number; valor: string; aplicado: string[]; estado: EstadoCuota }> = {}) {
  return {
    id: extra.id ?? `cuota-${dias}`,
    numero: extra.numero ?? 1,
    fechaVencimiento: enDias(dias),
    valor: new Prisma.Decimal(extra.valor ?? '1000000'),
    estado: extra.estado ?? EstadoCuota.PENDIENTE,
    recordatorioEnviadoEn: null,
    aplicaciones: (extra.aplicado ?? []).map((valor) => ({ valor: new Prisma.Decimal(valor) })),
  };
}

function venta(cuotas: ReturnType<typeof cuotaQueVenceEn>[], email: string | null = 'cliente@test.com', id = 'venta-1') {
  return {
    id,
    clienteId: `cliente-${id}`,
    cliente: { email, nombre: 'Ana' },
    lote: { numero: 'L-1', proyecto: { nombre: 'Proyecto Test' } },
    cuotas,
  };
}

describe('RecordatoriosService', () => {
  let prisma: ReturnType<typeof crearPrismaFalso>;
  let notificaciones: { motivoDeOmision: ReturnType<typeof vi.fn>; enviarCorreo: ReturnType<typeof vi.fn> };
  let configuracion: { obtenerEmpresa: ReturnType<typeof vi.fn> };
  let service: RecordatoriosService;

  beforeEach(() => {
    prisma = crearPrismaFalso();
    notificaciones = {
      motivoDeOmision: vi.fn().mockReturnValue(null),
      enviarCorreo: vi.fn().mockResolvedValue({ estado: EstadoNotificacion.ENVIADA, detalle: null }),
    };
    configuracion = { obtenerEmpresa: vi.fn().mockResolvedValue(EMPRESA) };
    service = new RecordatoriosService(
      prisma as unknown as PrismaService,
      notificaciones as unknown as NotificacionesService,
      configuracion as unknown as ConfiguracionService,
    );
  });

  describe('enviarRecordatoriosPendientes', () => {
    it('reclama la cuota y envía el recordatorio cuando está en la ventana de aviso', async () => {
      const cuota = cuotaQueVenceEn(3);
      prisma.venta.findMany.mockResolvedValue([venta([cuota])]);

      const resultado = await service.enviarRecordatoriosPendientes();

      expect(prisma.cuota.updateMany).toHaveBeenCalledWith({
        where: { id: cuota.id, recordatorioEnviadoEn: null },
        data: { recordatorioEnviadoEn: expect.any(Date) },
      });
      expect(notificaciones.enviarCorreo).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'RECORDATORIO', destinatario: 'cliente@test.com', cuotaId: cuota.id, ventaId: 'venta-1' }),
      );
      expect(resultado).toEqual({ enviados: 1, fallidos: 0, omitidos: 0 });
    });

    it('sin correo no reclama la cuota: solo anota la omisión (una vez) y la cuenta como omitida', async () => {
      notificaciones.motivoDeOmision.mockReturnValue('El cliente no tiene correo registrado');
      notificaciones.enviarCorreo.mockResolvedValue({ estado: EstadoNotificacion.OMITIDA, detalle: 'El cliente no tiene correo registrado' });
      prisma.venta.findMany.mockResolvedValue([venta([cuotaQueVenceEn(2)], null)]);

      const resultado = await service.enviarRecordatoriosPendientes();

      expect(prisma.cuota.updateMany).not.toHaveBeenCalled();
      expect(notificaciones.enviarCorreo).toHaveBeenCalledWith(expect.objectContaining({ noRepetirOmisionDesde: new Date(0) }));
      expect(resultado).toEqual({ enviados: 0, fallidos: 0, omitidos: 1 });
    });

    it('no envía si otro proceso ya reclamó la cuota (no hay dos recordatorios para la misma cuota)', async () => {
      prisma.cuota.updateMany.mockResolvedValue({ count: 0 });
      prisma.venta.findMany.mockResolvedValue([venta([cuotaQueVenceEn(1)])]);

      const resultado = await service.enviarRecordatoriosPendientes();

      expect(notificaciones.enviarCorreo).not.toHaveBeenCalled();
      expect(resultado).toEqual({ enviados: 0, fallidos: 0, omitidos: 0 });
    });

    it('si un envío falla libera su cuota para reintentar y sigue con los demás clientes', async () => {
      const fallida = cuotaQueVenceEn(2, { id: 'cuota-falla' });
      const buena = cuotaQueVenceEn(2, { id: 'cuota-buena' });
      notificaciones.enviarCorreo
        .mockResolvedValueOnce({ estado: EstadoNotificacion.FALLIDA, detalle: 'Connection timeout' })
        .mockResolvedValueOnce({ estado: EstadoNotificacion.ENVIADA, detalle: null });
      prisma.venta.findMany.mockResolvedValue([venta([fallida], 'a@test.com', 'v-1'), venta([buena], 'b@test.com', 'v-2')]);

      const resultado = await service.enviarRecordatoriosPendientes();

      expect(prisma.cuota.updateMany).toHaveBeenCalledWith({ where: { id: 'cuota-falla' }, data: { recordatorioEnviadoEn: null } });
      expect(prisma.cuota.updateMany).not.toHaveBeenCalledWith({ where: { id: 'cuota-buena' }, data: { recordatorioEnviadoEn: null } });
      expect(resultado).toEqual({ enviados: 1, fallidos: 1, omitidos: 0 });
    });

    it('no envía nada si ninguna cuota está en la ventana de aviso', async () => {
      prisma.venta.findMany.mockResolvedValue([venta([cuotaQueVenceEn(20)])]);

      const resultado = await service.enviarRecordatoriosPendientes();

      expect(notificaciones.enviarCorreo).not.toHaveBeenCalled();
      expect(resultado.enviados).toBe(0);
    });

    it('usa los días de aviso que el gerente configuró (7 días: avisa una cuota que vence en 6)', async () => {
      configuracion.obtenerEmpresa.mockResolvedValue({ ...EMPRESA, diasAntesRecordatorio: 7 });
      prisma.venta.findMany.mockResolvedValue([venta([cuotaQueVenceEn(6)])]);

      expect((await service.enviarRecordatoriosPendientes()).enviados).toBe(1);
    });

    it('con 3 días configurados no avisa una cuota que vence en 6', async () => {
      prisma.venta.findMany.mockResolvedValue([venta([cuotaQueVenceEn(6)])]);

      expect((await service.enviarRecordatoriosPendientes()).enviados).toBe(0);
    });

    it('avisa solo lo que falta por pagar de una cuota con abono parcial', async () => {
      prisma.venta.findMany.mockResolvedValue([venta([cuotaQueVenceEn(2, { valor: '1000000', aplicado: ['400000'], estado: EstadoCuota.PARCIAL })])]);

      await service.enviarRecordatoriosPendientes();

      const { html } = notificaciones.enviarCorreo.mock.calls[0][0] as { html: string };
      expect(html).toContain('600.000');
      expect(html).not.toContain('1.000.000');
    });

    it('pone el nombre de la empresa configurada en el correo', async () => {
      prisma.venta.findMany.mockResolvedValue([venta([cuotaQueVenceEn(2)])]);

      await service.enviarRecordatoriosPendientes();

      const { html } = notificaciones.enviarCorreo.mock.calls[0][0] as { html: string };
      expect(html).toContain('Empresa de Prueba');
    });
  });

  describe('enviarAvisosMora', () => {
    it('avisa a una venta con cuotas vencidas que nunca ha recibido aviso, con el total vencido', async () => {
      prisma.venta.findMany.mockResolvedValue([
        venta([cuotaQueVenceEn(-5, { id: 'c1', numero: 1, valor: '1000000' }), cuotaQueVenceEn(-2, { id: 'c2', numero: 2, valor: '500000' }), cuotaQueVenceEn(10, { id: 'c3', numero: 3 })]),
      ]);

      const resultado = await service.enviarAvisosMora();

      expect(notificaciones.enviarCorreo).toHaveBeenCalledTimes(1);
      const aviso = notificaciones.enviarCorreo.mock.calls[0][0] as { tipo: string; html: string; destinatario: string };
      expect(aviso.tipo).toBe('MORA');
      expect(aviso.destinatario).toBe('cliente@test.com');
      expect(aviso.html).toContain('$1.500.000');
      expect(aviso.html).toContain('Cuota 1');
      expect(aviso.html).toContain('Cuota 2');
      expect(aviso.html).not.toContain('Cuota 3');
      expect(resultado).toEqual({ enviados: 1, fallidos: 0, omitidos: 0 });
    });

    it('no repite el aviso antes de los días configurados y sí cuando se cumplen', async () => {
      prisma.venta.findMany.mockResolvedValue([venta([cuotaQueVenceEn(-5)])]);

      prisma.notificacion.groupBy.mockResolvedValue([{ ventaId: 'venta-1', _max: { createdAt: enDias(-3) } }]);
      expect((await service.enviarAvisosMora()).enviados).toBe(0);
      expect(notificaciones.enviarCorreo).not.toHaveBeenCalled();

      prisma.notificacion.groupBy.mockResolvedValue([{ ventaId: 'venta-1', _max: { createdAt: enDias(-7) } }]);
      expect((await service.enviarAvisosMora()).enviados).toBe(1);
    });

    it('respeta los días de gracia: una cuota vencida hace 5 días con 10 de gracia no se avisa', async () => {
      configuracion.obtenerEmpresa.mockResolvedValue({ ...EMPRESA, diasGraciaMora: 10 });
      prisma.venta.findMany.mockResolvedValue([venta([cuotaQueVenceEn(-5)])]);

      await service.enviarAvisosMora();

      expect(notificaciones.enviarCorreo).not.toHaveBeenCalled();
    });

    it('no avisa si las cuotas todavía no vencen', async () => {
      prisma.venta.findMany.mockResolvedValue([venta([cuotaQueVenceEn(1)])]);

      await service.enviarAvisosMora();

      expect(notificaciones.enviarCorreo).not.toHaveBeenCalled();
    });

    it('cuenta fallidos y omitidos aparte, y anota una venta sin correo solo una vez por intervalo', async () => {
      notificaciones.enviarCorreo
        .mockResolvedValueOnce({ estado: EstadoNotificacion.FALLIDA, detalle: 'timeout' })
        .mockResolvedValueOnce({ estado: EstadoNotificacion.OMITIDA, detalle: 'El cliente no tiene correo registrado' });
      prisma.venta.findMany.mockResolvedValue([venta([cuotaQueVenceEn(-5)], 'a@test.com', 'v-1'), venta([cuotaQueVenceEn(-5)], null, 'v-2')]);

      const resultado = await service.enviarAvisosMora();

      expect(resultado).toEqual({ enviados: 0, fallidos: 1, omitidos: 1 });
      const { noRepetirOmisionDesde } = notificaciones.enviarCorreo.mock.calls[1][0] as { noRepetirOmisionDesde: Date };
      const diasAtras = Math.round((Date.now() - noRepetirOmisionDesde.getTime()) / 86_400_000);
      expect(diasAtras).toBe(7);
    });

    it('usa los días entre avisos que el gerente configuró', async () => {
      configuracion.obtenerEmpresa.mockResolvedValue({ ...EMPRESA, diasEntreAvisosMora: 3 });
      prisma.venta.findMany.mockResolvedValue([venta([cuotaQueVenceEn(-5)])]);
      prisma.notificacion.groupBy.mockResolvedValue([{ ventaId: 'venta-1', _max: { createdAt: enDias(-3) } }]);

      expect((await service.enviarAvisosMora()).enviados).toBe(1);
    });
  });

  it('ejecutarTodo corre los dos procesos y devuelve cada resultado', async () => {
    prisma.venta.findMany.mockResolvedValueOnce([venta([cuotaQueVenceEn(2)])]).mockResolvedValueOnce([venta([cuotaQueVenceEn(-5)])]);

    const resultado = await service.ejecutarTodo();

    expect(resultado).toEqual({ recordatorios: { enviados: 1, fallidos: 0, omitidos: 0 }, mora: { enviados: 1, fallidos: 0, omitidos: 0 } });
  });
});
