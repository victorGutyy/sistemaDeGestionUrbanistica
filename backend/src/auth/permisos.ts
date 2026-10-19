// Catálogo de permisos del sistema: la lista COMPLETA de cosas que se pueden
// autorizar. Cada endpoint exige uno (decorador @Permiso) y cada rol (tabla
// RolUsuario) guarda cuáles tiene. Agregar un rol nuevo no requiere tocar los
// módulos; agregar una capacidad nueva sí: se suma aquí y se exige en el endpoint.
//
// Nombre: "<módulo>.<acción>".
export const PERMISOS = {
  PROYECTOS_VER: 'proyectos.ver',
  PROYECTOS_GESTIONAR: 'proyectos.gestionar', // crear proyectos y lotes
  PROYECTOS_CAMBIAR_ESTADO: 'proyectos.cambiar_estado', // finalizar / reactivar
  CLIENTES_VER: 'clientes.ver',
  CLIENTES_CREAR: 'clientes.crear',
  VENTAS_VER: 'ventas.ver',
  VENTAS_CREAR: 'ventas.crear',
  VENTAS_AUTORIZAR: 'ventas.autorizar', // aprobar o rechazar ventas con excepción
  VENTAS_DESISTIR: 'ventas.desistir', // registrar el desistimiento de una venta
  ABONOS_VER: 'abonos.ver',
  ABONOS_REGISTRAR: 'abonos.registrar',
  ABONOS_ANULAR: 'abonos.anular', // anular un abono y su recibo (solo gerente)
  CARTERA_VER: 'cartera.ver',
  CAJA_VER: 'caja.ver', // ver los cierres de caja
  CAJA_CERRAR: 'caja.cerrar', // generar y cerrar cierres de caja
  CAJA_APROBAR: 'caja.aprobar', // aprobar o devolver un cierre (solo gerente)
  FINANZAS_VER: 'finanzas.ver',
  FINANZAS_REGISTRAR: 'finanzas.registrar',
  FINANZAS_ANULAR: 'finanzas.anular', // anular un egreso o ingreso (solo gerente)
  NOMINA_VER: 'nomina.ver',
  NOMINA_GESTIONAR: 'nomina.gestionar', // trabajadores y pagos
  DASHBOARD_VER: 'dashboard.ver',
  RECORDATORIOS_EJECUTAR: 'recordatorios.ejecutar',
  CONFIGURACION_VER: 'configuracion.ver',
  CONFIGURACION_EDITAR: 'configuracion.editar',
  USUARIOS_GESTIONAR: 'usuarios.gestionar',
  AUDITORIA_VER: 'auditoria.ver', // consultar la auditoría (solo gerente)
} as const;

export type Permiso = (typeof PERMISOS)[keyof typeof PERMISOS];

export const TODOS_LOS_PERMISOS: Permiso[] = Object.values(PERMISOS);

export function esPermisoValido(valor: string): valor is Permiso {
  return (TODOS_LOS_PERMISOS as string[]).includes(valor);
}

export interface DefinicionRolSistema {
  clave: string;
  nombre: string;
  descripcion: string;
  permisos: Permiso[];
  limitablePorProyecto: boolean;
}

export const CLAVE_GERENTE = 'GERENTE';

// Roles que trae el sistema. Su lista de permisos se sincroniza desde aquí al
// arrancar la app (RolesService.onModuleInit): si mañana se agrega un permiso
// nuevo, el gerente lo recibe sin migración. Los roles que el gerente cree a
// futuro (p. ej. jurídico) viven solo en la base de datos.
export const ROLES_SISTEMA: DefinicionRolSistema[] = [
  {
    clave: CLAVE_GERENTE,
    nombre: 'Gerente',
    descripcion: 'Control total: configuración, usuarios, aprobaciones y auditoría.',
    permisos: TODOS_LOS_PERMISOS,
    limitablePorProyecto: false,
  },
  {
    clave: 'ADMINISTRADOR',
    nombre: 'Administrador',
    descripcion: 'Operación diaria: ventas, abonos, egresos y personal. Ve todos los proyectos.',
    permisos: TODOS_LOS_PERMISOS.filter(
      (permiso) =>
        permiso !== PERMISOS.CONFIGURACION_EDITAR &&
        permiso !== PERMISOS.USUARIOS_GESTIONAR &&
        permiso !== PERMISOS.VENTAS_AUTORIZAR &&
        permiso !== PERMISOS.VENTAS_DESISTIR &&
        permiso !== PERMISOS.ABONOS_ANULAR &&
        permiso !== PERMISOS.FINANZAS_ANULAR &&
        permiso !== PERMISOS.CAJA_APROBAR &&
        permiso !== PERMISOS.AUDITORIA_VER &&
        permiso !== PERMISOS.PROYECTOS_CAMBIAR_ESTADO,
    ),
    limitablePorProyecto: false,
  },
  {
    clave: 'CONSULTA',
    nombre: 'Consulta',
    descripcion: 'Solo lectura de los datos de proyectos. No ve nómina ni configuración.',
    permisos: [
      PERMISOS.PROYECTOS_VER,
      PERMISOS.CLIENTES_VER,
      PERMISOS.VENTAS_VER,
      PERMISOS.ABONOS_VER,
      PERMISOS.CARTERA_VER,
      PERMISOS.FINANZAS_VER,
      PERMISOS.DASHBOARD_VER,
    ],
    limitablePorProyecto: true,
  },
];
