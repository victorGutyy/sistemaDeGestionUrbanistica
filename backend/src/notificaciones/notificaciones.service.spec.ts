import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfiguracionService } from '../configuracion/configuracion.service.js';
import type { EmailService } from '../email/email.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import { NotificacionesService } from './notificaciones.service.js';

vi.mock('../abonos/pdf-recibo-abono.js', () => ({
  generarPdfDeReciboDeAbono: vi.fn().mockResolvedValue({
    buffer: Buffer.from('%PDF-falso'),
    nombreArchivo: 'recibo-RC-000012.pdf',
    contenido: {
      numeroTexto: 'RC-000012',
      proyecto: 'Proyecto Uno',
      lote: 'L-3',
      fechaAbono: '2026-10-21T15:00:00.000Z',
      valor: '500000',
      saldoNuevo: '2500000',
      empresa: { nombreComercial: 'Empresa Prueba', colorPrimario: '#2563eb', telefonos: null, correo: null },
    },
  }),
}));

const EMPRESA = {
  nombreComercial: 'Empresa Prueba',
  enviarReciboPorCorreo: true,
  tasaMoraMensual: null,
  diasGraciaMora: 0,
};

function dec(valor: string) {
  return new Prisma.Decimal(valor);
}

function enDias(dias: number): Date {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return fecha;
}

