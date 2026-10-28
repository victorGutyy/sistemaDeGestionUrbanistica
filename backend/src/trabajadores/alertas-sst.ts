import { EstadoTrabajador, TipoContrato, TipoEntidadSS } from '../generated/prisma/enums.js';
import { exigeAfiliaciones, TIPOS_AFILIACION_REQUERIDOS } from './afiliaciones.js';

// Alertas de la ficha de seguridad social (CC-03): qué le falta a cada trabajador activo. Función pura.

export interface TrabajadorParaAlertas {
  id: string;
  nombre: string;
  documento: string;
  estado: EstadoTrabajador;
  tipoContrato: TipoContrato;
  autorizaDatosSalud: boolean;
  // Tipos con una afiliación vigente (sin fecha de fin).
  afiliacionesVigentes: readonly TipoEntidadSS[];
  tieneCertificadoAfiliacion: boolean;
}

export interface AlertaTrabajador {
  trabajadorId: string;
  nombre: string;
  documento: string;
  afiliacionesFaltantes: TipoEntidadSS[];
  sinCertificadoAfiliacion: boolean;
  sinAutorizacionSalud: boolean;
}

export interface ResumenAlertas {
  trabajadoresRevisados: number;
  conAlertas: number;
  sinAfiliacionCompleta: number;
  sinCertificadoAfiliacion: number;
  sinAutorizacionSalud: number;
}

// Solo se revisan los trabajadores activos que la empresa vincula: los retirados y quienes prestan servicios por su
// cuenta no generan alertas.
export function calcularAlertas(trabajadores: readonly TrabajadorParaAlertas[]): { resumen: ResumenAlertas; trabajadores: AlertaTrabajador[] } {
  const revisados = trabajadores.filter((t) => t.estado === EstadoTrabajador.ACTIVO && exigeAfiliaciones(t.tipoContrato));

  const alertas: AlertaTrabajador[] = [];
  for (const t of revisados) {
    const afiliacionesFaltantes = TIPOS_AFILIACION_REQUERIDOS.filter((tipo) => !t.afiliacionesVigentes.includes(tipo));
    const sinCertificadoAfiliacion = !t.tieneCertificadoAfiliacion;
    const sinAutorizacionSalud = !t.autorizaDatosSalud;
    if (afiliacionesFaltantes.length > 0 || sinCertificadoAfiliacion || sinAutorizacionSalud) {
      alertas.push({ trabajadorId: t.id, nombre: t.nombre, documento: t.documento, afiliacionesFaltantes, sinCertificadoAfiliacion, sinAutorizacionSalud });
    }
  }
  alertas.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return {
    resumen: {
      trabajadoresRevisados: revisados.length,
      conAlertas: alertas.length,
      sinAfiliacionCompleta: alertas.filter((a) => a.afiliacionesFaltantes.length > 0).length,
      sinCertificadoAfiliacion: alertas.filter((a) => a.sinCertificadoAfiliacion).length,
      sinAutorizacionSalud: alertas.filter((a) => a.sinAutorizacionSalud).length,
    },
    trabajadores: alertas,
  };
}
