import { Prisma } from '../../generated/prisma/client.js';
import { formatearDiaDDMMAAAA } from '../../cierres-caja/periodo.js';
import { pesos, recortarDetalle, type FilaReporte, type SeccionReporte } from '../modelo.js';
import { NOMBRE_SIN_PROYECTO } from './egresos.js';

// Costo de mano de obra por obra y quincena (CC-05, RF-PER-10). Una fila por pago de nómina.
export interface PagoManoDeObra {
  // null = pago anterior a CC-05 o sin obra: general de la empresa.
  proyecto: string | null;
  // Fechas calendario "aaaa-mm-dd".
  periodoInicio: string;
  periodoFin: string;
  trabajadorId: string;
  trabajador: string;
  cargo: string;
  // null en los pagos anteriores a CC-05, que no se liquidaron por días.
  dias: Prisma.Decimal | null;
  valorDia: Prisma.Decimal | null;
  valorHorasExtra: Prisma.Decimal | null;
  /** Lo que cuesta a la obra: días más horas extra (en un pago anterior, lo pagado). */
  devengado: Prisma.Decimal;
  /** Lo que salió de caja: el devengado menos anticipos y descuentos. */
  pagado: Prisma.Decimal;
}

const CERO = () => new Prisma.Decimal(0);

// Días con coma decimal ("7,5"); sin dato, un guion.
const textoDias = (dias: Prisma.Decimal | null) => (dias === null ? '—' : dias.toString().replace('.', ','));
const periodoTexto = (pago: Pick<PagoManoDeObra, 'periodoInicio' | 'periodoFin'>) => `${formatearDiaDDMMAAAA(pago.periodoInicio)} al ${formatearDiaDDMMAAAA(pago.periodoFin)}`;
// Lo que se descontó del devengado (anticipos y descuentos); nunca negativo.
const descontado = (pago: Pick<PagoManoDeObra, 'devengado' | 'pagado'>) => Prisma.Decimal.max(pago.devengado.minus(pago.pagado), CERO());

interface Grupo {
  proyecto: string;
  periodo: string | null;
  inicio: string;
  trabajadores: Set<string>;
  pagos: number;
  dias: Prisma.Decimal;
  devengado: Prisma.Decimal;
  descontado: Prisma.Decimal;
  pagado: Prisma.Decimal;
}

function agrupar(pagos: PagoManoDeObra[], porPeriodo: boolean): Grupo[] {
  const grupos = new Map<string, Grupo>();
  for (const pago of pagos) {
    const proyecto = pago.proyecto ?? NOMBRE_SIN_PROYECTO;
    const clave = porPeriodo ? `${proyecto}\u0000${pago.periodoInicio}\u0000${pago.periodoFin}` : proyecto;
    const grupo = grupos.get(clave) ?? {
      proyecto,
      periodo: porPeriodo ? periodoTexto(pago) : null,
      inicio: pago.periodoInicio,
      trabajadores: new Set<string>(),
      pagos: 0,
      dias: CERO(),
      devengado: CERO(),
      descontado: CERO(),
      pagado: CERO(),
    };
    grupo.trabajadores.add(pago.trabajadorId);
    grupo.pagos += 1;
    grupo.dias = grupo.dias.plus(pago.dias ?? 0);
    grupo.devengado = grupo.devengado.plus(pago.devengado);
    grupo.descontado = grupo.descontado.plus(descontado(pago));
    grupo.pagado = grupo.pagado.plus(pago.pagado);
    grupos.set(clave, grupo);
  }
  // Por obra (la general al final) y, dentro de cada una, la quincena más reciente primero.
  return [...grupos.values()].sort((a, b) => {
    if (a.proyecto !== b.proyecto) {
      if (a.proyecto === NOMBRE_SIN_PROYECTO) return 1;
      if (b.proyecto === NOMBRE_SIN_PROYECTO) return -1;
      return a.proyecto.localeCompare(b.proyecto, 'es');
    }
    return b.inicio.localeCompare(a.inicio);
  });
}

