import { Prisma } from '../generated/prisma/client.js';
import { ReglaAusentismo } from '../generated/prisma/enums.js';
import { errorEnTramos } from '../seguridad-social/calculos.js';

// Liquidación de apoyo del ausentismo (CC-03 fase C, RF-SST-04 a 06): quién paga cada día de una incapacidad o licencia y
// cuánto, repartido por mes. Son funciones puras: reciben los valores del parámetro legal del año y los del tipo, y
// devuelven el resultado, sin tocar la base de datos. NINGÚN número legal vive aquí (porcentajes, días de cada tramo y
// salario mínimo llegan como parámetros). No sustituye a la nómina: el asesor laboral valida las reglas y las cifras.

type Valor = Prisma.Decimal | string | number;

export interface ParametrosLiquidacion {
  smmlv: Valor;
  // Días del mes con los que se convierte un salario mensual en valor diario (30 por defecto en el parámetro legal).
  diasBaseMes: number;
  // Primer tramo (días hasta diasTramo1Hasta), segundo tramo (hasta diasTramo2Hasta y, pasado ese límite, la AFP).
  porcentajeTramo1: Valor;
  porcentajeTramo2: Valor;
  // Incapacidad de origen laboral.
  porcentajeLaboral: Valor;
  diasEmpleador: number;
  diasTramo1Hasta: number;
  diasTramo2Hasta: number;
}

export interface TipoParaLiquidar {
  regla: ReglaAusentismo;
  // Solo en las reglas que lo llevan (la EPS paga, el empleador paga o se descuenta).
  porcentaje: Valor | null;
  // Accidente de trabajo: el día del evento se paga como laborado y la ARL paga desde el día siguiente.
  diaEventoComoLaborado: boolean;
}

export interface EntradaLiquidacion {
  tipo: TipoParaLiquidar;
  // Primer y último día del ausentismo (inclusive), como fechas calendario locales.
  fechaInicio: Date;
  fechaFin: Date;
  // Base de liquidación: hoy el salario mensual del trabajador (RF-SST-07 admite el IBC más adelante).
  salario: Valor;
  // Días de la misma incapacidad que ya pasaron antes de la fecha de inicio (prórrogas): cuentan para los tramos.
  diasPrevios?: number;
  parametros: ParametrosLiquidacion;
}

// La parte del ausentismo que cae en un mes: días y valor de cada pagador. Los valores ya van en pesos enteros.
export interface PeriodoLiquidado {
  anio: number;
  mes: number;
  dias: number;
  diasEmpleador: number;
  diasEps: number;
  diasArl: number;
  diasAfp: number;
  // Días que se pagan como laborados (el del evento de un accidente de trabajo): no tienen valor de ausentismo.
  diasLaborados: number;
  diasDescuento: number;
  valorEmpleador: Prisma.Decimal;
  valorEps: Prisma.Decimal;
  valorArl: Prisma.Decimal;
  valorAfp: Prisma.Decimal;
  valorDescuento: Prisma.Decimal;
}

export type TotalesLiquidacion = Omit<PeriodoLiquidado, 'anio' | 'mes'>;

export interface ResultadoLiquidacion {
  // Valor diario con el que se liquidó (salario ÷ días base) y el mínimo diario (SMMLV ÷ días base), a 2 decimales.
  baseDiaria: Prisma.Decimal;
  pisoDiario: Prisma.Decimal;
  periodos: PeriodoLiquidado[];
  totales: TotalesLiquidacion;
  // Lo que se usó para calcular, listo para guardarse como foto: la liquidación no cambia si el parámetro cambia después.
  parametrosUsados: ParametrosUsados;
}

export interface ParametrosUsados {
  regla: ReglaAusentismo;
  porcentajeTipo: string | null;
  diaEventoComoLaborado: boolean;
  diasPrevios: number;
  smmlv: string;
  diasBaseMes: number;
  porcentajeTramo1: string;
  porcentajeTramo2: string;
  porcentajeLaboral: string;
  diasEmpleador: number;
  diasTramo1Hasta: number;
  diasTramo2Hasta: number;
}

