import { BadRequestException, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConfiguracionService } from '../configuracion/configuracion.service.js';
import type { EmailService } from '../email/email.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { auditoriaDe } from '../test-utils/auditoria.js';
import { enlaceDeRecuperacion, FORMATO_TOKEN, generarToken, huellaDeToken } from './recuperacion-token.js';
import { RecuperacionService } from './recuperacion.service.js';
import { generarHtmlCambioDePassword, generarHtmlRecuperacion } from './plantillas-recuperacion.js';

describe('token de recuperación (RF-USR-06)', () => {
  it('es aleatorio, de 43 caracteres base64url, y su huella es un SHA-256 en hexadecimal', () => {
    const a = generarToken();
    const b = generarToken();
    expect(a.token).toMatch(FORMATO_TOKEN);
    expect(a.token).not.toBe(b.token);
    expect(a.huella).toMatch(/^[0-9a-f]{64}$/);
    expect(a.huella).toBe(huellaDeToken(a.token));
    expect(a.huella).not.toBe(b.huella);
  });

  it('la huella no contiene el token y el mismo token da siempre la misma huella', () => {
    const { token, huella } = generarToken();
    expect(huella).not.toContain(token);
    expect(huellaDeToken(token)).toBe(huellaDeToken(token));
  });

  it('el formato rechaza lo que no sea un token', () => {
    for (const malo of ['', 'abc', 'x'.repeat(42), 'x'.repeat(44), `${'x'.repeat(42)}!`, `${'x'.repeat(41)} y`]) {
      expect(FORMATO_TOKEN.test(malo)).toBe(false);
    }
  });

  it('arma el enlace con la dirección del sitio, sin barras de más', () => {
    expect(enlaceDeRecuperacion('https://sistema.ejemplo.test/', 'abc_-DEF')).toBe('https://sistema.ejemplo.test/restablecer?token=abc_-DEF');
    expect(enlaceDeRecuperacion('http://localhost:5173', 'tok')).toBe('http://localhost:5173/restablecer?token=tok');
  });
});

describe('correos de recuperación', () => {
  const empresa = { nombreComercial: 'Empresa <Prueba>', colorPrimario: '#112233', telefonos: '3001234567', correo: 'info@prueba.test' };

  it('el correo del enlace trae el enlace, la vigencia y escapa los textos de la base de datos', () => {
    const html = generarHtmlRecuperacion({ nombre: 'Ana <b>', enlace: 'https://x.test/restablecer?token=a&b=1', minutosVigencia: 60, empresa });
    expect(html).toContain('href="https://x.test/restablecer?token=a&amp;b=1"');
    expect(html).toContain('60 minutos');
    expect(html).toContain('una sola vez');
    expect(html).toContain('Ana &lt;b&gt;');
    expect(html).toContain('Empresa &lt;Prueba&gt;');
    expect(html).not.toContain('Ana <b>');
  });

  it('con un minuto de vigencia lo dice en singular', () => {
    expect(generarHtmlRecuperacion({ nombre: 'Ana', enlace: 'https://x.test', minutosVigencia: 1, empresa })).toContain('1 minuto.');
  });

  it('el aviso de cambio dice que se cerraron las sesiones y a quién avisar si no fue la persona', () => {
    const html = generarHtmlCambioDePassword({ nombre: 'Ana', empresa });
    expect(html).toContain('se cerraron las sesiones');
    expect(html).toContain('info@prueba.test');
  });
});