export function construirManoDeObra(pagos: PagoManoDeObra[]): SeccionReporte[] {
  const total = {
    pagos: pagos.length,
    trabajadores: new Set(pagos.map((p) => p.trabajadorId)).size,
    dias: pagos.reduce((suma, p) => suma.plus(p.dias ?? 0), CERO()),
    devengado: pagos.reduce((suma, p) => suma.plus(p.devengado), CERO()),
    descontado: pagos.reduce((suma, p) => suma.plus(descontado(p)), CERO()),
    pagado: pagos.reduce((suma, p) => suma.plus(p.pagado), CERO()),
  };

  const fila = (g: Grupo): FilaReporte => ({
    proyecto: g.proyecto,
    periodo: g.periodo,
    trabajadores: g.trabajadores.size,
    pagos: g.pagos,
    dias: textoDias(g.dias),
    devengado: pesos(g.devengado),
    descontado: pesos(g.descontado),
    pagado: pesos(g.pagado),
  });
  const totales = (): FilaReporte => ({
    proyecto: 'Total',
    periodo: null,
    trabajadores: total.trabajadores,
    pagos: total.pagos,
    dias: textoDias(total.dias),
    devengado: pesos(total.devengado),
    descontado: pesos(total.descontado),
    pagado: pesos(total.pagado),
  });

  const porObra: SeccionReporte = {
    titulo: 'Costo de la mano de obra por obra',
    nota: 'El costo de la obra es lo devengado (días más horas extra). Los anticipos y descuentos reducen lo pagado, no el costo. Los pagos anteriores a la nómina por obra no tienen obra ni días: aparecen como "General".',
    columnas: [
      { clave: 'proyecto', encabezado: 'Obra', tipo: 'texto', peso: 3 },
      { clave: 'trabajadores', encabezado: 'Trabajadores', tipo: 'entero' },
      { clave: 'pagos', encabezado: 'Pagos', tipo: 'entero' },
      { clave: 'dias', encabezado: 'Días', tipo: 'texto', alineacion: 'derecha' },
      { clave: 'devengado', encabezado: 'Costo (devengado)', tipo: 'pesos', peso: 1.5 },
      { clave: 'descontado', encabezado: 'Anticipos y desc.', tipo: 'pesos', peso: 1.5 },
      { clave: 'pagado', encabezado: 'Pagado', tipo: 'pesos', peso: 1.5 },
    ],
    filas: agrupar(pagos, false).map(fila),
    totales: totales(),
  };

  const porQuincena: SeccionReporte = {
    titulo: 'Costo por obra y quincena',
    columnas: [
      { clave: 'proyecto', encabezado: 'Obra', tipo: 'texto', peso: 3 },
      { clave: 'periodo', encabezado: 'Período', tipo: 'texto', peso: 2.5 },
      { clave: 'trabajadores', encabezado: 'Trabajadores', tipo: 'entero' },
      { clave: 'dias', encabezado: 'Días', tipo: 'texto', alineacion: 'derecha' },
      { clave: 'devengado', encabezado: 'Costo (devengado)', tipo: 'pesos', peso: 1.5 },
      { clave: 'pagado', encabezado: 'Pagado', tipo: 'pesos', peso: 1.5 },
    ],
    filas: agrupar(pagos, true).map(fila),
    totales: totales(),
  };

  const detalle = recortarDetalle(
    [...pagos]
      .sort((a, b) => (a.proyecto ?? '￿').localeCompare(b.proyecto ?? '￿', 'es') || b.periodoInicio.localeCompare(a.periodoInicio) || a.trabajador.localeCompare(b.trabajador, 'es'))
      .map(
        (pago): FilaReporte => ({
          proyecto: pago.proyecto ?? NOMBRE_SIN_PROYECTO,
          periodo: periodoTexto(pago),
          trabajador: pago.trabajador,
          cargo: pago.cargo,
          dias: textoDias(pago.dias),
          valorDia: pago.valorDia === null ? null : pesos(pago.valorDia),
          horasExtra: pago.valorHorasExtra === null ? null : pesos(pago.valorHorasExtra),
          devengado: pesos(pago.devengado),
          descontado: pesos(descontado(pago)),
          pagado: pesos(pago.pagado),
        }),
      ),
  );
  const porTrabajador: SeccionReporte = {
    titulo: 'Detalle por trabajador',
    columnas: [
      { clave: 'proyecto', encabezado: 'Obra', tipo: 'texto', peso: 2 },
      { clave: 'periodo', encabezado: 'Período', tipo: 'texto', peso: 2 },
      { clave: 'trabajador', encabezado: 'Trabajador', tipo: 'texto', peso: 2.3 },
      { clave: 'cargo', encabezado: 'Cargo', tipo: 'texto', peso: 1.3 },
      { clave: 'dias', encabezado: 'Días', tipo: 'texto', peso: 0.7, alineacion: 'derecha' },
      { clave: 'valorDia', encabezado: 'Valor día', tipo: 'pesos' },
      { clave: 'horasExtra', encabezado: 'Horas extra', tipo: 'pesos' },
      { clave: 'devengado', encabezado: 'Devengado', tipo: 'pesos' },
      { clave: 'descontado', encabezado: 'Anticipos y desc.', tipo: 'pesos' },
      { clave: 'pagado', encabezado: 'Pagado', tipo: 'pesos' },
    ],
    filas: detalle.filas,
    filasTotales: detalle.filasTotales,
  };

  return [porObra, porQuincena, porTrabajador];
}
