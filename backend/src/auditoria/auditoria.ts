import type { Prisma } from '../generated/prisma/client.js';

// ---------------------------------------------------------------------------------------------
// Auditoría (RF-AUD-01 a 03). Cada servicio que cambia datos llama a registrarAuditoria DENTRO de la misma
// transacción de la acción: si la acción se revierte, su registro también, y si el registro no se puede guardar,
// la acción tampoco se guarda. La base de datos impide editar o borrar los registros (trigger).
// ---------------------------------------------------------------------------------------------

// Tipos de registro que se auditan. El texto es el que ve el gerente en la pantalla de auditoría.
export const ENTIDADES_AUDITORIA = {
  VENTA: 'Venta',
  LOTE: 'Lote',
  PROYECTO: 'Proyecto',
  CLIENTE: 'Cliente',
  ABONO: 'Abono',
  RECIBO: 'Recibo',
  MOVIMIENTO: 'Egreso o ingreso',
  NOMINA: 'Pago de nómina',
  TRABAJADOR: 'Trabajador',
  CIERRE_CAJA: 'Cierre de caja',
  CONFIGURACION: 'Configuración',
  USUARIO: 'Usuario',
  IMPORTACION: 'Importación de Excel',
  EXPORTACION: 'Exportación de datos',
  EQUIPO: 'Equipo de maquinaria',
  COMISION: 'Comisión de venta',
  PARAMETRO_LEGAL: 'Parámetros legales del año',
  ENTIDAD_SS: 'Entidad de seguridad social',
  CLASE_RIESGO_ARL: 'Clase de riesgo de la ARL',
} as const;

export type EntidadAuditoria = keyof typeof ENTIDADES_AUDITORIA;

// Acciones que se auditan y su texto en español.
export const ACCIONES_AUDITORIA = {
  VENTA_CREAR: 'Registró una venta',
  VENTA_APROBAR: 'Aprobó una venta con excepción',
  VENTA_RECHAZAR: 'Rechazó una venta con excepción',
  VENTA_DESISTIR: 'Registró un desistimiento',
  VENTA_DOCUMENTO_SUBIR: 'Adjuntó documentos firmados',
  LOTE_CREAR: 'Creó un lote',
  LOTE_EDITAR: 'Editó un lote',
  LOTE_CAMBIAR_PRECIO: 'Cambió el precio de un lote',
  LOTE_CAMBIAR_ESTADO: 'Cambió el estado de un lote',
  PROYECTO_CREAR: 'Creó un proyecto',
  PROYECTO_CAMBIAR_ESTADO: 'Cambió el estado de un proyecto',
  PROYECTO_CREAR_MANZANA: 'Creó una manzana',
  CLIENTE_CREAR: 'Creó un cliente',
  CLIENTE_EDITAR: 'Editó un cliente',
  ABONO_REGISTRAR: 'Registró un abono',
  ABONO_ANULAR: 'Anuló un abono',
  ABONO_VERIFICAR: 'Verificó un abono contra el extracto',
  RECIBO_EMITIR: 'Emitió un recibo de caja',
  RECIBO_ANULAR: 'Anuló un recibo de caja',
  MOVIMIENTO_REGISTRAR: 'Registró un egreso o ingreso',
  MOVIMIENTO_ANULAR: 'Anuló un egreso o ingreso',
  NOMINA_REGISTRAR_PAGO: 'Registró un pago de nómina',
  TRABAJADOR_CREAR: 'Creó un trabajador',
  TRABAJADOR_EDITAR: 'Editó un trabajador',
  TRABAJADOR_RETIRAR: 'Retiró a un trabajador',
  TRABAJADOR_REACTIVAR: 'Reactivó a un trabajador',
  TRABAJADOR_AUTORIZACION_SALUD: 'Registró o retiró la autorización de datos de salud de un trabajador',
  TRABAJADOR_AFILIACION_REGISTRAR: 'Registró una afiliación de seguridad social',
  TRABAJADOR_AFILIACION_CERRAR: 'Cerró una afiliación de seguridad social',
  TRABAJADOR_DOCUMENTO_SUBIR: 'Adjuntó un documento a un trabajador',
  CIERRE_CREAR: 'Generó un cierre de caja',
  CIERRE_CERRAR: 'Cerró la caja',
  CIERRE_APROBAR: 'Aprobó un cierre de caja',
  CIERRE_DEVOLVER: 'Devolvió un cierre de caja',
  CIERRE_DESCARTAR: 'Descartó un borrador de cierre de caja',
  CONFIGURACION_EMPRESA: 'Cambió los datos de la empresa',
  CONFIGURACION_PARAMETROS: 'Cambió los parámetros del negocio',
  CONFIGURACION_LOGO: 'Cambió el logo',
  CONFIGURACION_CUENTA: 'Cambió una cuenta de recaudo',
  CONFIGURACION_MEDIO_PAGO: 'Cambió un medio de pago',
  CONFIGURACION_CATEGORIA: 'Cambió una categoría',
  CONFIGURACION_COMISION: 'Cambió una comisión',
  USUARIO_CREAR: 'Creó un usuario',
  USUARIO_EDITAR: 'Editó un usuario',
  USUARIO_CAMBIAR_ESTADO: 'Activó o desactivó un usuario',
  USUARIO_RESTABLECER_PASSWORD: 'Restableció la contraseña de un usuario',
  USUARIO_RECUPERAR_PASSWORD: 'Recuperó su contraseña con el enlace del correo',
  USUARIO_DESBLOQUEAR: 'Desbloqueó un usuario',
  IMPORTACION_EJECUTAR: 'Importó datos desde Excel',
  EXPORTACION_COMPLETA: 'Exportó todos los datos a Excel',
  EQUIPO_CREAR: 'Registró un equipo',
  EQUIPO_EDITAR: 'Editó un equipo',
  EQUIPO_BAJA: 'Dio de baja un equipo',
  EQUIPO_REACTIVAR: 'Reactivó un equipo',
  CONFIGURACION_TIPO_EQUIPO: 'Cambió un tipo de equipo',
  COMISION_GENERAR: 'Generó la comisión de una venta',
  COMISION_PAGAR: 'Pagó una comisión',
  COMISION_ANULAR: 'Anuló una comisión',
  PARAMETRO_LEGAL_CREAR: 'Creó los parámetros legales de un año',
  PARAMETRO_LEGAL_EDITAR: 'Cambió los parámetros legales de un año',
  PARAMETRO_LEGAL_VALIDAR: 'Validó los parámetros legales de un año',
  ENTIDAD_SS_CREAR: 'Creó una entidad de seguridad social',
  ENTIDAD_SS_EDITAR: 'Cambió una entidad de seguridad social',
  CLASE_RIESGO_ARL_EDITAR: 'Cambió una clase de riesgo de la ARL',
} as const;

