import type { Prisma } from '../generated/prisma/client.js';

export interface DatosEmpresaCorreo {
  nombreComercial: string;
  colorPrimario: string;
  telefonos: string | null;
  correo: string | null;
}

export interface DatosRecordatorio {
  nombreCliente: string;
  nombreProyecto: string;
  numeroLote: string;
  numeroCuota: number;
  fechaVencimiento: Date;
  valor: Prisma.Decimal;
  empresa: DatosEmpresaCorreo;
}

// Todo texto que viene de la base de datos (nombres, proyectos, datos de la
// empresa) se escapa antes de meterlo en el HTML del correo: un nombre con
// "<" o comillas no debe poder alterar el contenido del mensaje.
export function escaparHtml(texto: string): string {
  return texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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

// El color viene validado como #rrggbb al guardarlo, pero se vuelve a
// comprobar aquí porque entra directo a un atributo style.
function colorSeguro(color: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#2563eb';
}

export function generarHtmlRecordatorio(datos: DatosRecordatorio): string {
  const { empresa } = datos;
  const contacto = [empresa.telefonos, empresa.correo].filter((dato): dato is string => Boolean(dato));

  return `
    <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 480px; margin: 0 auto;">
      <p style="margin: 0 0 4px; font-size: 13px; color: #64748b;">${escaparHtml(empresa.nombreComercial)}</p>
      <h2 style="color: ${colorSeguro(empresa.colorPrimario)}; margin-top: 0;">Recordatorio de pago</h2>
      <p>Hola ${escaparHtml(datos.nombreCliente)},</p>
      <p>
        Te recordamos que ${datos.numeroCuota === 0 ? 'la <strong>cuota inicial</strong>' : `la cuota <strong>#${datos.numeroCuota}</strong>`} del lote
        <strong>${escaparHtml(datos.numeroLote)}</strong> en <strong>${escaparHtml(datos.nombreProyecto)}</strong>
        vence el <strong>${formatearFecha(datos.fechaVencimiento)}</strong>.
      </p>
      <p style="font-size: 18px; margin: 24px 0;">
        Valor a pagar: <strong>${formatearValor(datos.valor)}</strong>
      </p>
      <p style="color: #64748b; font-size: 13px;">
        Si ya realizaste este pago, puedes ignorar este mensaje.
        ${contacto.length > 0 ? `<br>Para cualquier duda: ${contacto.map(escaparHtml).join(' · ')}` : ''}
      </p>
    </div>
  `;
}
