import { PERMISOS, type Permiso } from '../auth/permisos.js';
import type { ClaveReporte } from './modelo.js';

// Catálogo de reportes: qué reportes hay y qué filtros acepta cada uno. La pantalla arma el formulario de filtros desde
// aquí, así que un reporte nuevo no necesita una pantalla nueva.

export type TipoFiltro = 'fecha' | 'proyecto' | 'medioPago' | 'cuenta' | 'usuario' | 'categoriaGasto' | 'estadoLote' | 'granularidad';

export interface FiltroDefinido {
  // Nombre del parámetro en la petición.
  clave: 'desde' | 'hasta' | 'proyectoId' | 'medioPago' | 'cuentaId' | 'usuarioId' | 'categoriaId' | 'estadoLote' | 'granularidad';
  etiqueta: string;
  tipo: TipoFiltro;
  obligatorio?: boolean;
}

export interface DefinicionReporte {
  clave: ClaveReporte;
  titulo: string;
  descripcion: string;
  filtros: FiltroDefinido[];
  // Permisos que se exigen además de reportes.ver (p. ej. las comisiones, que son sensibles).
  permisosExtra: Permiso[];
  // Muestra datos de toda la empresa que no pertenecen a un proyecto (nómina): no se ofrece a quien está limitado a proyectos.
  soloAlcanceTotal: boolean;
}

const DESDE: FiltroDefinido = { clave: 'desde', etiqueta: 'Desde', tipo: 'fecha' };
const HASTA: FiltroDefinido = { clave: 'hasta', etiqueta: 'Hasta', tipo: 'fecha' };
const PROYECTO: FiltroDefinido = { clave: 'proyectoId', etiqueta: 'Proyecto', tipo: 'proyecto' };

export const CATALOGO_REPORTES: DefinicionReporte[] = [
  {
    clave: 'recaudo',
    titulo: 'Recaudo',
    descripcion: 'Lo que pagaron los clientes (abonos vigentes), con totales por medio de pago, por cuenta y por usuario que lo registró.',
    filtros: [
      DESDE,
      HASTA,
      PROYECTO,
      { clave: 'medioPago', etiqueta: 'Medio de pago', tipo: 'medioPago' },
      { clave: 'cuentaId', etiqueta: 'Cuenta', tipo: 'cuenta' },
      { clave: 'usuarioId', etiqueta: 'Registrado por', tipo: 'usuario' },
    ],
    permisosExtra: [],
    soloAlcanceTotal: false,
  },
  {
    clave: 'cartera-edades',
    titulo: 'Cartera por edades de mora',
    descripcion: 'Lo que deben los clientes hoy, clasificado en por vencer y vencido a 1–30, 31–60, 61–90 y más de 90 días.',
    filtros: [PROYECTO],
    permisosExtra: [],
    soloAlcanceTotal: false,
  },
  {
    clave: 'egresos',
    titulo: 'Egresos por categoría y proyecto',
    descripcion: 'Lo gastado, por categoría, por proyecto y cruzando las dos. Incluye los pagos de nómina como categoría Nómina.',
    filtros: [DESDE, HASTA, PROYECTO, { clave: 'categoriaId', etiqueta: 'Categoría', tipo: 'categoriaGasto' }],
    permisosExtra: [],
    soloAlcanceTotal: false,
  },
  {
    clave: 'inventario-lotes',
    titulo: 'Inventario de lotes',
    descripcion: 'Cuántos lotes hay en cada estado (disponible, separado, vendido, escriturado, desistido) y su valor de lista.',
    filtros: [PROYECTO, { clave: 'estadoLote', etiqueta: 'Estado del lote', tipo: 'estadoLote' }],
    permisosExtra: [],
    soloAlcanceTotal: false,
  },
  {
    clave: 'flujo-caja',
    titulo: 'Flujo de caja',
    descripcion: 'Ingresos, egresos y saldo acumulado por día, semana, quincena o mes, de toda la empresa o de un proyecto.',
    filtros: [
      { ...DESDE, obligatorio: true },
      { ...HASTA, obligatorio: true },
      PROYECTO,
      { clave: 'granularidad', etiqueta: 'Agrupar por', tipo: 'granularidad', obligatorio: true },
    ],
    permisosExtra: [PERMISOS.FINANZAS_VER],
    soloAlcanceTotal: false,
  },
];

export function definicionDe(clave: string): DefinicionReporte | undefined {
  return CATALOGO_REPORTES.find((definicion) => definicion.clave === clave);
}
