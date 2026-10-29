import type { TotalesLiquidacion } from '../ausentismo/liquidacion.js';
import type { ResumenMensual } from '../ausentismo/resumen.js';
import { Prisma } from '../generated/prisma/client.js';
import type { EstadoActividadSst } from '../generated/prisma/enums.js';
import type { ColumnaReporte, FilaReporte, SeccionReporte } from '../reportes/modelo.js';
import { pesos, recortarDetalle } from '../reportes/modelo.js';
import type { EstadoAlerta, ResumenPlan } from '../sst/plan.js';

// Los reportes de seguridad y salud en el trabajo (RF-SST-22). Cada función recibe datos ya consultados y devuelve las
// secciones del modelo común de reportes (la pantalla, el PDF y el Excel las dibujan igual). Son funciones puras.
//
// Lo que NUNCA lleva ningún reporte, para ningún rol (RNF-SEG-08): el diagnóstico, las observaciones ni los certificados de
// un ausentismo. Los valores en pesos del ausentismo salen solo cuando `verValores` es verdadero: si no, las columnas ni
// existen en el reporte.

const aISO = (fecha: Date) => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;

// Un porcentaje como texto con coma decimal ("66,7 %"); sin dato, vacío.
export function textoPorcentaje(valor: number | string | null | undefined): string | null {
  if (valor === null || valor === undefined || valor === '') return null;
  return `${String(valor).replace('.', ',')} %`;
}

const NOMBRES_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const nombreDelMes = (mes: number) => NOMBRES_MES[mes - 1] ?? String(mes);

const ETIQUETA_MOTIVO_EPP: Record<string, string> = {
  DOTACION_INICIAL: 'Dotación inicial',
  REPOSICION_VIDA_UTIL: 'Reposición por vida útil',
  REPOSICION_DANO: 'Reposición por daño o deterioro',
  PERDIDA: 'Pérdida',
  CAMBIO_CARGO: 'Cambio de cargo',
};

const ETIQUETA_ESTADO_REPOSICION: Record<string, string> = { VIGENTE: 'Vigente', POR_REPONER: 'Por reponer', VENCIDO: 'Vencido' };

const ETIQUETA_ESTADO_ACTIVIDAD: Record<string, string> = {
  PROGRAMADA: 'Programada',
  EN_EJECUCION: 'En ejecución',
  EJECUTADA: 'Ejecutada',
  REPROGRAMADA: 'Reprogramada',
  CANCELADA: 'Cancelada',
};

const ETIQUETA_CICLO: Record<string, string> = { PLANEAR: 'Planear', HACER: 'Hacer', VERIFICAR: 'Verificar', ACTUAR: 'Actuar' };
const ETIQUETA_MODALIDAD: Record<string, string> = { PRESENCIAL: 'Presencial', VIRTUAL: 'Virtual', MIXTA: 'Mixta' };
const ETIQUETA_EJECUTOR: Record<string, string> = { INTERNO: 'Interno', ARL: 'ARL', EXTERNO: 'Externo' };
const ETIQUETA_ALERTA: Record<EstadoAlerta, string> = { AL_DIA: '', PROXIMA: 'Próxima', VENCIDA: 'Vencida', SIN_ALERTA: '' };

// ---------- Ausentismo: resumen mensual ----------

// Los valores van en una tabla aparte de los días: así cada una cabe en el papel y los pesos nunca se recortan. Los anchos
// (peso) están pensados para una hoja A4 horizontal.
const CLAVES_DIAS_POR_PAGADOR = ['diasEmpleador', 'diasEps', 'diasArl', 'diasAfp', 'diasLaborados', 'diasDescuento'] as const;

const COLUMNAS_VALORES: ColumnaReporte[] = [
  { clave: 'valorEmpleador', encabezado: 'Empleador', tipo: 'pesos', peso: 1.5 },
  { clave: 'valorEps', encabezado: 'EPS', tipo: 'pesos', peso: 1.5 },
  { clave: 'valorArl', encabezado: 'ARL', tipo: 'pesos', peso: 1.5 },
  { clave: 'valorAfp', encabezado: 'AFP', tipo: 'pesos', peso: 1.5 },
  { clave: 'valorDescuento', encabezado: 'A descontar', tipo: 'pesos', peso: 1.5 },
];

