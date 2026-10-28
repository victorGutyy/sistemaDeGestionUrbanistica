import { Prisma } from '../generated/prisma/client.js';

// Resumen mensual del ausentismo del año (RF-SST-10): por mes, cuántos registros hubo, los días totales y por tipo, los valores
// por pagador, los descuentos, los trabajadores activos y el porcentaje de ausentismo. Funciones puras sobre los períodos que
// ya calculó la liquidación (un ausentismo que cruza de mes cuenta en cada mes que toca, con los días de ese mes).

export interface PeriodoParaResumen {
  ausentismoId: string;
  tipoId: string;
  tipoNombre: string;
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
}

export interface TrabajadorParaResumen {
  fechaIngreso: Date;
  fechaRetiro: Date | null;
}

export interface TipoDelResumen {
  tipoId: string;
  nombre: string;
  registros: number;
  dias: number;
}

export interface FilaResumen {
  // Registros (ausentismos vigentes con días en el período) y días de ausentismo.
  registros: number;
  dias: number;
  porTipo: TipoDelResumen[];
  diasPorPagador: { empleador: number; eps: number; arl: number; afp: number; laborados: number; descuento: number };
  // Valores en pesos enteros, como texto. Solo los ven quienes pueden ver valores (ver visibilidad.ts).
  valores: { empleador: string; eps: string; arl: string; afp: string; descuento: string };
  // Porcentaje de ausentismo: días de ausentismo ÷ (trabajadores activos × días del período) × 100, a dos decimales.
  trabajadoresActivos: number;
  porcentajeAusentismo: string;
}

export interface ResumenMensual {
  anio: number;
  meses: (FilaResumen & { mes: number })[];
  // Todo el año. Los trabajadores activos son el promedio de los meses y el porcentaje usa los días de cada mes.
  total: FilaResumen;
}

const CERO = new Prisma.Decimal(0);
const MESES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const primerDiaDelMes = (anio: number, mes: number) => new Date(anio, mes - 1, 1).getTime();
const ultimoDiaDelMes = (anio: number, mes: number) => new Date(anio, mes, 0).getTime();
const sinHora = (fecha: Date) => new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()).getTime();
export const diasDelMes = (anio: number, mes: number) => new Date(anio, mes, 0).getDate();

// Un trabajador cuenta como activo en un mes si ya había ingresado a fin de mes y no se había retirado antes de que empezara.
export function trabajadoresActivosEn(trabajadores: readonly TrabajadorParaResumen[], anio: number, mes: number): number {
  const inicio = primerDiaDelMes(anio, mes);
  const fin = ultimoDiaDelMes(anio, mes);
  return trabajadores.filter((t) => sinHora(t.fechaIngreso) <= fin && (t.fechaRetiro === null || sinHora(t.fechaRetiro) >= inicio)).length;
}

function filaDe(periodos: readonly PeriodoParaResumen[], activos: number, diasDelPeriodo: number): FilaResumen {
  const porTipo = new Map<string, { nombre: string; ausentismos: Set<string>; dias: number }>();
  const registros = new Set<string>();
  let dias = 0;
  const diasPorPagador = { empleador: 0, eps: 0, arl: 0, afp: 0, laborados: 0, descuento: 0 };
  let valorEmpleador = CERO;
  let valorEps = CERO;
  let valorArl = CERO;
  let valorAfp = CERO;
  let valorDescuento = CERO;

  for (const p of periodos) {
    registros.add(p.ausentismoId);
    dias += p.dias;
    const tipo = porTipo.get(p.tipoId) ?? { nombre: p.tipoNombre, ausentismos: new Set<string>(), dias: 0 };
    tipo.ausentismos.add(p.ausentismoId);
    tipo.dias += p.dias;
    porTipo.set(p.tipoId, tipo);
    diasPorPagador.empleador += p.diasEmpleador;
    diasPorPagador.eps += p.diasEps;
    diasPorPagador.arl += p.diasArl;
    diasPorPagador.afp += p.diasAfp;
    diasPorPagador.laborados += p.diasLaborados;
    diasPorPagador.descuento += p.diasDescuento;
    valorEmpleador = valorEmpleador.plus(p.valorEmpleador);
    valorEps = valorEps.plus(p.valorEps);
    valorArl = valorArl.plus(p.valorArl);
    valorAfp = valorAfp.plus(p.valorAfp);
    valorDescuento = valorDescuento.plus(p.valorDescuento);
  }

  const base = diasDelPeriodo;
  return {
    registros: registros.size,
    dias,
    porTipo: [...porTipo.entries()]
      .map(([tipoId, t]) => ({ tipoId, nombre: t.nombre, registros: t.ausentismos.size, dias: t.dias }))
      .sort((a, b) => b.dias - a.dias || a.nombre.localeCompare(b.nombre, 'es')),
    diasPorPagador,
    valores: { empleador: valorEmpleador.toString(), eps: valorEps.toString(), arl: valorArl.toString(), afp: valorAfp.toString(), descuento: valorDescuento.toString() },
    trabajadoresActivos: activos,
    porcentajeAusentismo: base === 0 ? '0' : new Prisma.Decimal(dias).div(base).mul(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toString(),
  };
}

export function calcularResumenMensual(entrada: { anio: number; periodos: readonly PeriodoParaResumen[]; trabajadores: readonly TrabajadorParaResumen[] }): ResumenMensual {
  const { anio, periodos, trabajadores } = entrada;
  const delAnio = periodos.filter((p) => p.anio === anio);

  const meses = MESES.map((mes) => {
    const activos = trabajadoresActivosEn(trabajadores, anio, mes);
    const fila = filaDe(
      delAnio.filter((p) => p.mes === mes),
      activos,
      activos * diasDelMes(anio, mes),
    );
    return { mes, ...fila };
  });

  // Los días-trabajador posibles del año: lo que cada mes pudo haber ausentado según sus activos.
  const diasPosibles = meses.reduce((suma, fila) => suma + fila.trabajadoresActivos * diasDelMes(anio, fila.mes), 0);
  const promedioActivos = Math.round((meses.reduce((suma, fila) => suma + fila.trabajadoresActivos, 0) / 12) * 10) / 10;
  const total = filaDe(delAnio, 0, diasPosibles);
  return { anio, meses, total: { ...total, trabajadoresActivos: promedioActivos } };
}
