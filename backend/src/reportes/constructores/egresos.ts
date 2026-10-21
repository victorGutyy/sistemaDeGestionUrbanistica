import { Prisma } from '../../generated/prisma/client.js';
import { pesos, porcentaje, type FilaReporte, type SeccionReporte } from '../modelo.js';

// Un egreso vigente (RF-REP-06): un movimiento de gasto, o un pago de nómina (que se cuenta como categoría Nómina y no
// pertenece a ningún proyecto, igual que en el consolidado de caja).
export interface EgresoParaReporte {
  categoria: string;
  // null = general de la empresa.
  proyecto: string | null;
  valor: Prisma.Decimal;
}

export const NOMBRE_SIN_PROYECTO = 'General (sin proyecto)';

interface Grupo {
  nombre: string;
  cantidad: number;
  total: Prisma.Decimal;
}

const CERO = () => new Prisma.Decimal(0);

function ordenar(grupos: Grupo[]): Grupo[] {
  return grupos.sort((a, b) => b.total.comparedTo(a.total) || a.nombre.localeCompare(b.nombre, 'es'));
}

function agrupar(egresos: EgresoParaReporte[], nombreDe: (egreso: EgresoParaReporte) => string): Grupo[] {
  const grupos = new Map<string, Grupo>();
  for (const egreso of egresos) {
    const nombre = nombreDe(egreso);
    const grupo = grupos.get(nombre) ?? { nombre, cantidad: 0, total: CERO() };
    grupo.cantidad += 1;
    grupo.total = grupo.total.plus(egreso.valor);
    grupos.set(nombre, grupo);
  }
  return ordenar([...grupos.values()]);
}

function seccionDeResumen(titulo: string, etiqueta: string, grupos: Grupo[], total: Prisma.Decimal, cantidad: number): SeccionReporte {
  return {
    titulo,
    columnas: [
      { clave: 'nombre', encabezado: etiqueta, tipo: 'texto', peso: 3 },
      { clave: 'cantidad', encabezado: 'Egresos', tipo: 'entero' },
      { clave: 'total', encabezado: 'Total', tipo: 'pesos', peso: 1.5 },
      { clave: 'porcentaje', encabezado: '% del total', tipo: 'texto' },
    ],
    filas: grupos.map((g): FilaReporte => ({ nombre: g.nombre, cantidad: g.cantidad, total: pesos(g.total), porcentaje: porcentaje(g.total, total) })),
    totales: { nombre: 'Total', cantidad, total: pesos(total), porcentaje: total.isZero() ? '0 %' : '100 %' },
  };
}

// Egresos por categoría y proyecto (RF-REP-06): por categoría, por proyecto y la tabla que cruza las dos.
export function construirEgresos(egresos: EgresoParaReporte[]): SeccionReporte[] {
  const total = egresos.reduce((suma, egreso) => suma.plus(egreso.valor), CERO());
  const cantidad = egresos.length;
  const nombreProyecto = (egreso: EgresoParaReporte) => egreso.proyecto ?? NOMBRE_SIN_PROYECTO;

  const porCategoria = agrupar(egresos, (e) => e.categoria);
  // Columnas de la tabla cruzada: un proyecto por columna (el general, al final).
  const proyectos = agrupar(egresos, nombreProyecto)
    .map((g) => g.nombre)
    .sort((a, b) => (a === NOMBRE_SIN_PROYECTO ? 1 : b === NOMBRE_SIN_PROYECTO ? -1 : a.localeCompare(b, 'es')));

  const totalesPorProyecto = new Map<string, Prisma.Decimal>();
  const celdas = new Map<string, Prisma.Decimal>();
  for (const egreso of egresos) {
    const proyecto = nombreProyecto(egreso);
    const clave = `${egreso.categoria}\u0000${proyecto}`;
    celdas.set(clave, (celdas.get(clave) ?? CERO()).plus(egreso.valor));
    totalesPorProyecto.set(proyecto, (totalesPorProyecto.get(proyecto) ?? CERO()).plus(egreso.valor));
  }

  const cruzada: SeccionReporte = {
    titulo: 'Categoría por proyecto',
    columnas: [
      { clave: 'categoria', encabezado: 'Categoría', tipo: 'texto', peso: 2.5 },
      ...proyectos.map((proyecto, indice) => ({ clave: `p${indice}`, encabezado: proyecto, tipo: 'pesos' as const, peso: 1.5 })),
      { clave: 'total', encabezado: 'Total', tipo: 'pesos' as const, peso: 1.5 },
    ],
    filas: porCategoria.map((categoria): FilaReporte => {
      const fila: FilaReporte = { categoria: categoria.nombre, total: pesos(categoria.total) };
      proyectos.forEach((proyecto, indice) => {
        fila[`p${indice}`] = pesos(celdas.get(`${categoria.nombre}\u0000${proyecto}`) ?? 0);
      });
      return fila;
    }),
    totales: {
      categoria: 'Total',
      total: pesos(total),
      ...Object.fromEntries(proyectos.map((proyecto, indice) => [`p${indice}`, pesos(totalesPorProyecto.get(proyecto) ?? 0)])),
    },
  };

  return [
    seccionDeResumen('Por categoría', 'Categoría', porCategoria, total, cantidad),
    seccionDeResumen('Por proyecto', 'Proyecto', agrupar(egresos, nombreProyecto), total, cantidad),
    cruzada,
  ];
}