type FilaDelResumen = ResumenMensual['total'];

function filaDeResumen(etiqueta: string, fila: FilaDelResumen): FilaReporte {
  return {
    mes: etiqueta,
    registros: fila.registros,
    dias: fila.dias,
    diasEmpleador: fila.diasPorPagador.empleador,
    diasEps: fila.diasPorPagador.eps,
    diasArl: fila.diasPorPagador.arl,
    diasAfp: fila.diasPorPagador.afp,
    diasLaborados: fila.diasPorPagador.laborados,
    diasDescuento: fila.diasPorPagador.descuento,
    trabajadoresActivos: fila.trabajadoresActivos,
    porcentaje: textoPorcentaje(fila.porcentajeAusentismo),
  };
}

function filaDeValoresDelResumen(etiqueta: string, fila: FilaDelResumen): FilaReporte {
  return {
    mes: etiqueta,
    valorEmpleador: fila.valores?.empleador ?? '0',
    valorEps: fila.valores?.eps ?? '0',
    valorArl: fila.valores?.arl ?? '0',
    valorAfp: fila.valores?.afp ?? '0',
    valorDescuento: fila.valores?.descuento ?? '0',
  };
}

// El resumen que llega ya viene filtrado por rol (presentarResumen); `verValores` solo decide si el reporte tiene la tabla de valores.
export function seccionesResumenAusentismo(resumen: ResumenMensual, verValores: boolean): SeccionReporte[] {
  const porTipo = [...resumen.total.porTipo].sort((a, b) => b.dias - a.dias || a.nombre.localeCompare(b.nombre, 'es'));
  const secciones: SeccionReporte[] = [
    {
      titulo: `Resumen mensual ${resumen.anio}`,
      nota: 'Un ausentismo que cruza de mes cuenta en cada mes que toca, con los días de ese mes. Los días por quién los paga son los del empleador, la EPS, la ARL y la AFP; "Laborados" son los pagados como laborados. Activos: trabajadores activos del mes. El porcentaje es días de ausentismo ÷ (trabajadores activos × días del período).',
      columnas: [
        { clave: 'mes', encabezado: 'Mes', tipo: 'texto', peso: 1.6 },
        { clave: 'registros', encabezado: 'Registros', tipo: 'entero', peso: 1.1 },
        { clave: 'dias', encabezado: 'Días totales', tipo: 'entero', peso: 1.1 },
        { clave: 'diasEmpleador', encabezado: 'Empleador', tipo: 'entero' },
        { clave: 'diasEps', encabezado: 'EPS', tipo: 'entero', peso: 0.8 },
        { clave: 'diasArl', encabezado: 'ARL', tipo: 'entero', peso: 0.8 },
        { clave: 'diasAfp', encabezado: 'AFP', tipo: 'entero', peso: 0.8 },
        { clave: 'diasLaborados', encabezado: 'Laborados', tipo: 'entero' },
        { clave: 'diasDescuento', encabezado: 'A descontar', tipo: 'entero', peso: 1.1 },
        { clave: 'trabajadoresActivos', encabezado: 'Activos', tipo: 'entero', peso: 0.9 },
        { clave: 'porcentaje', encabezado: '% ausentismo', tipo: 'texto', peso: 1.2, alineacion: 'derecha' },
      ],
      filas: resumen.meses.map((m) => filaDeResumen(nombreDelMes(m.mes), m)),
      totales: filaDeResumen('Total del año', resumen.total),
    },
  ];
  if (verValores) {
    secciones.push({
      titulo: 'Valores por mes',
      nota: 'Cada columna es lo que corresponde a ese pagador (empleador, EPS, ARL o AFP) y lo que se descuenta. Es una liquidación de apoyo: la nómina se liquida fuera del sistema. Lo que reconocen la EPS, la ARL y la AFP no lo paga la empresa.',
      columnas: [{ clave: 'mes', encabezado: 'Mes', tipo: 'texto', peso: 1.6 }, ...COLUMNAS_VALORES],
      filas: resumen.meses.map((m) => filaDeValoresDelResumen(nombreDelMes(m.mes), m)),
      totales: filaDeValoresDelResumen('Total del año', resumen.total),
    });
  }
  secciones.push({
    titulo: 'Por tipo de ausentismo',
    columnas: [
      { clave: 'tipo', encabezado: 'Tipo', tipo: 'texto', peso: 3 },
      { clave: 'registros', encabezado: 'Registros', tipo: 'entero' },
      { clave: 'dias', encabezado: 'Días', tipo: 'entero' },
    ],
    filas: porTipo.map((t) => ({ tipo: t.nombre, registros: t.registros, dias: t.dias })),
    totales: porTipo.length > 0 ? { tipo: 'Total', registros: porTipo.reduce((s, t) => s + t.registros, 0), dias: porTipo.reduce((s, t) => s + t.dias, 0) } : undefined,
  });
  return secciones;
}