export type AccionAuditoria = keyof typeof ACCIONES_AUDITORIA;

// Campos que NUNCA se guardan en la auditoría, sin importar quién los pase.
const CAMPOS_PROHIBIDOS = new Set(['password', 'passwordhash', 'token', 'accesstoken', 'secret', 'contenido']);

export interface ActorAuditoria {
  id: string;
  nombre: string;
  email: string;
}

export interface EventoAuditoria {
  usuario: ActorAuditoria;
  accion: AccionAuditoria;
  entidad: EntidadAuditoria;
  entidadId?: string | null;
  resumen: string;
  antes?: unknown;
  despues?: unknown;
}

// Convierte lo que pase el servicio (filas de Prisma con Decimal y Date, objetos anidados) en JSON simple y le
// quita los campos prohibidos en cualquier nivel.
export function sanitizarParaAuditoria(valor: unknown): Prisma.InputJsonValue | undefined {
  if (valor === undefined || valor === null) return undefined;
  const texto = JSON.stringify(valor, (clave, contenido: unknown) => (CAMPOS_PROHIBIDOS.has(clave.toLowerCase()) ? undefined : contenido));
  if (texto === undefined) return undefined;
  return JSON.parse(texto) as Prisma.InputJsonValue;
}

// Deja solo los campos indicados de un objeto (para auditar lo relevante y no la fila entera).
export function soloCampos<T extends object>(objeto: T | null | undefined, campos: readonly (keyof T)[]): Partial<T> | undefined {
  if (!objeto) return undefined;
  const resultado: Partial<T> = {};
  for (const campo of campos) {
    resultado[campo] = objeto[campo];
  }
  return resultado;
}

// Cliente de base de datos mínimo que necesita la auditoría (sirve tanto la transacción como PrismaService).
type ClienteAuditoria = { registroAuditoria: Pick<Prisma.TransactionClient['registroAuditoria'], 'create'> };

export async function registrarAuditoria(db: ClienteAuditoria, evento: EventoAuditoria): Promise<void> {
  await db.registroAuditoria.create({
    data: {
      usuarioId: evento.usuario.id,
      usuarioNombre: evento.usuario.nombre,
      usuarioEmail: evento.usuario.email,
      accion: evento.accion,
      entidad: evento.entidad,
      entidadId: evento.entidadId ?? null,
      resumen: evento.resumen,
      antes: sanitizarParaAuditoria(evento.antes),
      despues: sanitizarParaAuditoria(evento.despues),
    },
  });
}
