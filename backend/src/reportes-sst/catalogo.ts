import type { ClaveReporteGenerado } from '../reportes/modelo.js';

// Catálogo de los reportes de seguridad y salud en el trabajo (RF-SST-22): qué reportes hay y qué filtros acepta cada uno. La
// pantalla arma el formulario de filtros desde aquí, así que un reporte nuevo no necesita una pantalla nueva.

export type ClaveReporteSst = Extract<ClaveReporteGenerado, `sst-${string}`>;

export type TipoFiltroSst = 'anio' | 'mes' | 'fecha' | 'trabajador' | 'tipoAusentismo' | 'estadoRegistro' | 'estadoActividad';

export interface FiltroSstDefinido {
  // Nombre del parámetro en la petición.
  clave: 'anio' | 'mes' | 'desde' | 'hasta' | 'trabajadorId' | 'tipoId' | 'estado';
  etiqueta: string;
  tipo: TipoFiltroSst;
}

export interface DefinicionReporteSst {
  clave: ClaveReporteSst;
  titulo: string;
  descripcion: string;
  filtros: FiltroSstDefinido[];
}

export const ESTADOS_DE_REGISTRO = ['VIGENTES', 'ANULADOS', 'TODOS'] as const;
export type EstadoDeRegistro = (typeof ESTADOS_DE_REGISTRO)[number];

export const OPCIONES_ESTADO_REGISTRO: { valor: EstadoDeRegistro; etiqueta: string }[] = [
  { valor: 'VIGENTES', etiqueta: 'Vigentes' },
  { valor: 'ANULADOS', etiqueta: 'Anulados' },
  { valor: 'TODOS', etiqueta: 'Todos' },
];

export const OPCIONES_ESTADO_ACTIVIDAD: { valor: string; etiqueta: string }[] = [
  { valor: 'PROGRAMADA', etiqueta: 'Programada' },
  { valor: 'EN_EJECUCION', etiqueta: 'En ejecución' },
  { valor: 'EJECUTADA', etiqueta: 'Ejecutada' },
  { valor: 'REPROGRAMADA', etiqueta: 'Reprogramada' },
  { valor: 'CANCELADA', etiqueta: 'Cancelada' },
];

const ANIO: FiltroSstDefinido = { clave: 'anio', etiqueta: 'Año', tipo: 'anio' };
const TRABAJADOR: FiltroSstDefinido = { clave: 'trabajadorId', etiqueta: 'Trabajador', tipo: 'trabajador' };
const ESTADO_ACTIVIDAD: FiltroSstDefinido = { clave: 'estado', etiqueta: 'Estado', tipo: 'estadoActividad' };

export const CATALOGO_REPORTES_SST: DefinicionReporteSst[] = [
  {
    clave: 'sst-ausentismo-resumen',
    titulo: 'Ausentismo: resumen mensual',
    descripcion: 'Por mes del año: registros, días de ausentismo por quién los paga, trabajadores activos y porcentaje de ausentismo, y los días por tipo.',
    filtros: [ANIO],
  },
  {
    clave: 'sst-ausentismo-detalle',
    titulo: 'Ausentismo: detalle por registro',
    descripcion: 'Cada incapacidad o licencia con sus días por quién los paga. No incluye diagnósticos ni observaciones.',
    filtros: [ANIO, { clave: 'mes', etiqueta: 'Mes', tipo: 'mes' }, TRABAJADOR, { clave: 'tipoId', etiqueta: 'Tipo de ausentismo', tipo: 'tipoAusentismo' }, { clave: 'estado', etiqueta: 'Estado', tipo: 'estadoRegistro' }],
  },
  {
    clave: 'sst-epp',
    titulo: 'EPP: entregados y por reponer',
    descripcion: 'Las entregas de elementos de protección del período y los elementos que están por reponer o vencidos.',
    filtros: [
      { clave: 'desde', etiqueta: 'Desde', tipo: 'fecha' },
      { clave: 'hasta', etiqueta: 'Hasta', tipo: 'fecha' },
      TRABAJADOR,
    ],
  },
  {
    clave: 'sst-plan',
    titulo: 'Plan de trabajo anual',
    descripcion: 'Las actividades del plan del año con su responsable, fechas, estado y porcentaje de avance, y el cumplimiento del plan.',
    filtros: [ANIO, ESTADO_ACTIVIDAD],
  },
  {
    clave: 'sst-capacitaciones',
    titulo: 'Capacitaciones y su cobertura',
    descripcion: 'Las capacitaciones del año con sus asistentes reales frente a los programados y el porcentaje de cobertura.',
    filtros: [ANIO, ESTADO_ACTIVIDAD],
  },
];

export function definicionSstDe(clave: string): DefinicionReporteSst | undefined {
  return CATALOGO_REPORTES_SST.find((definicion) => definicion.clave === clave);
}