type Pagador = 'EMPLEADOR' | 'EPS' | 'ARL' | 'AFP' | 'LABORADO' | 'DESCUENTO';

interface DiaLiquidado {
  pagador: Pagador;
  // Porcentaje del valor diario que paga (o descuenta).
  porcentaje: Prisma.Decimal;
  // Si a este día se le aplica el mínimo diario (las incapacidades no pagan menos que el salario mínimo diario).
  conPiso: boolean;
}

const CIEN = new Prisma.Decimal(100);
const CERO = new Prisma.Decimal(0);

const aPesosEnteros = (valor: Prisma.Decimal) => valor.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
const aDosDecimales = (valor: Prisma.Decimal) => valor.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

// Un día calendario como número (días desde 1970, sin horas), para recorrer fechas sin que el horario de verano o la zona
// horaria cuenten un día de más o de menos.
function numeroDeDia(fecha: Date): number {
  return Math.floor(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()) / 86_400_000);
}

// Días calendario de un rango, contando el primero y el último.
export function diasCalendario(fechaInicio: Date, fechaFin: Date): number {
  return numeroDeDia(fechaFin) - numeroDeDia(fechaInicio) + 1;
}

// Año y mes (1 a 12) de un día numerado.
function anioYMes(dia: number): { anio: number; mes: number } {
  const fecha = new Date(dia * 86_400_000);
  return { anio: fecha.getUTCFullYear(), mes: fecha.getUTCMonth() + 1 };
}

// Quién paga el día número `numero` de la incapacidad (contando los días previos de las prórrogas) y con qué porcentaje.
function clasificarDia(numero: number, tipo: TipoParaLiquidar, parametros: ParametrosLiquidacion): DiaLiquidado {
  switch (tipo.regla) {
    case ReglaAusentismo.INCAPACIDAD_GENERAL: {
      // Los días a cargo del empleador se pagan con el porcentaje del primer tramo (supuesto a validar con el asesor).
      const primerTramo = new Prisma.Decimal(parametros.porcentajeTramo1);
      const segundoTramo = new Prisma.Decimal(parametros.porcentajeTramo2);
      if (numero <= parametros.diasEmpleador) return { pagador: 'EMPLEADOR', porcentaje: primerTramo, conPiso: true };
      if (numero <= parametros.diasTramo1Hasta) return { pagador: 'EPS', porcentaje: primerTramo, conPiso: true };
      if (numero <= parametros.diasTramo2Hasta) return { pagador: 'EPS', porcentaje: segundoTramo, conPiso: true };
      return { pagador: 'AFP', porcentaje: segundoTramo, conPiso: true };
    }
    case ReglaAusentismo.ORIGEN_LABORAL: {
      // El día del evento (el primero, si no es una prórroga) lo paga el empleador como si se hubiera trabajado.
      if (tipo.diaEventoComoLaborado && numero === 1) return { pagador: 'LABORADO', porcentaje: CERO, conPiso: false };
      return { pagador: 'ARL', porcentaje: new Prisma.Decimal(parametros.porcentajeLaboral), conPiso: true };
    }
    case ReglaAusentismo.PAGA_EPS:
      return { pagador: 'EPS', porcentaje: porcentajeDelTipo(tipo), conPiso: false };
    case ReglaAusentismo.PAGA_EMPLEADOR:
      return { pagador: 'EMPLEADOR', porcentaje: porcentajeDelTipo(tipo), conPiso: false };
    case ReglaAusentismo.DESCUENTO:
      return { pagador: 'DESCUENTO', porcentaje: porcentajeDelTipo(tipo), conPiso: false };
  }
}

function porcentajeDelTipo(tipo: TipoParaLiquidar): Prisma.Decimal {
  if (tipo.porcentaje === null) {
    throw new Error('Este tipo de ausentismo necesita un porcentaje y no lo tiene');
  }
  return new Prisma.Decimal(tipo.porcentaje);
}

