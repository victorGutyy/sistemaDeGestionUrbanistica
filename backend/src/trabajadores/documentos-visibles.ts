import { PERMISOS } from '../auth/permisos.js';
import { TipoDocumentoTrabajador } from '../generated/prisma/enums.js';

// Qué documentos de un trabajador puede ver y subir cada usuario (RF-PER-06, RNF-SEG-05). Los de seguridad social los
// maneja el módulo SST; el contrato y los demás son de recursos humanos y no se le muestran al contratista SST.

const TIPOS_DE_SST: readonly TipoDocumentoTrabajador[] = [TipoDocumentoTrabajador.CERTIFICADO_AFILIACION, TipoDocumentoTrabajador.AUTORIZACION_DATOS];

export function tiposDocumentoVisibles(permisos: readonly string[]): readonly TipoDocumentoTrabajador[] {
  return permisos.includes(PERMISOS.NOMINA_VER) ? Object.values(TipoDocumentoTrabajador) : TIPOS_DE_SST;
}

export function puedeSubirTipoDocumento(tipo: TipoDocumentoTrabajador, permisos: readonly string[]): boolean {
  return TIPOS_DE_SST.includes(tipo) ? permisos.includes(PERMISOS.SST_GESTIONAR) : permisos.includes(PERMISOS.NOMINA_GESTIONAR);
}
