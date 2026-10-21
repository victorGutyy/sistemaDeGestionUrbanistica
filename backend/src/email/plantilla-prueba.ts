import { ZONA_HORARIA } from '../common/zona-horaria.js';
import { colorSeguro, escaparHtml, type DatosEmpresaCorreo } from '../recordatorios/plantilla-correo.js';

export interface DatosCorreoPrueba {
  enviadoPor: string;
  remitente: string;
  respondeA: string | null;
  empresa: DatosEmpresaCorreo;
  // Para poder probarla con una fecha fija.
  ahora?: Date;
}

// Mensaje corto para comprobar que el correo de la empresa funciona: no lleva datos de clientes ni de ventas.
export function generarHtmlPrueba(d: DatosCorreoPrueba): string {
  const ahora = d.ahora ?? new Date();
  const fecha = ahora.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: ZONA_HORARIA });
  const hora = ahora.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: ZONA_HORARIA });
  return `
    <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 480px; margin: 0 auto;">
      <p style="margin: 0 0 4px; font-size: 13px; color: #64748b;">${escaparHtml(d.empresa.nombreComercial)}</p>
      <h2 style="color: ${colorSeguro(d.empresa.colorPrimario)}; margin-top: 0;">Correo de prueba</h2>
      <p>Este mensaje lo envió el sistema para comprobar que el correo de la empresa funciona. Si lo estás leyendo, <strong>los avisos a los clientes van a llegar</strong>.</p>
      <p style="font-size: 14px; margin: 16px 0;">
        Enviado por ${escaparHtml(d.enviadoPor)} el ${fecha} a las ${hora}.<br>
        Remitente: ${escaparHtml(d.remitente)}<br>
        ${d.respondeA ? `Si respondes, tu respuesta llega a: ${escaparHtml(d.respondeA)}` : 'Las respuestas llegan a la misma dirección del remitente.'}
      </p>
      <p style="color: #64748b; font-size: 13px;">No hace falta responder. Revisa también que este mensaje no haya caído en la carpeta de correo no deseado.</p>
    </div>
  `;
}