// ---------- Ausentismo: detalle por registro ----------

export interface AusentismoParaDetalle {
  id: string;
  numeroDocumento: string | null;
  esProrroga: boolean;
  corregida: boolean;
  anulada: boolean;
  fechaInicio: Date;
  fechaFin: Date;
  trabajador: { nombre: string; documento: string };
  tipoNombre: string;
  // Lo liquidado en los meses que pidió el reporte.
  totales: TotalesLiquidacion;
}

const CAMPOS_DIAS = ['dias', ...CLAVES_DIAS_POR_PAGADOR] as const;
const CAMPOS_VALORES = ['valorEmpleador', 'valorEps', 'valorArl', 'valorAfp', 'valorDescuento'] as const;

function observacionDe(a: AusentismoParaDetalle): string | null {
  return [a.esProrroga ? 'Prórroga' : null, a.corregida ? 'Liquidación corregida a mano' : null].filter(Boolean).join('. ') || null;
}

// Una fila por ausentismo. Los días van en la primera tabla y, solo para quien puede ver valores, los pesos en una segunda con
// las mismas filas en el mismo orden (así los pesos caben completos en el papel).
export function seccionesDetalleAusentismo(ausentismos: readonly AusentismoParaDetalle[], verValores: boolean): SeccionReporte[] {
  const ordenados = [...ausentismos].sort((a, b) => a.trabajador.nombre.localeCompare(b.trabajador.nombre, 'es') || a.fechaInicio.getTime() - b.fechaInicio.getTime());

  const filasDias = ordenados.map((a): FilaReporte => {
    const fila: FilaReporte = {
      documentoTrabajador: a.trabajador.documento,
      trabajador: a.trabajador.nombre,
      numeroDocumento: a.numeroDocumento,
      tipo: a.tipoNombre,
      desde: aISO(a.fechaInicio),
      hasta: aISO(a.fechaFin),
      estado: a.anulada ? 'Anulado' : 'Vigente',
    };
    for (const campo of CAMPOS_DIAS) fila[campo] = a.totales[campo];
    fila.observacion = observacionDe(a);
    return fila;
  });

  // Los anulados se listan si se pidieron, pero no suman: ya no cuentan.
  const vigentes = ordenados.filter((a) => !a.anulada);
  const totalesDias: FilaReporte = { trabajador: 'Total (sin anulados)' };
  for (const campo of CAMPOS_DIAS) totalesDias[campo] = vigentes.reduce((suma, a) => suma + a.totales[campo], 0);

  const recortadoDias = recortarDetalle(filasDias);
  const secciones: SeccionReporte[] = [
    {
      titulo: 'Detalle por registro',
      nota: 'Los días son los de los meses que pidió el reporte. Emp.: a cargo del empleador. Lab.: pagados como laborados. Desc.: días a descontar. No incluye diagnósticos ni observaciones del trabajador.',
      columnas: [
        { clave: 'documentoTrabajador', encabezado: 'Documento', tipo: 'texto', peso: 1.2 },
        { clave: 'trabajador', encabezado: 'Trabajador', tipo: 'texto', peso: 2.1 },
        { clave: 'numeroDocumento', encabezado: 'N.º incap.', tipo: 'texto', peso: 1.3 },
        { clave: 'tipo', encabezado: 'Tipo', tipo: 'texto', peso: 1.8 },
        { clave: 'desde', encabezado: 'Desde', tipo: 'fecha', peso: 1.05 },
        { clave: 'hasta', encabezado: 'Hasta', tipo: 'fecha', peso: 1.05 },
        { clave: 'estado', encabezado: 'Estado', tipo: 'texto', peso: 0.9 },
        { clave: 'dias', encabezado: 'Días', tipo: 'entero', peso: 0.6 },
        { clave: 'diasEmpleador', encabezado: 'Emp.', tipo: 'entero', peso: 0.62 },
        { clave: 'diasEps', encabezado: 'EPS', tipo: 'entero', peso: 0.62 },
        { clave: 'diasArl', encabezado: 'ARL', tipo: 'entero', peso: 0.62 },
        { clave: 'diasAfp', encabezado: 'AFP', tipo: 'entero', peso: 0.62 },
        { clave: 'diasLaborados', encabezado: 'Lab.', tipo: 'entero', peso: 0.62 },
        { clave: 'diasDescuento', encabezado: 'Desc.', tipo: 'entero', peso: 0.62 },
        { clave: 'observacion', encabezado: 'Observación', tipo: 'texto', peso: 1.5 },
      ],
      filas: recortadoDias.filas,
      totales: filasDias.length > 0 ? totalesDias : undefined,
      filasTotales: recortadoDias.filasTotales,
    },
  ];

  if (verValores) {
    const filasValores = ordenados.map(
      (a): FilaReporte => ({
        trabajador: a.trabajador.nombre,
        numeroDocumento: a.numeroDocumento,
        tipo: a.tipoNombre,
        desde: aISO(a.fechaInicio),
        estado: a.anulada ? 'Anulado' : 'Vigente',
        ...Object.fromEntries(CAMPOS_VALORES.map((campo) => [campo, pesos(a.totales[campo])])),
      }),
    );
    const totalesValores: FilaReporte = { trabajador: 'Total (sin anulados)' };
    for (const campo of CAMPOS_VALORES) totalesValores[campo] = pesos(vigentes.reduce((suma, a) => suma.plus(a.totales[campo]), new Prisma.Decimal(0)));
    const recortadoValores = recortarDetalle(filasValores);
    secciones.push({
      titulo: 'Valores liquidados por registro',
      nota: 'Las mismas filas, en el mismo orden. Cada columna es lo que corresponde a ese pagador (empleador, EPS, ARL o AFP) y lo que se descuenta. Es una liquidación de apoyo: la nómina se liquida fuera del sistema. Lo que reconocen la EPS, la ARL y la AFP no lo paga la empresa.',
      columnas: [
        { clave: 'trabajador', encabezado: 'Trabajador', tipo: 'texto', peso: 2.1 },
        { clave: 'numeroDocumento', encabezado: 'N.º incap.', tipo: 'texto', peso: 1.3 },
        { clave: 'tipo', encabezado: 'Tipo', tipo: 'texto', peso: 1.8 },
        { clave: 'desde', encabezado: 'Desde', tipo: 'fecha', peso: 1.05 },
        { clave: 'estado', encabezado: 'Estado', tipo: 'texto', peso: 0.9 },
        ...COLUMNAS_VALORES,
      ],
      filas: recortadoValores.filas,
      totales: filasValores.length > 0 ? totalesValores : undefined,
      filasTotales: recortadoValores.filasTotales,
    });
  }
  return secciones;
}

