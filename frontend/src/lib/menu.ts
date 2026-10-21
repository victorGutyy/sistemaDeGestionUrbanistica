import { Banknote, Building2, FileBarChart, HandCoins, Calculator, FileSpreadsheet, FileText, History, Receipt, UserRound, LayoutDashboard, Settings, Shield, Users, Wallet, type LucideIcon } from 'lucide-react'
import { PERMISOS } from './permisos'

export interface ItemMenu {
  to: string
  label: string
  icon: LucideIcon
  // Permiso que el rol debe tener para ver esta opción.
  permiso: string
  // Datos de la empresa que no pertenecen a un proyecto: no se muestran a quien está limitado a ciertos proyectos.
  soloAlcanceTotal?: boolean
}

// El orden es el del menú; la primera opción permitida es también la pantalla de inicio.
export const ITEMS_MENU: ItemMenu[] = [
  { to: '/dashboard', label: 'Panel general', icon: LayoutDashboard, permiso: PERMISOS.DASHBOARD_VER },
  { to: '/proyectos', label: 'Proyectos', icon: Building2, permiso: PERMISOS.PROYECTOS_VER },
  { to: '/ventas', label: 'Ventas', icon: FileText, permiso: PERMISOS.VENTAS_VER },
  { to: '/clientes', label: 'Clientes', icon: UserRound, permiso: PERMISOS.CLIENTES_VER },
  { to: '/recibos', label: 'Recibos', icon: Receipt, permiso: PERMISOS.ABONOS_VER },
  { to: '/caja', label: 'Caja', icon: Banknote, permiso: PERMISOS.CAJA_VER, soloAlcanceTotal: true },
  { to: '/cartera', label: 'Cartera', icon: Wallet, permiso: PERMISOS.CARTERA_VER },
  { to: '/finanzas', label: 'Finanzas', icon: Calculator, permiso: PERMISOS.FINANZAS_VER },
  { to: '/comisiones', label: 'Comisiones', icon: HandCoins, permiso: PERMISOS.COMISIONES_VER },
  { to: '/reportes', label: 'Reportes', icon: FileBarChart, permiso: PERMISOS.REPORTES_VER },
  { to: '/nomina', label: 'Nómina', icon: Users, permiso: PERMISOS.NOMINA_VER, soloAlcanceTotal: true },
  { to: '/auditoria', label: 'Auditoría', icon: History, permiso: PERMISOS.AUDITORIA_VER, soloAlcanceTotal: true },
  { to: '/importacion', label: 'Importar Excel', icon: FileSpreadsheet, permiso: PERMISOS.IMPORTACION_GESTIONAR, soloAlcanceTotal: true },
  { to: '/usuarios', label: 'Usuarios', icon: Shield, permiso: PERMISOS.USUARIOS_GESTIONAR, soloAlcanceTotal: true },
  { to: '/configuracion', label: 'Configuración', icon: Settings, permiso: PERMISOS.CONFIGURACION_EDITAR, soloAlcanceTotal: true },
]
