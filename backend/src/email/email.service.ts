import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { ConfiguracionService } from '../configuracion/configuracion.service.js';

export interface EnviarCorreoParams {
  to: string;
  subject: string;
  html: string;
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

  async enviar(params: EnviarCorreoParams): Promise<void> {
    const empresa = await this.configuracion.obtenerEmpresa();
    await this.transportador.sendMail({
      from: { name: empresa.nombreComercial, address: this.direccionRemitente() },
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
    this.logger.log(`Correo enviado a ${params.to}: "${params.subject}"`);
  }
}