// ---------- EPP ----------

export interface EntregaEppParaReporte {
  fecha: Date;
  cantidad: number;
  tallaReferencia: string | null;
  motivo: string;
  firmoRecibido: boolean;
  proximaReposicion: Date;
  trabajador: { nombre: string; documento: string };
  elemento: { nombre: string };
}

export interface ReposicionParaReporte {
  trabajador: { nombre: string; documento: string };
  elemento: { nombre: string };
  ultimaEntrega: Date;
  proximaReposicion: Date;
  diasRestantes: number;
  estado: string;
}

export function seccionesEpp(
  entregas: readonly EntregaEppParaReporte[],
  reposiciones: readonly ReposicionParaReporte[],
  resumen: { vencidos: number; porReponer: number; vigentes: number },
  diasAlerta: number,
): SeccionReporte[] {
  const filasEntregas = entregas.map(
    (e): FilaReporte => ({
      fecha: aISO(e.fecha),
      documentoTrabajador: e.trabajador.documento,
      trabajador: e.trabajador.nombre,
      elemento: e.elemento.nombre,
      cantidad: e.cantidad,
      talla: e.tallaReferencia,
      motivo: ETIQUETA_MOTIVO_EPP[e.motivo] ?? e.motivo,
      firmo: e.firmoRecibido ? 'Sí' : 'No',
      proximaReposicion: aISO(e.proximaReposicion),
    }),
  );
  const recortado = recortarDetalle(filasEntregas);

  const filasReposicion = [...reposiciones]
    .sort((a, b) => a.proximaReposicion.getTime() - b.proximaReposicion.getTime() || a.trabajador.nombre.localeCompare(b.trabajador.nombre, 'es'))
    .map(
      (r): FilaReporte => ({
        documentoTrabajador: r.trabajador.documento,
        trabajador: r.trabajador.nombre,
        elemento: r.elemento.nombre,
        ultimaEntrega: aISO(r.ultimaEntrega),
        proximaReposicion: aISO(r.proximaReposicion),
        diasRestantes: r.diasRestantes,
        estado: ETIQUETA_ESTADO_REPOSICION[r.estado] ?? r.estado,
      }),
    );

  return [
    {
      titulo: 'Entregas del período',
      nota: 'Solo las entregas vigentes (sin las anuladas).',
      columnas: [
        { clave: 'fecha', encabezado: 'Fecha', tipo: 'fecha' },
        { clave: 'documentoTrabajador', encabezado: 'Documento', tipo: 'texto', peso: 1.2 },
        { clave: 'trabajador', encabezado: 'Trabajador', tipo: 'texto', peso: 2 },
        { clave: 'elemento', encabezado: 'Elemento', tipo: 'texto', peso: 2 },
        { clave: 'cantidad', encabezado: 'Cantidad', tipo: 'entero', peso: 0.9 },
        { clave: 'talla', encabezado: 'Talla', tipo: 'texto', peso: 0.8 },
        { clave: 'motivo', encabezado: 'Motivo', tipo: 'texto', peso: 1.8 },
        { clave: 'firmo', encabezado: 'Firmó', tipo: 'texto', peso: 0.8 },
        { clave: 'proximaReposicion', encabezado: 'Reposición', tipo: 'fecha' },
      ],
      filas: recortado.filas,
      totales: filasEntregas.length > 0 ? { trabajador: 'Total de unidades', cantidad: entregas.reduce((suma, e) => suma + e.cantidad, 0) } : undefined,
      filasTotales: recortado.filasTotales,
    },
    {
      titulo: 'Por reponer y vencidos',
      nota: `Hoy: ${resumen.vencidos} vencidos, ${resumen.porReponer} por reponer (faltan ${diasAlerta} días o menos) y ${resumen.vigentes} vigentes. Se cuenta la última entrega de cada trabajador activo y elemento activo.`,
      columnas: [
        { clave: 'documentoTrabajador', encabezado: 'Documento', tipo: 'texto', peso: 1.2 },
        { clave: 'trabajador', encabezado: 'Trabajador', tipo: 'texto', peso: 2 },
        { clave: 'elemento', encabezado: 'Elemento', tipo: 'texto', peso: 2 },
        { clave: 'ultimaEntrega', encabezado: 'Última entrega', tipo: 'fecha' },
        { clave: 'proximaReposicion', encabezado: 'Próxima reposición', tipo: 'fecha' },
        { clave: 'diasRestantes', encabezado: 'Días restantes', tipo: 'entero' },
        { clave: 'estado', encabezado: 'Estado', tipo: 'texto' },
      ],
      filas: filasReposicion,
    },
  ];
}