// Valida lo que la liquidación necesita. Devuelve el mensaje del primer error, o null si todo está bien.
export function errorEnEntrada(entrada: EntradaLiquidacion): string | null {
  const { fechaInicio, fechaFin, salario, diasPrevios = 0, parametros } = entrada;
  if (Number.isNaN(fechaInicio.getTime()) || Number.isNaN(fechaFin.getTime())) return 'Las fechas del ausentismo no son válidas';
  if (numeroDeDia(fechaFin) < numeroDeDia(fechaInicio)) return 'La fecha de fin no puede ser anterior a la de inicio';
  if (new Prisma.Decimal(salario).lessThan(0)) return 'El salario no puede ser negativo';
  if (!Number.isInteger(diasPrevios) || diasPrevios < 0) return 'Los días previos deben ser un número entero sin signo';
  if (!Number.isInteger(parametros.diasBaseMes) || parametros.diasBaseMes < 1) return 'Los días base del mes deben ser al menos uno';
  if (new Prisma.Decimal(parametros.smmlv).lessThanOrEqualTo(0)) return 'El salario mínimo debe ser mayor que cero';
  for (const porcentaje of [parametros.porcentajeTramo1, parametros.porcentajeTramo2, parametros.porcentajeLaboral]) {
    const valor = new Prisma.Decimal(porcentaje);
    if (valor.lessThan(0) || valor.greaterThan(100)) return 'Los porcentajes de los parámetros deben estar entre 0 y 100';
  }
  if (entrada.tipo.porcentaje !== null) {
    const valor = new Prisma.Decimal(entrada.tipo.porcentaje);
    if (valor.lessThan(0) || valor.greaterThan(100)) return 'El porcentaje del tipo debe estar entre 0 y 100';
  }
  if (
    entrada.tipo.regla !== ReglaAusentismo.INCAPACIDAD_GENERAL &&
    entrada.tipo.regla !== ReglaAusentismo.ORIGEN_LABORAL &&
    entrada.tipo.porcentaje === null
  ) {
    return 'Este tipo de ausentismo necesita un porcentaje y no lo tiene';
  }
  return errorEnTramos(parametros);
}

function periodoVacio(anio: number, mes: number): PeriodoLiquidado {
  return {
    anio,
    mes,
    dias: 0,
    diasEmpleador: 0,
    diasEps: 0,
    diasArl: 0,
    diasAfp: 0,
    diasLaborados: 0,
    diasDescuento: 0,
    valorEmpleador: CERO,
    valorEps: CERO,
    valorArl: CERO,
    valorAfp: CERO,
    valorDescuento: CERO,
  };
}

// Un día de un ausentismo ya clasificado: a quién le toca pagarlo y cuánto vale ese día (sin redondear).
export interface DiaDeAusentismo {
  // El día calendario (local) y su número dentro de la incapacidad, contando los días de las prórrogas anteriores.
  fecha: Date;
  numero: number;
  pagador: Pagador;
  valor: Prisma.Decimal;
}

export type { Pagador };

// Clasifica cada día del ausentismo con las mismas reglas de la liquidación. Sirve para repartir un ausentismo en períodos que
// no son meses (por ejemplo, la semana o la quincena de un pago de nómina). El valor de cada día no se redondea: quien suma
// redondea al final.
export function diasDeAusentismo(entrada: EntradaLiquidacion): DiaDeAusentismo[] {
  const error = errorEnEntrada(entrada);
  if (error) {
    throw new Error(error);
  }
  const { tipo, parametros } = entrada;
  const diasPrevios = entrada.diasPrevios ?? 0;
  const base = new Prisma.Decimal(entrada.salario).div(parametros.diasBaseMes);
  const piso = new Prisma.Decimal(parametros.smmlv).div(parametros.diasBaseMes);
  const primerDia = numeroDeDia(entrada.fechaInicio);
  const ultimoDia = numeroDeDia(entrada.fechaFin);

  const dias: DiaDeAusentismo[] = [];
  for (let dia = primerDia; dia <= ultimoDia; dia++) {
    const numero = diasPrevios + (dia - primerDia) + 1;
    const clasificado = clasificarDia(numero, tipo, parametros);
    let valor = base.mul(clasificado.porcentaje).div(CIEN);
    if (clasificado.conPiso && valor.lessThan(piso)) {
      valor = piso;
    }
    const { anio, mes } = anioYMes(dia);
    const diaDelMes = new Date(dia * 86_400_000).getUTCDate();
    dias.push({ fecha: new Date(anio, mes - 1, diaDelMes), numero, pagador: clasificado.pagador, valor: clasificado.pagador === 'LABORADO' ? CERO : valor });
  }
  return dias;
}

