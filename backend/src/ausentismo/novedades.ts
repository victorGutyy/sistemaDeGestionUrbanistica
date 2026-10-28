import type { Prisma } from '../generated/prisma/client.js';
import type { ColumnaReporte, FilaReporte, ReporteGenerado } from '../reportes/modelo.js';

// Novedades de ausentismo para la nómina (RF-SST-11): por cada ausentismo vigente con días en el mes, el documento, el tipo,
// los días y los valores de cada pagador. La nómina la lleva la empresa fuera del sistema: esto es lo que se le entrega.
// Nunca lleva diagnósticos ni observaciones (RNF-SEG-08): solo el tipo de ausentismo, que no es un dato de salud.

export interface PeriodoParaNovedades {
  anio: number;
  mes: number;
  dias: number;
  diasEmpleador: number;
  diasEps: number;
  diasArl: number;
  diasAfp: number;
  diasLaborados: number;
  diasDescuento: number;
  valorEmpleador: Prisma.Decimal;
  valorEps: Prisma.Decimal;
  valorArl: Prisma.Decimal;
  valorAfp: Prisma.Decimal;
  valorDescuento: Prisma.Decimal;
  ausentismo: {
    id: string;
    numeroDocumento: string | null;
    fechaInicio: Date;
    fechaFin: Date;
    esProrroga: boolean;
    corregida: boolean;
    trabajador: { nombre: string; documento: string; cargo: string };
    tipo: { nombre: string };
  };
}

const aISO = (fecha: Date) => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;

export const COLUMNAS_NOVEDADES: ColumnaReporte[] = [
  { clave: 'documentoTrabajador', encabezado: 'Documento del trabajador', tipo: 'texto', peso: 1.3 },
  { clave: 'trabajador', encabezado: 'Trabajador', tipo: 'texto', peso: 2 },
  { clave: 'numeroDocumento', encabezado: 'N.º de incapacidad o certificado', tipo: 'texto', peso: 1.4 },
  { clave: 'tipo', encabezado: 'Tipo', tipo: 'texto', peso: 1.8 },
  { clave: 'desde', encabezado: 'Desde', tipo: 'fecha' },
  { clave: 'hasta', encabezado: 'Hasta', tipo: 'fecha' },
  { clave: 'dias', encabezado: 'Días del mes', tipo: 'entero' },
  { clave: 'diasEmpleador', encabezado: 'Días empleador', tipo: 'entero' },
  { clave: 'diasEps', encabezado: 'Días EPS', tipo: 'entero' },
  { clave: 'diasArl', encabezado: 'Días ARL', tipo: 'entero' },
  { clave: 'diasAfp', encabezado: 'Días AFP', tipo: 'entero' },
  { clave: 'diasLaborados', encabezado: 'Días pagados como laborados', tipo: 'entero' },
  { clave: 'diasDescuento', encabezado: 'Días a descontar', tipo: 'entero' },
  { clave: 'valorEmpleador', encabezado: 'A cargo del empleador', tipo: 'pesos' },
  { clave: 'valorEps', encabezado: 'A cargo de la EPS', tipo: 'pesos' },
  { clave: 'valorArl', encabezado: 'A cargo de la ARL', tipo: 'pesos' },
  { clave: 'valorAfp', encabezado: 'A cargo de la AFP', tipo: 'pesos' },
  { clave: 'valorDescuento', encabezado: 'A descontar', tipo: 'pesos' },
  { clave: 'observacion', encabezado: 'Observación', tipo: 'texto', peso: 1.6 },
];

const CAMPOS_ENTEROS = ['dias', 'diasEmpleador', 'diasEps', 'diasArl', 'diasAfp', 'diasLaborados', 'diasDescuento'] as const;
const CAMPOS_PESOS = ['valorEmpleador', 'valorEps', 'valorArl', 'valorAfp', 'valorDescuento'] as const;

function observacionDe(p: PeriodoParaNovedades): string {
  return [p.ausentismo.esProrroga ? 'Prórroga' : null, p.ausentismo.corregida ? 'Liquidación corregida a mano' : null].filter(Boolean).join('. ');
}

// Una fila por ausentismo y mes, ordenadas por trabajador y por fecha de inicio.
export function filasDeNovedades(periodos: readonly PeriodoParaNovedades[]): FilaReporte[] {
  return [...periodos]
    .sort((a, b) => a.ausentismo.trabajador.nombre.localeCompare(b.ausentismo.trabajador.nombre, 'es') || a.ausentismo.fechaInicio.getTime() - b.ausentismo.fechaInicio.getTime())
    .map((p) => ({
      documentoTrabajador: p.ausentismo.trabajador.documento,
      trabajador: p.ausentismo.trabajador.nombre,
      numeroDocumento: p.ausentismo.numeroDocumento,
      tipo: p.ausentismo.tipo.nombre,
      desde: aISO(p.ausentismo.fechaInicio),
      hasta: aISO(p.ausentismo.fechaFin),
      dias: p.dias,
      diasEmpleador: p.diasEmpleador,
      diasEps: p.diasEps,
      diasArl: p.diasArl,
      diasAfp: p.diasAfp,
      diasLaborados: p.diasLaborados,
      diasDescuento: p.diasDescuento,
      valorEmpleador: p.valorEmpleador.toString(),
      valorEps: p.valorEps.toString(),
      valorArl: p.valorArl.toString(),
      valorAfp: p.valorAfp.toString(),
      valorDescuento: p.valorDescuento.toString(),
      observacion: observacionDe(p) || null,
    }));
}

// La fila de totales: suma de los días y los valores de todas las filas.
export function totalesDeNovedades(filas: readonly FilaReporte[]): FilaReporte {
  const totales: FilaReporte = { trabajador: 'Total' };
  for (const campo of CAMPOS_ENTEROS) {
    totales[campo] = filas.reduce((suma, fila) => suma + Number(fila[campo] ?? 0), 0);
  }
  for (const campo of CAMPOS_PESOS) {
    totales[campo] = String(filas.reduce((suma, fila) => suma + Number(fila[campo] ?? 0), 0));
  }
  return totales;
}

const NOMBRE_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function reporteDeNovedades(anio: number, mes: number, periodos: readonly PeriodoParaNovedades[], generadoEn: Date): ReporteGenerado {
  const filas = filasDeNovedades(periodos);
  return {
    clave: 'ausentismo-novedades',
    titulo: `Novedades de ausentismo para la nómina · ${NOMBRE_MES[mes - 1]} de ${anio}`,
    descripcion: 'Incapacidades y licencias con días en el mes, con los días y los valores de cada pagador. Es una liquidación de apoyo: la nómina se liquida fuera del sistema.',
    filtros: [
      { etiqueta: 'Mes', valor: `${NOMBRE_MES[mes - 1]} de ${anio}` },
      { etiqueta: 'Estado', valor: 'Ausentismos vigentes (sin anulados)' },
    ],
    generadoEn: generadoEn.toISOString(),
    secciones: [
      {
        titulo: 'Novedades',
        nota: 'Los valores a cargo de la EPS, la ARL y la AFP son lo que esas entidades reconocen, no lo que paga la empresa.',
        columnas: COLUMNAS_NOVEDADES,
        filas,
        totales: filas.length > 0 ? totalesDeNovedades(filas) : undefined,
      },
    ],
  };
}