describe('RecuperacionService', () => {
  const ENTORNO_ORIGINAL = process.env.NODE_ENV;

  const EMPRESA = {
    nombreComercial: 'Empresa de Prueba',
    colorPrimario: '#2563eb',
    telefonos: null,
    correo: null,
    minutosVigenciaRecuperacion: 60,
    recuperacionesPorHora: 3,
  };
  const USUARIO = { id: 'u-1', nombre: 'Ana Pérez', email: 'ana@ejemplo.test', estado: 'ACTIVO', rol: { activo: true } };

  function crear() {
    const tx = {
      recuperacionPassword: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      usuario: { update: vi.fn().mockResolvedValue({}) },
      registroAuditoria: { create: vi.fn() },
    };
    const prisma = {
      usuario: { findFirst: vi.fn().mockResolvedValue(USUARIO) },
      recuperacionPassword: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue({}),
        findUnique: vi.fn(),
      },
      $transaction: vi.fn((callback: (t: typeof tx) => unknown) => callback(tx)),
    };
    const email = { estaConfigurado: vi.fn().mockReturnValue(true), enviar: vi.fn().mockResolvedValue(undefined) };
    const configuracion = { obtenerEmpresa: vi.fn().mockResolvedValue(EMPRESA) };
    const service = new RecuperacionService(prisma as unknown as PrismaService, email as unknown as EmailService, configuracion as unknown as ConfiguracionService);
    return { service, prisma, tx, email, configuracion };
  }

  const guardada = (extra: Record<string, unknown> = {}) => ({
    id: 'r-1',
    usadoEn: null,
    venceEn: new Date(Date.now() + 30 * 60_000),
    usuario: USUARIO,
    ...extra,
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.NODE_ENV = ENTORNO_ORIGINAL;
  });

  describe('solicitar', () => {
    it('crea el enlace (solo con su huella), lo manda por correo y vence a la hora configurada', async () => {
      const { service, prisma, email } = crear();
      const antes = Date.now();

      await service.solicitar('ana@ejemplo.test');

      const datos = prisma.recuperacionPassword.create.mock.calls[0][0].data as { usuarioId: string; tokenHash: string; venceEn: Date };
      expect(datos.usuarioId).toBe('u-1');
      expect(datos.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(datos.venceEn.getTime() - antes).toBeGreaterThanOrEqual(60 * 60_000 - 1000);
      expect(datos.venceEn.getTime() - antes).toBeLessThanOrEqual(60 * 60_000 + 5000);

      const enviado = email.enviar.mock.calls[0][0] as { to: string; subject: string; html: string };
      expect(enviado.to).toBe('ana@ejemplo.test');
      const token = /restablecer\?token=([A-Za-z0-9_-]{43})/.exec(enviado.html)?.[1];
      expect(token).toBeDefined();
      // La huella guardada es la del token que viajó por correo, y el token en sí no se guarda en ningún lado.
      expect(huellaDeToken(token as string)).toBe(datos.tokenHash);
      expect(JSON.stringify(prisma.recuperacionPassword.create.mock.calls[0][0])).not.toContain(token as string);
    });

    it('busca el correo sin distinguir mayúsculas', async () => {
      const { service, prisma } = crear();

      await service.solicitar('  ANA@Ejemplo.TEST ');

      expect(prisma.usuario.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { email: { equals: 'ANA@Ejemplo.TEST', mode: 'insensitive' } } }));
    });

    it('con un correo que no existe no hace nada y no falla (la respuesta al usuario es la misma)', async () => {
      const { service, prisma, email } = crear();
      prisma.usuario.findFirst.mockResolvedValue(null);

      await expect(service.solicitar('nadie@ejemplo.test')).resolves.toBeUndefined();

      expect(prisma.recuperacionPassword.create).not.toHaveBeenCalled();
      expect(email.enviar).not.toHaveBeenCalled();
    });

    it.each([
      ['la cuenta está desactivada', { estado: 'INACTIVO' }],
      ['el rol está desactivado', { rol: { activo: false } }],
    ])('no manda nada si %s', async (_nombre, cambios) => {
      const { service, prisma, email } = crear();
      prisma.usuario.findFirst.mockResolvedValue({ ...USUARIO, ...cambios });

      await service.solicitar('ana@ejemplo.test');

      expect(prisma.recuperacionPassword.create).not.toHaveBeenCalled();
      expect(email.enviar).not.toHaveBeenCalled();
    });

    it('respeta el tope de solicitudes por hora: con 3 ya pedidas no crea ni manda otra, y con 2 sí', async () => {
      const { service, prisma, email } = crear();
      prisma.recuperacionPassword.count.mockResolvedValue(3);
      await service.solicitar('ana@ejemplo.test');
      expect(prisma.recuperacionPassword.create).not.toHaveBeenCalled();
      expect(email.enviar).not.toHaveBeenCalled();
      expect(prisma.recuperacionPassword.count).toHaveBeenCalledWith({ where: { usuarioId: 'u-1', createdAt: { gte: expect.any(Date) } } });

      prisma.recuperacionPassword.count.mockResolvedValue(2);
      await service.solicitar('ana@ejemplo.test');
      expect(prisma.recuperacionPassword.create).toHaveBeenCalledTimes(1);
    });

    it('usa la vigencia y el tope que el gerente configuró', async () => {
      const { service, prisma, configuracion } = crear();
      configuracion.obtenerEmpresa.mockResolvedValue({ ...EMPRESA, minutosVigenciaRecuperacion: 15, recuperacionesPorHora: 1 });
      const antes = Date.now();
      await service.solicitar('ana@ejemplo.test');
      const venceEn = (prisma.recuperacionPassword.create.mock.calls[0][0].data as { venceEn: Date }).venceEn;
      expect(venceEn.getTime() - antes).toBeLessThanOrEqual(15 * 60_000 + 5000);

      prisma.recuperacionPassword.count.mockResolvedValue(1);
      prisma.recuperacionPassword.create.mockClear();
      await service.solicitar('ana@ejemplo.test');
      expect(prisma.recuperacionPassword.create).not.toHaveBeenCalled();
    });

    it('sin correo configurado, fuera de producción deja el enlace en el registro del servidor para poder probar', async () => {
      const { service, email } = crear();
      email.estaConfigurado.mockReturnValue(false);
      process.env.NODE_ENV = 'development';
      const aviso = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      await service.solicitar('ana@ejemplo.test');

      expect(email.enviar).not.toHaveBeenCalled();
      expect(String(aviso.mock.calls[0][0])).toContain('/restablecer?token=');
    });

    it('sin correo configurado, en producción NUNCA escribe el enlace en el registro', async () => {
      const { service, email } = crear();
      email.estaConfigurado.mockReturnValue(false);
      process.env.NODE_ENV = 'production';
      const aviso = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      await service.solicitar('ana@ejemplo.test');

      expect(aviso).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledTimes(1);
      expect(String(error.mock.calls[0][0])).not.toContain('token=');
    });

    it('si el correo falla no lanza: la respuesta al usuario no debe delatar nada', async () => {
      const { service, email } = crear();
      email.enviar.mockRejectedValue(new Error('SMTP caído'));
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      await expect(service.solicitar('ana@ejemplo.test')).resolves.toBeUndefined();
    });
  });

  describe('restablecer', () => {
    const { token } = generarToken();

    it('cambia la contraseña, marca el enlace usado, anula los demás, cierra sesiones, desbloquea y audita', async () => {
      const { service, prisma, tx, email } = crear();
      prisma.recuperacionPassword.findUnique.mockResolvedValue(guardada());

      await service.restablecer(token, 'clave-nueva-123');

      expect(prisma.recuperacionPassword.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenHash: huellaDeToken(token) } }));
      expect(tx.recuperacionPassword.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: 'r-1', usadoEn: null, venceEn: { gt: expect.any(Date) } },
        data: { usadoEn: expect.any(Date) },
      });
      expect(tx.recuperacionPassword.updateMany).toHaveBeenNthCalledWith(2, { where: { usuarioId: 'u-1', usadoEn: null }, data: { usadoEn: expect.any(Date) } });

      const cambio = tx.usuario.update.mock.calls[0][0] as { where: { id: string }; data: { passwordHash: string; intentosFallidos: number; bloqueadoHasta: null; sesionesValidasDesde: Date } };
      expect(cambio.where).toEqual({ id: 'u-1' });
      expect(await bcrypt.compare('clave-nueva-123', cambio.data.passwordHash)).toBe(true);
      expect(cambio.data).toMatchObject({ intentosFallidos: 0, bloqueadoHasta: null });
      expect(cambio.data.sesionesValidasDesde).toBeInstanceOf(Date);

      const auditoria = auditoriaDe(tx.registroAuditoria.create, 'USUARIO_RECUPERAR_PASSWORD');
      expect(auditoria).toMatchObject({ entidad: 'USUARIO', entidadId: 'u-1', usuarioId: 'u-1' });
      expect(JSON.stringify(auditoria)).not.toContain('clave-nueva-123');
      expect(auditoria.despues).toEqual({ contrasenaCambiada: true, sesionesCerradas: true, desbloqueado: true });

      const aviso = email.enviar.mock.calls[0][0] as { to: string; subject: string };
      expect(aviso.to).toBe('ana@ejemplo.test');
      expect(aviso.subject).toContain('Tu contraseña cambió');
    });

    it.each([
      ['un enlace que no existe', null],
      ['un enlace ya usado', guardada({ usadoEn: new Date() })],
      ['un enlace vencido', guardada({ venceEn: new Date(Date.now() - 1000) })],
      ['una cuenta desactivada', guardada({ usuario: { ...USUARIO, estado: 'INACTIVO' } })],
      ['un rol desactivado', guardada({ usuario: { ...USUARIO, rol: { activo: false } } })],
    ])('rechaza %s con el mismo mensaje y sin tocar nada', async (_nombre, fila) => {
      const { service, prisma, tx } = crear();
      prisma.recuperacionPassword.findUnique.mockResolvedValue(fila);

      await expect(service.restablecer(token, 'clave-nueva-123')).rejects.toThrow('El enlace no es válido o ya venció');
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.usuario.update).not.toHaveBeenCalled();
    });

    it('si otra persona usó el enlace un instante antes (carrera), falla y no cambia la contraseña', async () => {
      const { service, prisma, tx } = crear();
      prisma.recuperacionPassword.findUnique.mockResolvedValue(guardada());
      tx.recuperacionPassword.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.restablecer(token, 'clave-nueva-123')).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.usuario.update).not.toHaveBeenCalled();
      expect(tx.registroAuditoria.create).not.toHaveBeenCalled();
    });

    it('si el correo de aviso falla, el cambio ya está hecho y no lanza', async () => {
      const { service, prisma, email } = crear();
      prisma.recuperacionPassword.findUnique.mockResolvedValue(guardada());
      email.enviar.mockRejectedValue(new Error('SMTP caído'));
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      await expect(service.restablecer(token, 'clave-nueva-123')).resolves.toBeUndefined();
    });

    it('sin correo configurado no intenta avisar, pero el cambio se hace', async () => {
      const { service, prisma, email, tx } = crear();
      prisma.recuperacionPassword.findUnique.mockResolvedValue(guardada());
      email.estaConfigurado.mockReturnValue(false);

      await service.restablecer(token, 'clave-nueva-123');

      expect(tx.usuario.update).toHaveBeenCalledTimes(1);
      expect(email.enviar).not.toHaveBeenCalled();
    });
  });

});
