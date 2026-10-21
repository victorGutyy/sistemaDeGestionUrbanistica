import { ETIQUETA_MEDIO_PAGO } from '../../common/medio-pago.js';
import { Prisma } from '../../generated/prisma/client.js';
import { ETIQUETA_VERIFICACION } from '../../abonos/verificacion.js';
import type { EstadoVerificacion, MedioPago } from '../../generated/prisma/enums.js';
import { pesos, recortarDetalle, type FilaReporte, type SeccionReporte } from '../modelo.js';

// Un abono vigente de un cliente (RF-REP-04). Los anulados no entran: su dinero se revirtió.
export interface AbonoParaRecaudo {
  // "aaaa-mm-dd"
  fecha: string;
  recibo: string | null;
  cliente: string;
  proyecto: string;
  lote: string;
  medioPago: MedioPago;
  cuenta: string | null;
  referencia: string | null;
  valor: Prisma.Decimal;
  registradoPor: string | null;
  // Opcional: sin dato se trata como "no requiere".
  verificacion?: EstadoVerificacion;
}

interface Grupo {
  nombre: string;
  cantidad: number;
  total: Prisma.Decimal;
}

function agrupar(abonos: AbonoParaRecaudo[], nombreDe: (abono: AbonoParaRecaudo) => string): Grupo[] {
  const grupos = new Map<string, Grupo>();
  for (const abono of abonos) {
    const nombre = nombreDe(abono);
    const grupo = grupos.get(nombre) ?? { nombre, cantidad: 0, total: new Prisma.Decimal(0) };
    grupo.cantidad += 1;
    grupo.total = grupo.total.plus(abono.valor);
    grupos.set(nombre, grupo);
  }
  // Primero lo que más recaudó; a igual valor, por nombre (el orden siempre es el mismo).
  return [...grupos.values()].sort((a, b) => b.total.comparedTo(a.total) || a.nombre.localeCompare(b.nombre, 'es'));
}

function seccionDeResumen(titulo: string, etiqueta: string, grupos: Grupo[], total: Prisma.Decimal, cantidad: number): SeccionReporte {
  return {
    titulo,
    columnas: [
      { clave: 'nombre', encabezado: etiqueta, tipo: 'texto', peso: 3 },
      { clave: 'cantidad', encabezado: 'Abonos', tipo: 'entero' },
      { clave: 'total', encabezado: 'Recaudado', tipo: 'pesos', peso: 1.5 },
    ],
    filas: grupos.map((grupo): FilaReporte => ({ nombre: grupo.nombre, cantidad: grupo.cantidad, total: pesos(grupo.total) })),
    totales: { nombre: 'Total', cantidad, total: pesos(total) },
  };
}

// Reporte de recaudo (RF-REP-04): totales por medio de pago, por cuenta y por usuario, y el detalle con el recibo de cada abono.
export function construirRecaudo(abonos: AbonoParaRecaudo[]): SeccionReporte[] {
  const total = abonos.reduce((suma, abono) => suma.plus(abono.valor), new Prisma.Decimal(0));
  const cantidad = abonos.length;

  const detalleCompleto: FilaReporte[] = [...abonos]
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.recibo ?? '').localeCompare(b.recibo ?? ''))
    .map((abono) => ({
      fecha: abono.fecha,
      recibo: abono.recibo ?? '—',
      cliente: abono.cliente,
      proyecto: abono.proyecto,
      lote: abono.lote,
      medio: ETIQUETA_MEDIO_PAGO[abono.medioPago],
      cuenta: abono.cuenta ?? '—',
      referencia: abono.referencia ?? '—',
      usuario: abono.registradoPor ?? '—',
      verificacion: ETIQUETA_VERIFICACION[abono.verificacion ?? 'NO_REQUIERE'],
      valor: pesos(abono.valor),
    }));
  const detalle = recortarDetalle(detalleCompleto);

  return [
    seccionDeResumen('Por medio de pago', 'Medio de pago', agrupar(abonos, (a) => ETIQUETA_MEDIO_PAGO[a.medioPago]), total, cantidad),
    seccionDeResumen('Por cuenta', 'Cuenta', agrupar(abonos, (a) => a.cuenta ?? 'Efectivo (sin cuenta)'), total, cantidad),
    seccionDeResumen('Por usuario que lo registró', 'Usuario', agrupar(abonos, (a) => a.registradoPor ?? 'Sin registrar'), total, cantidad),
    seccionDeResumen('Por verificación bancaria', 'Verificación', agrupar(abonos, (a) => ETIQUETA_VERIFICACION[a.verificacion ?? 'NO_REQUIERE']), total, cantidad),
    {
      titulo: 'Detalle de abonos',
      columnas: [
        { clave: 'fecha', encabezado: 'Fecha', tipo: 'fecha' },
        { clave: 'recibo', encabezado: 'Recibo', tipo: 'texto', peso: 1.2 },
        { clave: 'cliente', encabezado: 'Cliente', tipo: 'texto', peso: 3 },
        { clave: 'proyecto', encabezado: 'Proyecto', tipo: 'texto', peso: 2 },
        { clave: 'lote', encabezado: 'Lote', tipo: 'texto', peso: 0.8 },
        { clave: 'medio', encabezado: 'Medio', tipo: 'texto', peso: 1.3 },
        { clave: 'cuenta', encabezado: 'Cuenta', tipo: 'texto', peso: 1.6 },
        { clave: 'referencia', encabezado: 'Referencia', tipo: 'texto', peso: 1.3 },
        { clave: 'usuario', encabezado: 'Registrado por', tipo: 'texto', peso: 1.8 },
        { clave: 'verificacion', encabezado: 'Verificación', tipo: 'texto', peso: 1.3 },
        { clave: 'valor', encabezado: 'Valor', tipo: 'pesos', peso: 1.4 },
      ],
      filas: detalle.filas,
      filasTotales: detalle.filasTotales,
      totales: { fecha: 'Total', valor: pesos(total) },
    },
  ];
}