// Liquida un ausentismo día por día y reparte el resultado por mes (RF-SST-04, 05 y 06):
//  - enfermedad general: empleador, EPS al primer porcentaje, EPS al segundo y AFP según los días acumulados, contando los
//    de las prórrogas, sin que el día pague menos que el salario mínimo diario;
//  - origen laboral: la ARL desde el día siguiente al evento (si el tipo lo indica, el día del evento se paga como laborado);
//  - licencias: la EPS o el empleador pagan el porcentaje del tipo, o se descuenta.
// El valor de cada pagador en cada mes se suma sin redondear y al final se redondea a pesos enteros (mitad hacia arriba).
export function liquidarAusentismo(entrada: EntradaLiquidacion): ResultadoLiquidacion {
  const error = errorEnEntrada(entrada);
  if (error) {
    throw new Error(error);
  }
  const { tipo, parametros } = entrada;
  const diasPrevios = entrada.diasPrevios ?? 0;
  const base = new Prisma.Decimal(entrada.salario).div(parametros.diasBaseMes);
  const piso = new Prisma.Decimal(parametros.smmlv).div(parametros.diasBaseMes);

  // Se acumula sin redondear por mes y pagador.
  const acumulados = new Map<string, { periodo: PeriodoLiquidado; valores: Record<Pagador, Prisma.Decimal> }>();
  for (const dia of diasDeAusentismo(entrada)) {
    const anio = dia.fecha.getFullYear();
    const mes = dia.fecha.getMonth() + 1;
    const clave = `${anio}-${mes}`;
    let acumulado = acumulados.get(clave);
    if (!acumulado) {
      acumulado = {
        periodo: periodoVacio(anio, mes),
        valores: { EMPLEADOR: CERO, EPS: CERO, ARL: CERO, AFP: CERO, LABORADO: CERO, DESCUENTO: CERO },
      };
      acumulados.set(clave, acumulado);
    }

    const periodo = acumulado.periodo;
    periodo.dias += 1;
    switch (dia.pagador) {
      case 'EMPLEADOR':
        periodo.diasEmpleador += 1;
        break;
      case 'EPS':
        periodo.diasEps += 1;
        break;
      case 'ARL':
        periodo.diasArl += 1;
        break;
      case 'AFP':
        periodo.diasAfp += 1;
        break;
      case 'LABORADO':
        periodo.diasLaborados += 1;
        break;
      case 'DESCUENTO':
        periodo.diasDescuento += 1;
        break;
    }
    if (dia.pagador !== 'LABORADO') {
      acumulado.valores[dia.pagador] = acumulado.valores[dia.pagador].plus(dia.valor);
    }
  }

  const periodos = [...acumulados.values()].map(({ periodo, valores }) => ({
    ...periodo,
    valorEmpleador: aPesosEnteros(valores.EMPLEADOR),
    valorEps: aPesosEnteros(valores.EPS),
    valorArl: aPesosEnteros(valores.ARL),
    valorAfp: aPesosEnteros(valores.AFP),
    valorDescuento: aPesosEnteros(valores.DESCUENTO),
  }));

  return {
    baseDiaria: aDosDecimales(base),
    pisoDiario: aDosDecimales(piso),
    periodos,
    totales: totalesDe(periodos),
    parametrosUsados: {
      regla: tipo.regla,
      porcentajeTipo: tipo.porcentaje === null ? null : new Prisma.Decimal(tipo.porcentaje).toString(),
      diaEventoComoLaborado: tipo.diaEventoComoLaborado,
      diasPrevios,
      smmlv: new Prisma.Decimal(parametros.smmlv).toString(),
      diasBaseMes: parametros.diasBaseMes,
      porcentajeTramo1: new Prisma.Decimal(parametros.porcentajeTramo1).toString(),
      porcentajeTramo2: new Prisma.Decimal(parametros.porcentajeTramo2).toString(),
      porcentajeLaboral: new Prisma.Decimal(parametros.porcentajeLaboral).toString(),
      diasEmpleador: parametros.diasEmpleador,
      diasTramo1Hasta: parametros.diasTramo1Hasta,
      diasTramo2Hasta: parametros.diasTramo2Hasta,
    },
  };
}