function crearPrismaFalso() {
  return {
    notificacion: {
      create: vi.fn().mockResolvedValue({ id: 'n-1' }),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    abono: { findFirst: vi.fn() },
    venta: { findFirst: vi.fn() },
  };
}

const CLIENTE = { id: 'cliente-1', nombre: 'Ana Pérez', email: 'ana@test.com', telefono: '300 123 4567' };

function abonoConRecibo(extra: Record<string, unknown> = {}) {
  return { id: 'abono-1', ventaId: 'venta-1', estado: 'ACTIVO', recibo: { numeroTexto: 'RC-000012' }, venta: { cliente: CLIENTE }, ...extra };
}

function ventaConCuotas(cuotas: unknown[], extra: Record<string, unknown> = {}) {
  return {
    id: 'venta-1',
    clienteId: 'cliente-1',
    estado: 'ACTIVA',
    cliente: CLIENTE,
    lote: { numero: 'L-3', proyecto: { nombre: 'Proyecto Uno' } },
    cuotas,
    ...extra,
  };
}

function cuota(numero: number, dias: number, valor = '1000000', aplicado: string[] = []) {
  return { id: `cuota-${numero}`, numero, estado: 'PENDIENTE', fechaVencimiento: enDias(dias), valor: dec(valor), aplicaciones: aplicado.map((v) => ({ valor: dec(v) })) };
}

describe('NotificacionesService', () => {
  let prisma: ReturnType<typeof crearPrismaFalso>;
  let email: { enviar: ReturnType<typeof vi.fn>; estaConfigurado: ReturnType<typeof vi.fn> };
  let configuracion: { obtenerEmpresa: ReturnType<typeof vi.fn> };
  let service: NotificacionesService;

  beforeEach(() => {
    prisma = crearPrismaFalso();
    email = { enviar: vi.fn().mockResolvedValue(undefined), estaConfigurado: vi.fn().mockReturnValue(true) };
    configuracion = { obtenerEmpresa: vi.fn().mockResolvedValue(EMPRESA) };
    service = new NotificacionesService(
      prisma as unknown as PrismaService,
      email as unknown as EmailService,
      configuracion as unknown as ConfiguracionService,
      {} as StorageService,
    );
  });

  describe('enviarCorreo', () => {
    const aviso = {
      tipo: 'MORA' as const,
      clienteId: 'cliente-1',
      ventaId: 'venta-1',
      destinatario: 'ana@test.com',
      asunto: 'Aviso',
      html: '<p>Hola</p>',
    };

    it('envía el correo y registra la notificación como enviada, con quién la disparó', async () => {
      const resultado = await service.enviarCorreo({ ...aviso, usuarioId: 'u-1' });

      expect(email.enviar).toHaveBeenCalledWith({ to: 'ana@test.com', subject: 'Aviso', html: '<p>Hola</p>', adjuntos: undefined });
      expect(prisma.notificacion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ tipo: 'MORA', canal: 'CORREO', estado: 'ENVIADA', destinatario: 'ana@test.com', ventaId: 'venta-1', usuarioId: 'u-1', detalle: null }),
      });
      expect(resultado).toEqual({ estado: 'ENVIADA', detalle: null });
    });

    it('sin correo registrado no intenta enviar y anota la omisión', async () => {
      const resultado = await service.enviarCorreo({ ...aviso, destinatario: '  ' });

      expect(email.enviar).not.toHaveBeenCalled();
      expect(prisma.notificacion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ estado: 'OMITIDA', detalle: 'El cliente no tiene correo registrado', destinatario: null }) });
      expect(resultado.estado).toBe('OMITIDA');
    });

    it('con el correo de la empresa sin configurar no intenta enviar y anota la omisión', async () => {
      email.estaConfigurado.mockReturnValue(false);

      const resultado = await service.enviarCorreo(aviso);

      expect(email.enviar).not.toHaveBeenCalled();
      expect(resultado).toEqual({ estado: 'OMITIDA', detalle: 'El correo de la empresa no está configurado' });
    });

    it('si el envío falla anota la falla con su mensaje (recortado) y no lanza', async () => {
      email.enviar.mockRejectedValue(new Error('x'.repeat(500)));

      const resultado = await service.enviarCorreo(aviso);

      expect(resultado.estado).toBe('FALLIDA');
      expect(resultado.detalle).toHaveLength(300);
      expect(prisma.notificacion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ estado: 'FALLIDA' }) });
    });

    it('si el correo salió pero no se pudo anotar, igual lo da por enviado y no lanza', async () => {
      prisma.notificacion.create.mockRejectedValue(new Error('base caída'));

      await expect(service.enviarCorreo(aviso)).resolves.toEqual({ estado: 'ENVIADA', detalle: null });
    });

    it('no repite una omisión que ya está anotada dentro de la ventana pedida', async () => {
      prisma.notificacion.findFirst.mockResolvedValue({ id: 'ya-estaba' });

      const resultado = await service.enviarCorreo({ ...aviso, destinatario: null, noRepetirOmisionDesde: enDias(-7) });

      expect(prisma.notificacion.create).not.toHaveBeenCalled();
      expect(resultado.estado).toBe('OMITIDA');
    });

    it('anota la omisión si no había una igual dentro de la ventana', async () => {
      await service.enviarCorreo({ ...aviso, destinatario: null, noRepetirOmisionDesde: enDias(-7) });

      expect(prisma.notificacion.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('recibo por correo', () => {
    it('al registrar un abono envía el PDF adjunto con el recibo', async () => {
      prisma.abono.findFirst.mockResolvedValue(abonoConRecibo());

      await service.enviarReciboAlRegistrar('abono-1', 'u-1');

      const enviado = email.enviar.mock.calls[0][0] as { to: string; subject: string; adjuntos: { nombre: string; contenido: Buffer }[] };
      expect(enviado.to).toBe('ana@test.com');
      expect(enviado.subject).toContain('RC-000012');
      expect(enviado.adjuntos[0].nombre).toBe('recibo-RC-000012.pdf');
      expect(enviado.adjuntos[0].contenido.toString()).toBe('%PDF-falso');
      expect(prisma.notificacion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tipo: 'RECIBO', abonoId: 'abono-1', estado: 'ENVIADA', usuarioId: 'u-1' }) });
    });

    it('no envía nada si el gerente apagó el envío automático', async () => {
      configuracion.obtenerEmpresa.mockResolvedValue({ ...EMPRESA, enviarReciboPorCorreo: false });

      await service.enviarReciboAlRegistrar('abono-1', 'u-1');

      expect(email.enviar).not.toHaveBeenCalled();
      expect(prisma.abono.findFirst).not.toHaveBeenCalled();
    });

    it('nunca lanza: un error inesperado no debe romper el registro del abono', async () => {
      prisma.abono.findFirst.mockRejectedValue(new Error('base caída'));

      await expect(service.enviarReciboAlRegistrar('abono-1', 'u-1')).resolves.toBeUndefined();
    });

    it('el reenvío manual respeta el alcance del usuario y rechaza un abono ajeno', async () => {
      prisma.abono.findFirst.mockResolvedValue(null);
      const usuario = usuarioDePrueba(['proyecto-1']);

      await expect(service.reenviarRecibo('abono-x', usuario)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.abono.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'abono-x', venta: { lote: { proyectoId: { in: ['proyecto-1'] } } } } }));
    });

    it('no se reenvía un recibo anulado', async () => {
      prisma.abono.findFirst.mockResolvedValue(abonoConRecibo({ estado: 'ANULADO' }));

      await expect(service.reenviarRecibo('abono-1', usuarioDePrueba())).rejects.toBeInstanceOf(ConflictException);
      expect(email.enviar).not.toHaveBeenCalled();
    });

    it('el reenvío manual devuelve el resultado (por ejemplo, omitido por falta de correo)', async () => {
      prisma.abono.findFirst.mockResolvedValue(abonoConRecibo({ venta: { cliente: { ...CLIENTE, email: null } } }));

      const resultado = await service.reenviarRecibo('abono-1', usuarioDePrueba());

      expect(resultado).toEqual({ estado: 'OMITIDA', detalle: 'El cliente no tiene correo registrado' });
    });
  });

  describe('prepararWhatsApp', () => {
    const usuario = usuarioDePrueba();

    it('rechaza una venta fuera del alcance', async () => {
      prisma.venta.findFirst.mockResolvedValue(null);

      await expect(service.prepararWhatsApp({ tipo: 'MORA', ventaId: 'venta-x' }, usuarioDePrueba(['proyecto-1']))).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rechaza un cliente sin celular válido', async () => {
      prisma.venta.findFirst.mockResolvedValue(ventaConCuotas([], { cliente: { ...CLIENTE, telefono: '6067451234' } }));

      await expect(service.prepararWhatsApp({ tipo: 'MORA', ventaId: 'venta-1' }, usuario)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.notificacion.create).not.toHaveBeenCalled();
    });

    it('recordatorio: usa la próxima cuota y lo que falta por pagar, y deja constancia del enlace abierto', async () => {
      prisma.venta.findFirst.mockResolvedValue(ventaConCuotas([cuota(2, 3, '1000000', ['300000']), cuota(3, 33)]));

      const resultado = await service.prepararWhatsApp({ tipo: 'RECORDATORIO', ventaId: 'venta-1' }, usuario);

      expect(resultado.telefono).toBe('573001234567');
      expect(resultado.url.startsWith('https://wa.me/573001234567?text=')).toBe(true);
      expect(resultado.mensaje).toContain('cuota 2');
      expect(resultado.mensaje).toContain('$700.000');
      expect(prisma.notificacion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ tipo: 'RECORDATORIO', canal: 'WHATSAPP', estado: 'ENLACE_ABIERTO', cuotaId: 'cuota-2', destinatario: '573001234567', usuarioId: 'usuario-prueba' }),
      });
    });

    it('recordatorio con una cuota elegida que no es de la venta', async () => {
      prisma.venta.findFirst.mockResolvedValue(ventaConCuotas([cuota(2, 3)]));

      await expect(service.prepararWhatsApp({ tipo: 'RECORDATORIO', ventaId: 'venta-1', cuotaId: 'cuota-9' }, usuario)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('mora: lista solo las cuotas vencidas con su total', async () => {
      prisma.venta.findFirst.mockResolvedValue(ventaConCuotas([cuota(1, -10, '1000000'), cuota(2, -2, '500000', ['100000']), cuota(3, 20)]));

      const resultado = await service.prepararWhatsApp({ tipo: 'MORA', ventaId: 'venta-1' }, usuario);

      expect(resultado.mensaje).toContain('Cuota 1');
      expect(resultado.mensaje).toContain('Cuota 2');
      expect(resultado.mensaje).not.toContain('Cuota 3');
      expect(resultado.mensaje).toContain('$1.400.000');
      expect(prisma.notificacion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tipo: 'MORA', cuotaId: null, abonoId: null }) });
    });

    it('mora: una venta sin cuotas vencidas no genera mensaje ni registro', async () => {
      prisma.venta.findFirst.mockResolvedValue(ventaConCuotas([cuota(1, 5)]));

      await expect(service.prepararWhatsApp({ tipo: 'MORA', ventaId: 'venta-1' }, usuario)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.notificacion.create).not.toHaveBeenCalled();
    });

    it('cuotas de una venta que no está activa no se avisan', async () => {
      prisma.venta.findFirst.mockResolvedValue(ventaConCuotas([cuota(1, -5)], { estado: 'DESISTIDA' }));

      await expect(service.prepararWhatsApp({ tipo: 'MORA', ventaId: 'venta-1' }, usuario)).rejects.toBeInstanceOf(ConflictException);
    });

    it('recibo: arma el mensaje con el número, el valor y el saldo del recibo y deja el abono en el registro', async () => {
      prisma.venta.findFirst.mockResolvedValue(ventaConCuotas([]));
      prisma.abono.findFirst.mockResolvedValue({
        id: 'abono-1',
        estado: 'ACTIVO',
        recibo: { contenido: { numeroTexto: 'RC-000012', fechaAbono: '2026-10-21T15:00:00.000Z', valor: '500000', saldoNuevo: '2500000' } },
      });

      const resultado = await service.prepararWhatsApp({ tipo: 'RECIBO', ventaId: 'venta-1', abonoId: 'abono-1' }, usuario);

      expect(resultado.mensaje).toContain('RC-000012');
      expect(resultado.mensaje).toContain('$500.000');
      expect(resultado.mensaje).toContain('$2.500.000');
      expect(resultado.mensaje).toContain('21/10/2026');
      expect(prisma.notificacion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tipo: 'RECIBO', abonoId: 'abono-1', cuotaId: null }) });
    });

    it('recibo: pide el abono, y no avisa de uno anulado', async () => {
      prisma.venta.findFirst.mockResolvedValue(ventaConCuotas([]));
      await expect(service.prepararWhatsApp({ tipo: 'RECIBO', ventaId: 'venta-1' }, usuario)).rejects.toBeInstanceOf(BadRequestException);

      prisma.abono.findFirst.mockResolvedValue({ id: 'abono-1', estado: 'ANULADO', recibo: { contenido: {} } });
      await expect(service.prepararWhatsApp({ tipo: 'RECIBO', ventaId: 'venta-1', abonoId: 'abono-1' }, usuario)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('listar', () => {
    it('siempre limita por el alcance del usuario y devuelve las filas ya aplanadas', async () => {
      prisma.notificacion.count.mockResolvedValue(1);
      prisma.notificacion.groupBy.mockResolvedValue([{ estado: 'ENVIADA', _count: { _all: 4 } }, { estado: 'FALLIDA', _count: { _all: 1 } }]);
      prisma.notificacion.findMany.mockResolvedValue([
        {
          id: 'n-1',
          createdAt: new Date('2026-10-21T15:00:00Z'),
          tipo: 'RECIBO',
          canal: 'CORREO',
          estado: 'ENVIADA',
          destinatario: 'ana@test.com',
          asunto: 'Recibo',
          detalle: null,
          cliente: { id: 'cliente-1', nombre: 'Ana Pérez' },
          venta: { id: 'venta-1', lote: { numero: 'L-3', proyecto: { nombre: 'Proyecto Uno' } } },
          cuota: null,
          abono: { recibo: { numeroTexto: 'RC-000012' } },
          usuario: { nombre: 'Gerente' },
        },
      ]);

      const resultado = await service.listar({ tipo: 'RECIBO' }, usuarioDePrueba(['proyecto-1']));

      const donde = prisma.notificacion.findMany.mock.calls[0][0].where as Record<string, unknown>;
      expect(donde.venta).toEqual({ lote: { proyectoId: { in: ['proyecto-1'] } } });
      expect(donde.tipo).toBe('RECIBO');
      expect(resultado.total).toBe(1);
      expect(resultado.porEstado).toEqual({ ENVIADA: 4, FALLIDA: 1 });
      expect(resultado.notificaciones[0]).toMatchObject({ lote: 'L-3', proyecto: 'Proyecto Uno', recibo: 'RC-000012', usuario: 'Gerente', cuota: null });
    });

    it('los conteos por estado ignoran el filtro de estado pero la lista no', async () => {
      await service.listar({ estado: 'FALLIDA' }, usuarioDePrueba());

      const dondeLista = prisma.notificacion.findMany.mock.calls[0][0].where as Record<string, unknown>;
      const dondeConteo = prisma.notificacion.groupBy.mock.calls[0][0].where as Record<string, unknown>;
      expect(dondeLista.estado).toBe('FALLIDA');
      expect(dondeConteo.estado).toBeUndefined();
    });

    it('pagina con el límite pedido', async () => {
      await service.listar({ pagina: 3, limite: 20 }, usuarioDePrueba());

      expect(prisma.notificacion.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 20, skip: 40 }));
    });
  });
});