// ---------- Plan de trabajo ----------

export interface ActividadParaReporte {
  ciclo: string;
  estandar: string;
  actividad: string;
  meta: string;
  responsable: string;
  fechaInicio: Date;
  fechaFin: Date;
  presupuesto: Prisma.Decimal | null;
  estado: EstadoActividadSst;
  porcentajeAvance: number;
  alerta: EstadoAlerta;
}

export function seccionesPlan(anio: number, resumen: ResumenPlan, actividades: readonly ActividadParaReporte[]): SeccionReporte[] {
  const filas = actividades.map(
    (a): FilaReporte => ({
      ciclo: ETIQUETA_CICLO[a.ciclo] ?? a.ciclo,
      estandar: a.estandar,
      actividad: a.actividad,
      meta: a.meta,
      responsable: a.responsable,
      fechaInicio: aISO(a.fechaInicio),
      fechaFin: aISO(a.fechaFin),
      estado: ETIQUETA_ESTADO_ACTIVIDAD[a.estado] ?? a.estado,
      avance: textoPorcentaje(a.porcentajeAvance),
      presupuesto: a.presupuesto === null ? null : pesos(a.presupuesto),
      alerta: ETIQUETA_ALERTA[a.alerta] || null,
    }),
  );
  const conPresupuesto = actividades.filter((a) => a.presupuesto !== null && a.estado !== 'CANCELADA');
  const recortado = recortarDetalle(filas);

  return [
    {
      titulo: `Cumplimiento del plan ${anio}`,
      nota: 'El avance promedio y el cumplimiento no cuentan las actividades canceladas. Cumplimiento: ejecutadas sobre las no canceladas.',
      columnas: [
        { clave: 'total', encabezado: 'Actividades', tipo: 'entero' },
        { clave: 'programadas', encabezado: 'Programadas', tipo: 'entero' },
        { clave: 'enEjecucion', encabezado: 'En ejecución', tipo: 'entero' },
        { clave: 'ejecutadas', encabezado: 'Ejecutadas', tipo: 'entero' },
        { clave: 'reprogramadas', encabezado: 'Reprogramadas', tipo: 'entero' },
        { clave: 'canceladas', encabezado: 'Canceladas', tipo: 'entero' },
        { clave: 'avancePromedio', encabezado: 'Avance promedio', tipo: 'texto', alineacion: 'derecha' },
        { clave: 'cumplimiento', encabezado: 'Cumplimiento', tipo: 'texto', alineacion: 'derecha' },
      ],
      filas: [
        {
          total: resumen.total,
          programadas: resumen.porEstado.PROGRAMADA,
          enEjecucion: resumen.porEstado.EN_EJECUCION,
          ejecutadas: resumen.porEstado.EJECUTADA,
          reprogramadas: resumen.porEstado.REPROGRAMADA,
          canceladas: resumen.porEstado.CANCELADA,
          avancePromedio: textoPorcentaje(resumen.avancePromedio),
          cumplimiento: textoPorcentaje(resumen.cumplimiento),
        },
      ],
    },
    {
      titulo: 'Actividades',
      columnas: [
        { clave: 'ciclo', encabezado: 'Ciclo', tipo: 'texto', peso: 0.8 },
        { clave: 'estandar', encabezado: 'Estándar', tipo: 'texto', peso: 2.2 },
        { clave: 'actividad', encabezado: 'Actividad', tipo: 'texto', peso: 3.2 },
        { clave: 'meta', encabezado: 'Meta', tipo: 'texto', peso: 2 },
        { clave: 'responsable', encabezado: 'Responsable', tipo: 'texto', peso: 1.6 },
        { clave: 'fechaInicio', encabezado: 'Inicio', tipo: 'fecha', peso: 1.05 },
        { clave: 'fechaFin', encabezado: 'Fin', tipo: 'fecha', peso: 1.05 },
        { clave: 'estado', encabezado: 'Estado', tipo: 'texto' },
        { clave: 'avance', encabezado: 'Avance', tipo: 'texto', peso: 0.75, alineacion: 'derecha' },
        { clave: 'presupuesto', encabezado: 'Presupuesto', tipo: 'pesos', peso: 1.2 },
        { clave: 'alerta', encabezado: 'Alerta', tipo: 'texto', peso: 0.8 },
      ],
      filas: recortado.filas,
      totales: conPresupuesto.length > 0 ? { actividad: 'Presupuesto (sin canceladas)', presupuesto: pesos(conPresupuesto.reduce((suma, a) => suma + Number(a.presupuesto), 0)) } : undefined,
      filasTotales: recortado.filasTotales,
    },
  ];
}

