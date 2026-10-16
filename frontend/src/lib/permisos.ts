// Permisos que entiende el servidor (espejo de backend/src/auth/permisos.ts).
// La pantalla solo los usa para mostrar u ocultar botones y menús; quien
// realmente decide es el servidor en cada petición.
export const PERMISOS = {
  PROYECTOS_VER: 'proyectos.ver',
  PROYECTOS_GESTIONAR: 'proyectos.gestionar',
  PROYECTOS_CAMBIAR_ESTADO: 'proyectos.cambiar_estado',
  CLIENTES_VER: 'clientes.ver',
  CLIENTES_CREAR: 'clientes.crear',
  VENTAS_VER: 'ventas.ver',
  VENTAS_CREAR: 'ventas.crear',
  VENTAS_AUTORIZAR: 'ventas.autorizar',
  VENTAS_DESISTIR: 'ventas.desistir',
  ABONOS_VER: 'abonos.ver',
  ABONOS_REGISTRAR: 'abonos.registrar',
  CARTERA_VER: 'cartera.ver',
  FINANZAS_VER: 'finanzas.ver',
  FINANZAS_REGISTRAR: 'finanzas.registrar',
  NOMINA_VER: 'nomina.ver',
  NOMINA_GESTIONAR: 'nomina.gestionar',
  DASHBOARD_VER: 'dashboard.ver',
  RECORDATORIOS_EJECUTAR: 'recordatorios.ejecutar',
  CONFIGURACION_VER: 'configuracion.ver',
  CONFIGURACION_EDITAR: 'configuracion.editar',
  USUARIOS_GESTIONAR: 'usuarios.gestionar',
} as const

export type Permiso = (typeof PERMISOS)[keyof typeof PERMISOS]
