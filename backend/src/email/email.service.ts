import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

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

  constructor() {
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

  async enviar(params: EnviarCorreoParams): Promise<void> {
    await this.transportador.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
    this.logger.log(`Correo enviado a ${params.to}: "${params.subject}"`);
  }
}