// ---------- Capacitaciones ----------

export interface CapacitacionParaReporte {
  tema: string;
  modalidad: string;
  horas: Prisma.Decimal;
  fechaProgramada: Date;
  fechaEjecucion: Date | null;
  responsable: string;
  ejecutor: string;
  estado: string;
  asistentesProgramados: number;
  asistentesReales: number;
  cobertura: number | null;
  evaluacionEficacia: Prisma.Decimal | null;
  alerta: EstadoAlerta;
}

export function seccionesCapacitaciones(anio: number, resumen: { total: number; ejecutadas: number; coberturaEjecutadas: number | null }, capacitaciones: readonly CapacitacionParaReporte[]): SeccionReporte[] {
  const filas = capacitaciones.map(
    (c): FilaReporte => ({
      tema: c.tema,
      modalidad: ETIQUETA_MODALIDAD[c.modalidad] ?? c.modalidad,
      horas: c.horas.toString().replace('.', ','),
      fechaProgramada: aISO(c.fechaProgramada),
      fechaEjecucion: c.fechaEjecucion ? aISO(c.fechaEjecucion) : null,
      responsable: c.responsable,
      ejecutor: ETIQUETA_EJECUTOR[c.ejecutor] ?? c.ejecutor,
      estado: ETIQUETA_ESTADO_ACTIVIDAD[c.estado] ?? c.estado,
      programados: c.asistentesProgramados,
      reales: c.asistentesReales,
      cobertura: textoPorcentaje(c.cobertura),
      eficacia: c.evaluacionEficacia === null ? null : c.evaluacionEficacia.toString().replace('.', ','),
      alerta: ETIQUETA_ALERTA[c.alerta] || null,
    }),
  );
  const recortado = recortarDetalle(filas);

  return [
    {
      titulo: `Cobertura de las capacitaciones ${anio}`,
      nota: 'Cobertura de las ya ejecutadas: asistentes reales sobre programados.',
      columnas: [
        { clave: 'total', encabezado: 'Capacitaciones', tipo: 'entero' },
        { clave: 'ejecutadas', encabezado: 'Ejecutadas', tipo: 'entero' },
        { clave: 'cobertura', encabezado: 'Cobertura de las ejecutadas', tipo: 'texto', alineacion: 'derecha' },
      ],
      filas: [{ total: resumen.total, ejecutadas: resumen.ejecutadas, cobertura: textoPorcentaje(resumen.coberturaEjecutadas) }],
    },
    {
      titulo: 'Capacitaciones',
      nota: 'Programados y reales: asistentes. Cobertura: reales sobre programados.',
      columnas: [
        { clave: 'tema', encabezado: 'Tema', tipo: 'texto', peso: 2.4 },
        { clave: 'modalidad', encabezado: 'Modalidad', tipo: 'texto', peso: 1.1 },
        { clave: 'horas', encabezado: 'Horas', tipo: 'texto', peso: 0.6, alineacion: 'derecha' },
        { clave: 'fechaProgramada', encabezado: 'Programada', tipo: 'fecha', peso: 1.1 },
        { clave: 'fechaEjecucion', encabezado: 'Ejecutada', tipo: 'fecha', peso: 1.1 },
        { clave: 'responsable', encabezado: 'Facilitador', tipo: 'texto', peso: 1.4 },
        { clave: 'ejecutor', encabezado: 'Ejecutor', tipo: 'texto', peso: 0.9 },
        { clave: 'estado', encabezado: 'Estado', tipo: 'texto' },
        { clave: 'programados', encabezado: 'Programados', tipo: 'entero', peso: 1.05 },
        { clave: 'reales', encabezado: 'Reales', tipo: 'entero', peso: 0.8 },
        { clave: 'cobertura', encabezado: 'Cobertura', tipo: 'texto', peso: 0.95, alineacion: 'derecha' },
        { clave: 'eficacia', encabezado: 'Eficacia', tipo: 'texto', peso: 0.8, alineacion: 'derecha' },
        { clave: 'alerta', encabezado: 'Alerta', tipo: 'texto', peso: 0.85 },
      ],
      filas: recortado.filas,
      filasTotales: recortado.filasTotales,
    },
  ];
}
