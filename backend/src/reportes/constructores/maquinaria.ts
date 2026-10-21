import { Prisma } from '../../generated/prisma/client.js';
import type { EstadoEquipo, TipoMovimiento } from '../../generated/prisma/enums.js';
import { pesos, type FilaReporte, type SeccionReporte } from '../modelo.js';

export interface EquipoParaReporte {
  id: string;
  proyecto: string;
  nombre: string;
  placaSerie: string | null;
  tipo: string;
  estado: EstadoEquipo;
  // Dado de baja (se conserva con todo lo que movió).
  baja: boolean;
}

// Un movimiento vigente de un proyecto de maquinaria: de un equipo, o "general de la flota" (equipoId null y flota true).
export interface MovimientoDeMaquinaria {
  equipoId: string | null;
  proyecto: string;
  tipo: TipoMovimiento;
  valor: Prisma.Decimal;
}

const ETIQUETA_ESTADO: Record<EstadoEquipo, string> = {
  ACTIVO: 'Activo',
  EN_MANTENIMIENTO: 'En mantenimiento',
  FUERA_DE_SERVICIO: 'Fuera de servicio',
};

const CERO = () => new Prisma.Decimal(0);

interface Acumulado {
  ingresos: Prisma.Decimal;
  egresos: Prisma.Decimal;
}

// Ingresos, egresos y utilidad por equipo en el rango de fechas, comparando todos los equipos en un solo listado (RF-MAQ-05).
// Los gastos generales de la flota (que no son de un equipo) salen en su propia fila por proyecto, para que el total del
// listado coincida con lo que muestran las finanzas del proyecto.
export function construirMaquinariaPorEquipo(equipos: EquipoParaReporte[], movimientos: MovimientoDeMaquinaria[]): SeccionReporte[] {
  const porEquipo = new Map<string, Acumulado>();
  const flota = new Map<string, Acumulado>();
  const acumular = (mapa: Map<string, Acumulado>, clave: string, movimiento: MovimientoDeMaquinaria) => {
    const actual = mapa.get(clave) ?? { ingresos: CERO(), egresos: CERO() };
    if (movimiento.tipo === 'INGRESO') actual.ingresos = actual.ingresos.plus(movimiento.valor);
    else actual.egresos = actual.egresos.plus(movimiento.valor);
    mapa.set(clave, actual);
  };
  for (const movimiento of movimientos) {
    if (movimiento.equipoId) acumular(porEquipo, movimiento.equipoId, movimiento);
    else acumular(flota, movimiento.proyecto, movimiento);
  }

  interface Fila {
    proyecto: string;
    equipo: string;
    tipo: string;
    estado: string;
    acumulado: Acumulado;
    utilidad: Prisma.Decimal;
  }
  const filas: Fila[] = [];
  for (const equipo of equipos) {
    const acumulado = porEquipo.get(equipo.id) ?? { ingresos: CERO(), egresos: CERO() };
    // Un equipo dado de baja sin movimientos en el rango no aporta nada al listado.
    if (equipo.baja && acumulado.ingresos.isZero() && acumulado.egresos.isZero()) continue;
    filas.push({
      proyecto: equipo.proyecto,
      equipo: equipo.placaSerie ? `${equipo.nombre} (${equipo.placaSerie})` : equipo.nombre,
      tipo: equipo.tipo,
      estado: equipo.baja ? 'Dado de baja' : ETIQUETA_ESTADO[equipo.estado],
      acumulado,
      utilidad: acumulado.ingresos.minus(acumulado.egresos),
    });
  }
  for (const [proyecto, acumulado] of flota) {
    filas.push({ proyecto, equipo: 'Flota (gastos generales)', tipo: '—', estado: '—', acumulado, utilidad: acumulado.ingresos.minus(acumulado.egresos) });
  }
  // Primero lo que más utilidad dejó; a igual valor, por proyecto y nombre.
  filas.sort((a, b) => b.utilidad.comparedTo(a.utilidad) || a.proyecto.localeCompare(b.proyecto, 'es') || a.equipo.localeCompare(b.equipo, 'es'));

  const totalIngresos = filas.reduce((suma, fila) => suma.plus(fila.acumulado.ingresos), CERO());
  const totalEgresos = filas.reduce((suma, fila) => suma.plus(fila.acumulado.egresos), CERO());

  return [
    {
      titulo: 'Utilidad por equipo',
      nota: 'Utilidad = ingresos (alquileres) menos egresos (combustible, mantenimiento, repuestos, operario…). Los equipos están ordenados de mayor a menor utilidad.',
      columnas: [
        { clave: 'proyecto', encabezado: 'Proyecto', tipo: 'texto', peso: 2 },
        { clave: 'equipo', encabezado: 'Equipo', tipo: 'texto', peso: 3 },
        { clave: 'tipo', encabezado: 'Tipo', tipo: 'texto', peso: 1.5 },
        { clave: 'estado', encabezado: 'Estado', tipo: 'texto', peso: 1.5 },
        { clave: 'ingresos', encabezado: 'Ingresos', tipo: 'pesos', peso: 1.5 },
        { clave: 'egresos', encabezado: 'Egresos', tipo: 'pesos', peso: 1.5 },
        { clave: 'utilidad', encabezado: 'Utilidad', tipo: 'pesos', peso: 1.5 },
      ],
      filas: filas.map(
        (fila): FilaReporte => ({
          proyecto: fila.proyecto,
          equipo: fila.equipo,
          tipo: fila.tipo,
          estado: fila.estado,
          ingresos: pesos(fila.acumulado.ingresos),
          egresos: pesos(fila.acumulado.egresos),
          utilidad: pesos(fila.utilidad),
        }),
      ),
      totales: { proyecto: 'Total', ingresos: pesos(totalIngresos), egresos: pesos(totalEgresos), utilidad: pesos(totalIngresos.minus(totalEgresos)) },
    },
  ];
}
