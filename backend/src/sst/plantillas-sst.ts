import { colorSeguro, escaparHtml, formatearFecha, type DatosEmpresaCorreo } from '../recordatorios/plantilla-correo.js';

// Correos de la gestión SST (RF-SST-14, 16 y 20). Son funciones puras: reciben los datos y devuelven el texto. Todo lo que
// viene de la base de datos se escapa antes de entrar al HTML (un nombre con "<" o comillas no altera el mensaje).

export type MomentoAviso = 'PROXIMA' | 'VENCIDA';

// "hoy", "mañana", "en 5 días", "hace 3 días".
export function describirDias(dias: number): string {
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  if (dias === -1) return 'ayer';
  return dias > 0 ? `en ${dias} días` : `hace ${-dias} días`;
}

function marco(empresa: DatosEmpresaCorreo, titulo: string, cuerpo: string, nota: string): string {
  const contacto = [empresa.telefonos, empresa.correo].filter((dato): dato is string => Boolean(dato));
  return `
    <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 520px; margin: 0 auto;">
      <p style="margin: 0 0 4px; font-size: 13px; color: #64748b;">${escaparHtml(empresa.nombreComercial)}</p>
      <h2 style="color: ${colorSeguro(empresa.colorPrimario)}; margin-top: 0;">${titulo}</h2>
      ${cuerpo}
      <p style="color: #64748b; font-size: 13px;">${nota}${contacto.length > 0 ? `<br>Para cualquier duda: ${contacto.map(escaparHtml).join(' · ')}` : ''}</p>
    </div>
  `;
}

function etiquetaMomento(momento: MomentoAviso, diasRestantes: number): string {
  return momento === 'VENCIDA' ? `venció ${describirDias(diasRestantes)}` : `vence ${describirDias(diasRestantes)}`;
}

// ---------- Actividad del plan de trabajo ----------

export interface DatosAvisoActividad {
  momento: MomentoAviso;
  responsable: string;
  actividad: string;
  meta: string;
  anio: number;
  fechaFin: Date;
  diasRestantes: number;
  empresa: DatosEmpresaCorreo;
}

export function asuntoAvisoActividad(momento: MomentoAviso, actividad: string): string {
  return momento === 'VENCIDA' ? `Actividad del plan SST vencida: ${actividad}` : `Actividad del plan SST próxima a vencer: ${actividad}`;
}

export function generarHtmlAvisoActividad(d: DatosAvisoActividad): string {
  return marco(
    d.empresa,
    d.momento === 'VENCIDA' ? 'Actividad del plan de trabajo vencida' : 'Actividad del plan de trabajo próxima a vencer',
    `
      <p>Hola ${escaparHtml(d.responsable)},</p>
      <p>
        La actividad <strong>${escaparHtml(d.actividad)}</strong> del plan de trabajo de seguridad y salud en el trabajo de ${d.anio}
        ${etiquetaMomento(d.momento, d.diasRestantes)} (<strong>${formatearFecha(d.fechaFin)}</strong>).
      </p>
      <p><strong>Meta:</strong> ${escaparHtml(d.meta)}</p>
    `,
    'Cuando la ejecutes, actualiza su estado y su avance en el sistema y adjunta la evidencia.',
  );
}

// ---------- Capacitación ----------

export interface DatosAvisoCapacitacion {
  momento: MomentoAviso;
  responsable: string;
  tema: string;
  fechaProgramada: Date;
  diasRestantes: number;
  dirigidoA: string;
  empresa: DatosEmpresaCorreo;
}

export function asuntoAvisoCapacitacion(momento: MomentoAviso, tema: string): string {
  return momento === 'VENCIDA' ? `Capacitación SST sin ejecutar: ${tema}` : `Capacitación SST próxima: ${tema}`;
}

export function generarHtmlAvisoCapacitacion(d: DatosAvisoCapacitacion): string {
  return marco(
    d.empresa,
    d.momento === 'VENCIDA' ? 'Capacitación sin ejecutar' : 'Capacitación próxima',
    `
      <p>Hola ${escaparHtml(d.responsable)},</p>
      <p>
        La capacitación <strong>${escaparHtml(d.tema)}</strong>, dirigida a ${escaparHtml(d.dirigidoA)}, estaba programada para el
        <strong>${formatearFecha(d.fechaProgramada)}</strong> y ${etiquetaMomento(d.momento, d.diasRestantes)}.
      </p>
    `,
    d.momento === 'VENCIDA'
      ? 'Si ya se dictó, registra su ejecución y la asistencia en el sistema; si se aplazó, cambia la fecha programada.'
      : 'Después de dictarla, registra su ejecución y la asistencia en el sistema.',
  );
}

// ---------- Resumen de EPP por reponer ----------

export interface FilaAvisoEpp {
  trabajador: string;
  documento: string;
  elemento: string;
  proximaReposicion: Date;
  diasRestantes: number;
}

export interface DatosResumenEpp {
  vencidos: FilaAvisoEpp[];
  porReponer: FilaAvisoEpp[];
  empresa: DatosEmpresaCorreo;
}

export function asuntoResumenEpp(vencidos: number, porReponer: number): string {
  const partes = [vencidos > 0 ? `${vencidos} vencido${vencidos === 1 ? '' : 's'}` : null, porReponer > 0 ? `${porReponer} por reponer` : null].filter(Boolean);
  return `Elementos de protección personal: ${partes.join(' y ')}`;
}

function tablaEpp(titulo: string, filas: FilaAvisoEpp[]): string {
  if (filas.length === 0) return '';
  const celdas = filas
    .map(
      (f) => `
        <tr>
          <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0;">${escaparHtml(f.trabajador)}<br><span style="color: #64748b; font-size: 12px;">${escaparHtml(f.documento)}</span></td>
          <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0;">${escaparHtml(f.elemento)}</td>
          <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0;">${formatearFecha(f.proximaReposicion)}<br><span style="color: #64748b; font-size: 12px;">${describirDias(f.diasRestantes)}</span></td>
        </tr>`,
    )
    .join('');
  return `
    <h3 style="margin: 20px 0 6px; font-size: 15px;">${titulo} (${filas.length})</h3>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <thead><tr style="text-align: left; color: #64748b; font-size: 12px;"><th style="padding: 6px 8px;">Trabajador</th><th style="padding: 6px 8px;">Elemento</th><th style="padding: 6px 8px;">Reposición</th></tr></thead>
      <tbody>${celdas}</tbody>
    </table>`;
}

export function generarHtmlResumenEpp(d: DatosResumenEpp): string {
  return marco(
    d.empresa,
    'Reposición de elementos de protección personal',
    `
      <p>Estos elementos de protección personal llegaron a su fecha de reposición o están por llegar a ella.</p>
      ${tablaEpp('Vencidos', d.vencidos)}
      ${tablaEpp('Por reponer', d.porReponer)}
    `,
    'Al registrar la nueva entrega en el sistema, el elemento deja de aparecer aquí. Este resumen solo incluye lo que no se había avisado antes.',
  );
}
