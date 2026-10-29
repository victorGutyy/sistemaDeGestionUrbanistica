import { Prisma } from '../generated/prisma/client.js';
import { ReglaAusentismo } from '../generated/prisma/enums.js';
import { diasDeAusentismo, type Pagador, type ParametrosUsados } from './liquidacion.js';

// Propuesta de novedades de nómina a partir del ausentismo (RF-SST-11): al registrar un pago, el sistema sugiere las
// novedades de incapacidad o de descuento de los días que caen en el período pagado. Es una SUGERENCIA: el usuario la
// confirma o la ajusta, y la nómina se liquida fuera del sistema. Funciones puras.
//
// Qué se propone (decisión del desarrollador, a confirmar con el asesor laboral):
//  - Incapacidad: lo que el empleador deja de pagar como salario porque lo paga una entidad (EPS, ARL o AFP). Son los días de
//    esas entidades en el período por el valor diario del salario (salario ÷ días base del mes).
//  - Descuento: el valor de los días de licencia no remunerada o ausencia injustificada del período.
//  - Los días a cargo del empleador no generan novedad: se pagan con el salario del período.

export interface AusentismoParaNovedad {
  id: string;
  numeroDocumento: string | null;
  tipoNombre: string;
  esProrroga: boolean;
  corregida: boolean;
  fechaInicio: Date;
  fechaFin: Date;
  salarioFoto: Prisma.Decimal;
  // Los parámetros con los que se liquidó (el JSON que guarda el ausentismo).
  parametrosLiquidacion: unknown;
}

export interface NovedadPropuesta {
  tipo: 'INCAPACIDAD' | 'DESCUENTO';
  // Pesos enteros, como texto.
  valor: string;
  descripcion: string;
}

export interface PropuestaDeAusentismo {
  ausentismoId: string;
  tipo: string;
  numeroDocumento: string | null;
  // La parte del ausentismo que cae en el período (aaaa-mm-dd).
  desde: string;
  hasta: string;
  diasEnPeriodo: number;
  dias: { empleador: number; eps: number; arl: number; afp: number; laborados: number; descuento: number };
  novedades: NovedadPropuesta[];
  avisos: string[];
}

const aISO = (fecha: Date) => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
const aCorta = (fecha: Date) => `${String(fecha.getDate()).padStart(2, '0')}/${String(fecha.getMonth() + 1).padStart(2, '0')}`;
// Un día calendario como número comparable (aaaammdd), sin horas.
const numeroDeDia = (fecha: Date) => fecha.getFullYear() * 10_000 + (fecha.getMonth() + 1) * 100 + fecha.getDate();

const pesos = (valor: Prisma.Decimal) => valor.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);

function foto(json: unknown): ParametrosUsados | null {
  if (!json || typeof json !== 'object') return null;
  const p = json as Partial<ParametrosUsados>;
  const completo = p.regla !== undefined && p.smmlv !== undefined && p.diasBaseMes !== undefined && p.porcentajeTramo1 !== undefined && p.porcentajeTramo2 !== undefined && p.porcentajeLaboral !== undefined && p.diasEmpleador !== undefined && p.diasTramo1Hasta !== undefined && p.diasTramo2Hasta !== undefined;
  return completo ? (p as ParametrosUsados) : null;
}

interface Rango {
  primero: Date | null;
  ultimo: Date | null;
}

function ampliar(rango: Rango, fecha: Date): void {
  rango.primero ??= fecha;
  rango.ultimo = fecha;
}

const textoRango = (rango: Rango) => (rango.primero && rango.ultimo ? `del ${aCorta(rango.primero)} al ${aCorta(rango.ultimo)}` : '');

const textoDias = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;

