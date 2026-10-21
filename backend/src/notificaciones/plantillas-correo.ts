import { formatearCOP } from '../common/formato.util.js';
import { colorSeguro, escaparHtml, type DatosEmpresaCorreo } from '../recordatorios/plantilla-correo.js';
import { fechaCorta } from './mensajes.js';

function pie(empresa: DatosEmpresaCorreo): string {
  const contacto = [empresa.telefonos, empresa.correo].filter((dato): dato is string => Boolean(dato));
  return contacto.length > 0 ? `<br>Para cualquier duda: ${contacto.map(escaparHtml).join(' · ')}` : '';
}

function marco(empresa: DatosEmpresaCorreo, titulo: string, cuerpo: string, nota: string): string {
  return `
    <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 480px; margin: 0 auto;">
      <p style="margin: 0 0 4px; font-size: 13px; color: #64748b;">${escaparHtml(empresa.nombreComercial)}</p>
      <h2 style="color: ${colorSeguro(empresa.colorPrimario)}; margin-top: 0;">${titulo}</h2>
      ${cuerpo}
      <p style="color: #64748b; font-size: 13px;">${nota}${pie(empresa)}</p>
    </div>
  `;
}

export interface DatosCorreoRecibo {
  nombreCliente: string;
  numeroRecibo: string;
  proyecto: string;
  lote: string;
  fechaAbono: Date;
  valor: string;
  saldoNuevo: string;
  empresa: DatosEmpresaCorreo;
}

// Correo con el recibo de caja (RF-NOT-01). El recibo va adjunto en PDF; el cuerpo solo resume el pago.
export function generarHtmlRecibo(d: DatosCorreoRecibo): string {
  return marco(
    d.empresa,
    'Recibo de pago',
    `
      <p>Hola ${escaparHtml(d.nombreCliente)},</p>
      <p>
        Registramos tu pago para el lote <strong>${escaparHtml(d.lote)}</strong> en <strong>${escaparHtml(d.proyecto)}</strong>.
        Adjuntamos tu recibo <strong>${escaparHtml(d.numeroRecibo)}</strong> en PDF.
      </p>
      <p style="font-size: 18px; margin: 24px 0 8px;">Valor recibido: <strong>${formatearCOP(d.valor)}</strong></p>
      <p style="margin: 0 0 24px;">Fecha del pago: ${fechaCorta(d.fechaAbono)} · Saldo pendiente: <strong>${formatearCOP(d.saldoNuevo)}</strong></p>
    `,
    'Guarda este recibo como soporte de tu pago.',
  );
}

export interface DatosCorreoMora {
  nombreCliente: string;
  proyecto: string;
  lote: string;
  cuotas: { etiqueta: string; fechaVencimiento: Date; saldo: string }[];
  saldoVencido: string;
  empresa: DatosEmpresaCorreo;
}

// Aviso de cuotas vencidas (RF-NOT-03). Solo cuotas y saldo: el interés de mora no se incluye mientras el cliente
// no confirme cómo se cobra (RF-CAR-06).
export function generarHtmlMora(d: DatosCorreoMora): string {
  const filas = d.cuotas
    .map(
      (cuota) => `
        <tr>
          <td style="padding: 4px 8px 4px 0;">${escaparHtml(cuota.etiqueta)}</td>
          <td style="padding: 4px 8px;">${fechaCorta(cuota.fechaVencimiento)}</td>
          <td style="padding: 4px 0 4px 8px; text-align: right;">${formatearCOP(cuota.saldo)}</td>
        </tr>`,
    )
    .join('');
  return marco(
    d.empresa,
    'Aviso de cuotas vencidas',
    `
      <p>Hola ${escaparHtml(d.nombreCliente)},</p>
      <p>
        Tienes cuotas vencidas del lote <strong>${escaparHtml(d.lote)}</strong> en <strong>${escaparHtml(d.proyecto)}</strong>:
      </p>
      <table style="border-collapse: collapse; font-size: 14px; width: 100%;">
        <tr style="color: #64748b; font-size: 12px; text-align: left;"><th style="padding: 4px 8px 4px 0;">Cuota</th><th style="padding: 4px 8px;">Venció</th><th style="padding: 4px 0 4px 8px; text-align: right;">Saldo</th></tr>
        ${filas}
      </table>
      <p style="font-size: 18px; margin: 20px 0;">Total vencido: <strong>${formatearCOP(d.saldoVencido)}</strong></p>
    `,
    'Si ya realizaste el pago, envíanos el soporte para actualizar tu cuenta y ignora este mensaje.',
  );
}
