import type { Prisma } from '../generated/prisma/client.js';

export interface DatosRecordatorio {
  nombreCliente: string;
  nombreProyecto: string;
  numeroLote: string;
  numeroCuota: number;
  fechaVencimiento: Date;
  valor: Prisma.Decimal;
}

// La fecha se guarda como un instante UTC, pero solo interesa el día
// calendario en Colombia — de ahí el timeZone explícito en vez de
// confiar en la hora local del proceso que corre este código.
function formatearFecha(fecha: Date): string {
  return fecha.toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Bogota',
  });
}

function formatearValor(valor: Prisma.Decimal): string {
  return `$${valor.toNumber().toLocaleString('es-CO')}`;
}

export function generarHtmlRecordatorio(datos: DatosRecordatorio): string {
  return `
    <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #1d4ed8;">Recordatorio de pago</h2>
      <p>Hola ${datos.nombreCliente},</p>
      <p>
        Te recordamos que la cuota <strong>#${datos.numeroCuota}</strong> del lote
        <strong>${datos.numeroLote}</strong> en <strong>${datos.nombreProyecto}</strong>
        vence el <strong>${formatearFecha(datos.fechaVencimiento)}</strong>.
      </p>
      <p style="font-size: 18px; margin: 24px 0;">
        Valor a pagar: <strong>${formatearValor(datos.valor)}</strong>
      </p>
      <p style="color: #64748b; font-size: 13px;">
        Si ya realizaste este pago, puedes ignorar este mensaje.
      </p>
    </div>
  `;
}
