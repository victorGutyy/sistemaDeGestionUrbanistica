import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';

export interface AdjuntoCorreo {
  nombre: string;
  contenido: Buffer;
}

export interface EnviarCorreoParams {
  to: string;
  subject: string;
  html: string;
  adjuntos?: AdjuntoCorreo[];
}

// A dónde llegan las respuestas de los clientes: al correo de contacto de la empresa (Configuración), siempre que sea
// distinto de la cuenta desde la que se envía. Si no hay uno distinto, las respuestas llegan al propio remitente.
export function direccionDeRespuesta(correoEmpresa: string | null | undefined, remitente: string): string | undefined {
  const correo = correoEmpresa?.trim();
  if (!correo || correo.toLowerCase() === remitente.trim().toLowerCase()) return undefined;
  return correo;
}

// Envoltorio delgado sobre nodemailer/SMTP. Si algún día cambian de
// proveedor (a un servicio transaccional tipo Resend/SendGrid), este es
// el único archivo que hay que tocar.
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transportador: Transporter;

  constructor(private readonly configuracion: ConfiguracionService) {
    this.transportador = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT ?? 587) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  // De SMTP_FROM solo se usa la dirección: el nombre que ve el cliente es
  // siempre el nombre comercial configurado, no un texto fijo del .env.
  private direccionRemitente(): string {
    const remitente = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? '';
    return /<([^>]+)>/.exec(remitente)?.[1] ?? remitente;
  }

  // Sin servidor SMTP (desarrollo, demostración) no se intenta enviar: el aviso se registra como omitido.
  estaConfigurado(): boolean {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  }

  // La dirección desde la que salen los avisos (vacía si el servidor no tiene correo configurado).
  remitente(): string {
    return this.direccionRemitente();
  }

  async enviar(params: EnviarCorreoParams): Promise<void> {
    const empresa = await this.configuracion.obtenerEmpresa();
    await this.transportador.sendMail({
      from: { name: empresa.nombreComercial, address: this.direccionRemitente() },
      // Lo que el cliente conteste llega al correo de contacto de la empresa, no a la cuenta de los avisos.
      replyTo: direccionDeRespuesta(empresa.correo, this.direccionRemitente()),
      to: params.to,
      subject: params.subject,
      html: params.html,
      attachments: params.adjuntos?.map((adjunto) => ({ filename: adjunto.nombre, content: adjunto.contenido })),
    });
    this.logger.log(`Correo enviado a ${params.to}: "${params.subject}"`);
  }
}
