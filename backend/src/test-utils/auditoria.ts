import type { Mock } from 'vitest';

export interface AuditoriaGuardada {
  usuarioId: string;
  usuarioNombre: string;
  usuarioEmail: string;
  accion: string;
  entidad: string;
  entidadId: string | null;
  resumen: string;
  antes?: unknown;
  despues?: unknown;
}

// Lo que los servicios dejaron en la auditoría durante una prueba (el "create" falso de registroAuditoria).
export function auditoriasDe(crear: Mock): AuditoriaGuardada[] {
  return crear.mock.calls.map(([argumento]) => (argumento as { data: AuditoriaGuardada }).data);
}

export function auditoriaDe(crear: Mock, accion: string): AuditoriaGuardada {
  const encontrada = auditoriasDe(crear).find((registro) => registro.accion === accion);
  if (!encontrada) {
    throw new Error(`No se registró la acción ${accion} en la auditoría. Se registró: ${auditoriasDe(crear).map((r) => r.accion).join(', ') || 'nada'}`);
  }
  return encontrada;
}
