import { BadGatewayException, ConflictException, HttpException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfiguracionService } from '../configuracion/configuracion.service.js';
import { usuarioDePrueba } from '../test-utils/usuario-prueba.js';
import { CorreoService } from './correo.service.js';
import { EmailService, direccionDeRespuesta } from './email.service.js';
import { generarHtmlPrueba } from './plantilla-prueba.js';

const EMPRESA = { nombreComercial: 'Balder Ingeniería', colorPrimario: '#2563eb', telefonos: null, correo: 'contacto@empresa.test' };

describe('direccionDeRespuesta', () => {
  it('las respuestas llegan al correo de contacto de la empresa cuando es distinto del remitente', () => {
    expect(direccionDeRespuesta('contacto@empresa.test', 'avisos@empresa.test')).toBe('contacto@empresa.test');
  });

  it('si es el mismo remitente (sin importar mayúsculas o espacios) no se define otra dirección', () => {
    expect(direccionDeRespuesta('Avisos@Empresa.test', 'avisos@empresa.test')).toBeUndefined();
    expect(direccionDeRespuesta('  avisos@empresa.test ', 'avisos@empresa.test')).toBeUndefined();
  });

  it('sin correo de contacto no hay dirección de respuesta', () => {
    expect(direccionDeRespuesta(null, 'avisos@empresa.test')).toBeUndefined();
    expect(direccionDeRespuesta('   ', 'avisos@empresa.test')).toBeUndefined();
    expect(direccionDeRespuesta(undefined, 'avisos@empresa.test')).toBeUndefined();
  });
});

describe('EmailService', () => {
  const ENTORNO = { ...process.env };
  const configuracion = { obtenerEmpresa: vi.fn() };

  function crear() {
    const servicio = new EmailService(configuracion as unknown as ConfiguracionService);
    const sendMail = vi.fn().mockResolvedValue(undefined);
    (servicio as unknown as { transportador: { sendMail: typeof sendMail } }).transportador = { sendMail };
    return { servicio, sendMail };
  }

  beforeEach(() => {
    configuracion.obtenerEmpresa.mockResolvedValue(EMPRESA);
    process.env.SMTP_HOST = 'smtp.ejemplo.test';
    process.env.SMTP_USER = 'avisos@empresa.test';
    process.env.SMTP_PASS = 'clave-de-prueba';
    process.env.SMTP_FROM = 'Nombre Raro <avisos@empresa.test>';
  });

  afterEach(() => {
    process.env = { ...ENTORNO };
  });

  it('está configurado solo si hay servidor, usuario y contraseña', () => {
    const { servicio } = crear();
    expect(servicio.estaConfigurado()).toBe(true);
    for (const variable of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']) {
      const valor = process.env[variable];
      process.env[variable] = '';
      expect(servicio.estaConfigurado(), `sin ${variable}`).toBe(false);
      process.env[variable] = valor;
    }
  });

  it('el remitente es solo la dirección (el nombre sale de la empresa)', () => {
    const { servicio } = crear();
    expect(servicio.remitente()).toBe('avisos@empresa.test');
  });

  it('el correo sale con el nombre comercial y las respuestas van al correo de contacto de la empresa', async () => {
    const { servicio, sendMail } = crear();

    await servicio.enviar({ to: 'cliente@ejemplo.test', subject: 'Hola', html: '<p>x</p>' });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: { name: 'Balder Ingeniería', address: 'avisos@empresa.test' },
        replyTo: 'contacto@empresa.test',
        to: 'cliente@ejemplo.test',
        subject: 'Hola',
      }),
    );
  });

  it('sin correo de contacto distinto, no define dirección de respuesta', async () => {
    configuracion.obtenerEmpresa.mockResolvedValue({ ...EMPRESA, correo: 'avisos@empresa.test' });
    const { servicio, sendMail } = crear();

    await servicio.enviar({ to: 'cliente@ejemplo.test', subject: 'Hola', html: '<p>x</p>' });

    expect(sendMail.mock.calls[0][0].replyTo).toBeUndefined();
  });

  it('los adjuntos viajan con su nombre y contenido', async () => {
    const { servicio, sendMail } = crear();

    await servicio.enviar({ to: 'a@b.test', subject: 's', html: 'h', adjuntos: [{ nombre: 'recibo.pdf', contenido: Buffer.from('%PDF') }] });

    expect(sendMail.mock.calls[0][0].attachments).toEqual([{ filename: 'recibo.pdf', content: Buffer.from('%PDF') }]);
  });
});