// Para cada ausentismo con días entre `desde` y `hasta` (ambos incluidos), reparte sus días por pagador y arma las novedades.
export function propuestaDeNovedades(ausentismos: readonly AusentismoParaNovedad[], desde: Date, hasta: Date): PropuestaDeAusentismo[] {
  const primero = numeroDeDia(desde);
  const ultimo = numeroDeDia(hasta);
  const propuestas: PropuestaDeAusentismo[] = [];

  for (const a of ausentismos) {
    if (numeroDeDia(a.fechaFin) < primero || numeroDeDia(a.fechaInicio) > ultimo) continue;
    const parametros = foto(a.parametrosLiquidacion);
    const avisos: string[] = [];
    const conteo: Record<Pagador, number> = { EMPLEADOR: 0, EPS: 0, ARL: 0, AFP: 0, LABORADO: 0, DESCUENTO: 0 };
    let valorDescuento = new Prisma.Decimal(0);
    let primerDiaEnPeriodo: Date | null = null;
    let ultimoDiaEnPeriodo: Date | null = null;
    // El rango de cada novedad es el de los días que la generan, no el de todo el ausentismo en el período.
    const rangos: { entidades: Rango; descuento: Rango } = { entidades: { primero: null, ultimo: null }, descuento: { primero: null, ultimo: null } };
    const base = parametros ? new Prisma.Decimal(a.salarioFoto).div(parametros.diasBaseMes) : new Prisma.Decimal(0);

    if (!parametros) {
      avisos.push('No se pudo reconstruir la liquidación de este ausentismo: calcula la novedad a mano.');
    } else {
      const dias = diasDeAusentismo({
        tipo: { regla: parametros.regla, porcentaje: parametros.porcentajeTipo, diaEventoComoLaborado: parametros.diaEventoComoLaborado },
        fechaInicio: a.fechaInicio,
        fechaFin: a.fechaFin,
        salario: a.salarioFoto,
        diasPrevios: parametros.diasPrevios,
        parametros: {
          smmlv: parametros.smmlv,
          diasBaseMes: parametros.diasBaseMes,
          porcentajeTramo1: parametros.porcentajeTramo1,
          porcentajeTramo2: parametros.porcentajeTramo2,
          porcentajeLaboral: parametros.porcentajeLaboral,
          diasEmpleador: parametros.diasEmpleador,
          diasTramo1Hasta: parametros.diasTramo1Hasta,
          diasTramo2Hasta: parametros.diasTramo2Hasta,
        },
      });
      for (const dia of dias) {
        const n = numeroDeDia(dia.fecha);
        if (n < primero || n > ultimo) continue;
        conteo[dia.pagador] += 1;
        if (dia.pagador === 'DESCUENTO') valorDescuento = valorDescuento.plus(dia.valor);
        primerDiaEnPeriodo ??= dia.fecha;
        ultimoDiaEnPeriodo = dia.fecha;
        if (dia.pagador === 'EPS' || dia.pagador === 'ARL' || dia.pagador === 'AFP') ampliar(rangos.entidades, dia.fecha);
        if (dia.pagador === 'DESCUENTO') ampliar(rangos.descuento, dia.fecha);
      }
    }

    const diasEnPeriodo = Object.values(conteo).reduce((suma, n) => suma + n, 0);
    if (parametros && diasEnPeriodo === 0) continue;

    const novedades: NovedadPropuesta[] = [];
    const etiquetaDocumento = `${a.tipoNombre}${a.numeroDocumento ? ` ${a.numeroDocumento}` : ''}`;

    const diasDeEntidades = conteo.EPS + conteo.ARL + conteo.AFP;
    if (diasDeEntidades > 0) {
      const quien = [conteo.EPS > 0 ? `${conteo.EPS} de la EPS` : null, conteo.ARL > 0 ? `${conteo.ARL} de la ARL` : null, conteo.AFP > 0 ? `${conteo.AFP} de la AFP` : null].filter(Boolean).join(', ');
      novedades.push({ tipo: 'INCAPACIDAD', valor: pesos(base.mul(diasDeEntidades)).toString(), descripcion: `${etiquetaDocumento}: ${quien} (${textoRango(rangos.entidades)})` });
    }
    if (conteo.DESCUENTO > 0) {
      novedades.push({ tipo: 'DESCUENTO', valor: pesos(valorDescuento).toString(), descripcion: `${etiquetaDocumento}: ${textoDias(conteo.DESCUENTO)} a descontar (${textoRango(rangos.descuento)})` });
    }

    if (a.corregida) {
      avisos.push('Tiene una corrección manual de la liquidación: confirma este valor.');
    }
    if (parametros?.regla === ReglaAusentismo.INCAPACIDAD_GENERAL && conteo.EMPLEADOR > 0) {
      avisos.push(`${textoDias(conteo.EMPLEADOR)} a cargo del empleador: se pagan con el salario del período. Si le corresponde pagarlos a un porcentaje, ajusta la novedad a mano.`);
    }
    if (parametros && novedades.length === 0) {
      avisos.push('No genera novedad: los días de este período los paga el empleador o se pagan como laborados.');
    }

    propuestas.push({
      ausentismoId: a.id,
      tipo: a.tipoNombre,
      numeroDocumento: a.numeroDocumento,
      desde: primerDiaEnPeriodo ? aISO(primerDiaEnPeriodo) : aISO(a.fechaInicio),
      hasta: ultimoDiaEnPeriodo ? aISO(ultimoDiaEnPeriodo) : aISO(a.fechaFin),
      diasEnPeriodo,
      dias: { empleador: conteo.EMPLEADOR, eps: conteo.EPS, arl: conteo.ARL, afp: conteo.AFP, laborados: conteo.LABORADO, descuento: conteo.DESCUENTO },
      novedades,
      avisos,
    });
  }

  return propuestas.sort((x, y) => x.desde.localeCompare(y.desde));
}