// Suma de los períodos: lo que paga cada pagador en todo el ausentismo.
export function totalesDe(periodos: readonly Omit<PeriodoLiquidado, 'anio' | 'mes'>[]): TotalesLiquidacion {
  return periodos.reduce<TotalesLiquidacion>(
    (total, p) => ({
      dias: total.dias + p.dias,
      diasEmpleador: total.diasEmpleador + p.diasEmpleador,
      diasEps: total.diasEps + p.diasEps,
      diasArl: total.diasArl + p.diasArl,
      diasAfp: total.diasAfp + p.diasAfp,
      diasLaborados: total.diasLaborados + p.diasLaborados,
      diasDescuento: total.diasDescuento + p.diasDescuento,
      valorEmpleador: total.valorEmpleador.plus(p.valorEmpleador),
      valorEps: total.valorEps.plus(p.valorEps),
      valorArl: total.valorArl.plus(p.valorArl),
      valorAfp: total.valorAfp.plus(p.valorAfp),
      valorDescuento: total.valorDescuento.plus(p.valorDescuento),
    }),
    {
      dias: 0,
      diasEmpleador: 0,
      diasEps: 0,
      diasArl: 0,
      diasAfp: 0,
      diasLaborados: 0,
      diasDescuento: 0,
      valorEmpleador: CERO,
      valorEps: CERO,
      valorArl: CERO,
      valorAfp: CERO,
      valorDescuento: CERO,
    },
  );
}

// Corrección manual de una liquidación (RF-SST-08): se puede cambiar cómo se reparten los días entre los pagadores y los
// valores, pero no los meses ni los días de cada uno, y nada puede quedar negativo. Devuelve el primer error o null.
export function errorEnCorreccion(originales: readonly PeriodoLiquidado[], corregidos: readonly PeriodoLiquidado[]): string | null {
  if (corregidos.length !== originales.length) return 'La corrección debe tener los mismos meses que la liquidación';
  for (const original of originales) {
    const nuevo = corregidos.find((p) => p.anio === original.anio && p.mes === original.mes);
    if (!nuevo) return `Falta el mes ${original.mes}/${original.anio} en la corrección`;
    if (nuevo.dias !== original.dias) return `Los días totales de ${original.mes}/${original.anio} no se pueden cambiar`;
    const dias = [nuevo.diasEmpleador, nuevo.diasEps, nuevo.diasArl, nuevo.diasAfp, nuevo.diasLaborados, nuevo.diasDescuento];
    if (dias.some((d) => !Number.isInteger(d) || d < 0)) return `Los días de cada pagador en ${original.mes}/${original.anio} deben ser enteros sin signo`;
    if (dias.reduce((suma, d) => suma + d, 0) !== nuevo.dias) return `Los días de cada pagador en ${original.mes}/${original.anio} deben sumar ${nuevo.dias}`;
    const valores = [nuevo.valorEmpleador, nuevo.valorEps, nuevo.valorArl, nuevo.valorAfp, nuevo.valorDescuento];
    if (valores.some((v) => new Prisma.Decimal(v).lessThan(0))) return `Los valores de ${original.mes}/${original.anio} no pueden ser negativos`;
  }
  return null;
}