describe('CorreoService', () => {
  const GERENTE = { ...usuarioDePrueba(), id: 'g-1', nombre: 'Gerente de Prueba' };

  function crear(configurado = true) {
    const email = {
      estaConfigurado: vi.fn().mockReturnValue(configurado),
      remitente: vi.fn().mockReturnValue('avisos@empresa.test'),
      enviar: vi.fn().mockResolvedValue(undefined),
    };
    const configuracion = { obtenerEmpresa: vi.fn().mockResolvedValue(EMPRESA) };
    const service = new CorreoService(email as unknown as EmailService, configuracion as unknown as ConfiguracionService);
    return { service, email, configuracion };
  }

  describe('estado', () => {
    it('dice cuál es el remitente y a dónde llegan las respuestas', async () => {
      const { service } = crear();
      expect(await service.estado()).toEqual({ configurado: true, remitente: 'avisos@empresa.test', respondeA: 'contacto@empresa.test' });
    });

    it('sin correo configurado no hay remitente ni dirección de respuesta', async () => {
      const { service } = crear(false);
      expect(await service.estado()).toEqual({ configurado: false, remitente: null, respondeA: null });
    });

    it('si el contacto de la empresa es la misma cuenta, no hay otra dirección de respuesta', async () => {
      const { service, configuracion } = crear();
      configuracion.obtenerEmpresa.mockResolvedValue({ ...EMPRESA, correo: 'avisos@empresa.test' });
      expect((await service.estado()).respondeA).toBeNull();
    });
  });

  describe('enviarPrueba', () => {
    it('manda el mensaje al destino pedido y devuelve desde dónde salió y a dónde llegarán las respuestas', async () => {
      const { service, email } = crear();

      const resultado = await service.enviarPrueba('destino@ejemplo.test', GERENTE);

      expect(resultado).toEqual({ enviado: true, remitente: 'avisos@empresa.test', destino: 'destino@ejemplo.test', respondeA: 'contacto@empresa.test' });
      const enviado = email.enviar.mock.calls[0][0] as { to: string; subject: string; html: string };
      expect(enviado.to).toBe('destino@ejemplo.test');
      expect(enviado.subject).toBe('Correo de prueba — Balder Ingeniería');
      expect(enviado.html).toContain('Gerente de Prueba');
    });

    it('sin correo configurado dice qué falta y no intenta enviar', async () => {
      const { service, email } = crear(false);

      await expect(service.enviarPrueba('destino@ejemplo.test', GERENTE)).rejects.toBeInstanceOf(ConflictException);
      expect(email.enviar).not.toHaveBeenCalled();
    });

    it('si el servidor de correo rechaza el envío, devuelve el motivo recortado, sin la contraseña', async () => {
      const { service, email } = crear();
      email.enviar.mockRejectedValue(new Error(`Invalid login: 535 Username and Password not accepted ${'x'.repeat(500)}`));

      const error = await service.enviarPrueba('destino@ejemplo.test', GERENTE).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadGatewayException);
      const mensaje = (error as BadGatewayException).message;
      expect(mensaje).toContain('Invalid login');
      expect(mensaje.length).toBeLessThan(400);
    });

    it('no deja mandar pruebas seguidas de la misma persona (10 segundos), pero otra persona sí puede', async () => {
      const { service } = crear();
      await service.enviarPrueba('destino@ejemplo.test', GERENTE);

      const segunda = await service.enviarPrueba('destino@ejemplo.test', GERENTE).catch((e: unknown) => e);
      expect(segunda).toBeInstanceOf(HttpException);
      expect((segunda as HttpException).getStatus()).toBe(429);

      await expect(service.enviarPrueba('destino@ejemplo.test', { ...GERENTE, id: 'g-2' })).resolves.toMatchObject({ enviado: true });
    });
  });
});

describe('plantilla del correo de prueba', () => {
  const ahora = new Date('2026-10-21T22:15:00Z'); // 5:15 p. m. en Colombia

  it('dice quién, cuándo y desde dónde se envió, y escapa los textos', () => {
    const html = generarHtmlPrueba({
      enviadoPor: 'Ana <script>',
      remitente: 'avisos@empresa.test',
      respondeA: 'contacto@empresa.test',
      empresa: { ...EMPRESA, nombreComercial: 'Empresa <b>' },
      ahora,
    });
    expect(html).toContain('21/10/2026');
    expect(html).toContain('avisos@empresa.test');
    expect(html).toContain('contacto@empresa.test');
    expect(html).toContain('Ana &lt;script&gt;');
    expect(html).toContain('Empresa &lt;b&gt;');
    expect(html).not.toContain('<script>');
  });

  it('sin otra dirección de respuesta lo aclara', () => {
    const html = generarHtmlPrueba({ enviadoPor: 'Ana', remitente: 'avisos@empresa.test', respondeA: null, empresa: EMPRESA, ahora });
    expect(html).toContain('misma dirección del remitente');
  });
});
