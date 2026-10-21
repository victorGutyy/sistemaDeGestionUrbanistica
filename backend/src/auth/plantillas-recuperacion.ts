import { colorSeguro, escaparHtml, type DatosEmpresaCorreo } from '../recordatorios/plantilla-correo.js';

function marco(empresa: DatosEmpresaCorreo, titulo: string, cuerpo: string, nota: string): string {
  return `
    <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 480px; margin: 0 auto;">
      <p style="margin: 0 0 4px; font-size: 13px; color: #64748b;">${escaparHtml(empresa.nombreComercial)}</p>
      <h2 style="color: ${colorSeguro(empresa.colorPrimario)}; margin-top: 0;">${titulo}</h2>
      ${cuerpo}
      <p style="color: #64748b; font-size: 13px;">${nota}</p>
    </div>
  `;
}

export interface DatosCorreoRecuperacion {
  nombre: string;
  enlace: string;
  minutosVigencia: number;
  empresa: DatosEmpresaCorreo;
}

// Correo con el enlace para elegir una contraseña nueva (RF-USR-06).
export function generarHtmlRecuperacion(d: DatosCorreoRecuperacion): string {
  return marco(
    d.empresa,
    'Recupera tu contraseña',
    `
      <p>Hola ${escaparHtml(d.nombre)},</p>
      <p>Recibimos una solicitud para cambiar la contraseña de tu cuenta. Para elegir una nueva, abre este enlace:</p>
      <p style="margin: 24px 0;">
        <a href="${escaparHtml(d.enlace)}" style="background: ${colorSeguro(d.empresa.colorPrimario)}; color: #ffffff; padding: 10px 18px; border-radius: 6px; text-decoration: none; display: inline-block;">Elegir una contraseña nueva</a>
      </p>
      <p style="font-size: 13px;">Si el botón no abre, copia esta dirección en el navegador:<br><span style="word-break: break-all;">${escaparHtml(d.enlace)}</span></p>
      <p>El enlace sirve <strong>una sola vez</strong> y vence en ${d.minutosVigencia} minuto${d.minutosVigencia === 1 ? '' : 's'}.</p>
    `,
    'Si tú no lo pediste, ignora este mensaje: tu contraseña sigue igual y nadie puede cambiarla sin este enlace.',
  );
}

export interface DatosCorreoCambio {
  nombre: string;
  empresa: DatosEmpresaCorreo;
}

// Aviso al dueño de la cuenta cuando su contraseña cambió: si no fue él, tiene la pista de que algo pasó.
export function generarHtmlCambioDePassword(d: DatosCorreoCambio): string {
  const contacto = [d.empresa.telefonos, d.empresa.correo].filter((dato): dato is string => Boolean(dato));
  return marco(
    d.empresa,
    'Tu contraseña cambió',
    `
      <p>Hola ${escaparHtml(d.nombre)},</p>
      <p>La contraseña de tu cuenta se acaba de cambiar con el enlace de recuperación, y se cerraron las sesiones que tenías abiertas.</p>
    `,
    `Si no fuiste tú, avisa de inmediato al gerente${contacto.length > 0 ? ` (${contacto.map(escaparHtml).join(' · ')})` : ''} para que bloquee la cuenta.`,
  );
}
