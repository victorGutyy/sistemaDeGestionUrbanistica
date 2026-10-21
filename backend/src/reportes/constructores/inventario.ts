import { Prisma } from '../../generated/prisma/client.js';
import { EstadoLote } from '../../generated/prisma/enums.js';
import { pesos, recortarDetalle, type FilaReporte, type SeccionReporte } from '../modelo.js';

export interface LoteParaInventario {
  proyecto: string;
  manzana: string | null;
  numero: string;
  area: Prisma.Decimal;
  // Precio de lista.
  valorVenta: Prisma.Decimal;
  estado: EstadoLote;
}

export const ETIQUETA_ESTADO_LOTE: Record<EstadoLote, string> = {
  DISPONIBLE: 'Disponible',
  SEPARADO: 'Separado',
  VENDIDO: 'Vendido',
  ESCRITURADO: 'Escriturado',
  DESISTIDO: 'Desistido',
};

const ESTADOS: EstadoLote[] = ['DISPONIBLE', 'SEPARADO', 'VENDIDO', 'ESCRITURADO', 'DESISTIDO'];
const CERO = () => new Prisma.Decimal(0);

const nombreDelLote = (lote: LoteParaInventario) => (lote.manzana ? `${lote.manzana}-${lote.numero}` : lote.numero);

// Inventario de lotes por estado (RF-REP-07). Los resúmenes cuentan todos los lotes; el detalle (lote por lote) sale
// solo si se pide un estado concreto, para no repetir mil filas cuando lo que se quiere es el panorama.
export function construirInventario(lotes: LoteParaInventario[], estadoDetalle?: EstadoLote): SeccionReporte[] {
  const proyectos = [...new Set(lotes.map((lote) => lote.proyecto))].sort((a, b) => a.localeCompare(b, 'es'));

  const porProyecto: FilaReporte[] = proyectos.map((proyecto) => {
    const delProyecto = lotes.filter((lote) => lote.proyecto === proyecto);
    const fila: FilaReporte = { proyecto, total: delProyecto.length };
    for (const estado of ESTADOS) fila[estado] = delProyecto.filter((lote) => lote.estado === estado).length;
    return fila;
  });
  const totalesPorProyecto: FilaReporte = { proyecto: 'Total', total: lotes.length };
  for (const estado of ESTADOS) totalesPorProyecto[estado] = lotes.filter((lote) => lote.estado === estado).length;

  const porEstado: FilaReporte[] = ESTADOS.map((estado) => {
    const delEstado = lotes.filter((lote) => lote.estado === estado);
    return {
      estado: ETIQUETA_ESTADO_LOTE[estado],
      lotes: delEstado.length,
      area: Math.round(delEstado.reduce((suma, lote) => suma.plus(lote.area), CERO()).toNumber()),
      valor: pesos(delEstado.reduce((suma, lote) => suma.plus(lote.valorVenta), CERO())),
    };
  });

  const secciones: SeccionReporte[] = [
    {
      titulo: 'Lotes por proyecto y estado',
      columnas: [
        { clave: 'proyecto', encabezado: 'Proyecto', tipo: 'texto', peso: 3 },
        ...ESTADOS.map((estado) => ({ clave: estado, encabezado: ETIQUETA_ESTADO_LOTE[estado], tipo: 'entero' as const })),
        { clave: 'total', encabezado: 'Total', tipo: 'entero' as const },
      ],
      filas: porProyecto,
      totales: totalesPorProyecto,
    },
    {
      titulo: 'Valor de lista por estado',
      nota: 'El valor es el precio de lista de cada lote, no lo que se pactó en la venta.',
      columnas: [
        { clave: 'estado', encabezado: 'Estado', tipo: 'texto', peso: 2 },
        { clave: 'lotes', encabezado: 'Lotes', tipo: 'entero' },
        { clave: 'area', encabezado: 'Área (m²)', tipo: 'entero' },
        { clave: 'valor', encabezado: 'Valor de lista', tipo: 'pesos', peso: 2 },
      ],
      filas: porEstado,
      totales: {
        estado: 'Total',
        lotes: lotes.length,
        area: porEstado.reduce((suma, fila) => suma + Number(fila.area), 0),
        valor: pesos(lotes.reduce((suma, lote) => suma.plus(lote.valorVenta), CERO())),
      },
    },
  ];

  if (estadoDetalle) {
    const detalle = lotes
      .filter((lote) => lote.estado === estadoDetalle)
      .sort((a, b) => a.proyecto.localeCompare(b.proyecto, 'es') || (a.manzana ?? '').localeCompare(b.manzana ?? '', 'es') || a.numero.localeCompare(b.numero, 'es', { numeric: true }));
    const recortado = recortarDetalle(
      detalle.map((lote): FilaReporte => ({
        proyecto: lote.proyecto,
        lote: nombreDelLote(lote),
        area: lote.area.toString(),
        estado: ETIQUETA_ESTADO_LOTE[lote.estado],
        valor: pesos(lote.valorVenta),
      })),
    );
    secciones.push({
      titulo: `Lotes ${ETIQUETA_ESTADO_LOTE[estadoDetalle].toLowerCase()}s`,
      columnas: [
        { clave: 'proyecto', encabezado: 'Proyecto', tipo: 'texto', peso: 3 },
        { clave: 'lote', encabezado: 'Lote', tipo: 'texto' },
        { clave: 'area', encabezado: 'Área (m²)', tipo: 'texto' },
        { clave: 'estado', encabezado: 'Estado', tipo: 'texto' },
        { clave: 'valor', encabezado: 'Valor de lista', tipo: 'pesos', peso: 1.5 },
      ],
      filas: recortado.filas,
      filasTotales: recortado.filasTotales,
      totales: { proyecto: 'Total', lote: String(detalle.length), valor: pesos(detalle.reduce((suma, lote) => suma.plus(lote.valorVenta), CERO())) },
    });
  }

  return secciones;
}
