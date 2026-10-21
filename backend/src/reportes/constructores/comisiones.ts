import { Prisma } from '../../generated/prisma/client.js';
import { ETIQUETA_MEDIO_PAGO } from '../../common/medio-pago.js';
import type { EstadoComision, MedioPago, TipoVendedor } from '../../generated/prisma/enums.js';
import { ETIQUETA_ESTADO_COMISION } from '../../comisiones/reglas-comision.js';
import { pesos, recortarDetalle, type FilaReporte, type SeccionReporte } from '../modelo.js';

export interface ComisionParaReporte {
  // "aaaa-mm-dd" de la venta
  fechaVenta: string;
  proyecto: string;
  lote: string;
  cliente: string;
  vendedor: string;
  tipoVendedor: TipoVendedor;
  valor: Prisma.Decimal;
  estado: EstadoComision;
  fechaPago: string | null;
  medioPago: MedioPago | null;
  motivoAnulacion: string | null;
}

const ETIQUETA_TIPO: Record<TipoVendedor, string> = { ASESOR_INMOBILIARIO: 'Asesor inmobiliario', REFERIDO: 'Referido' };
const ESTADOS: EstadoComision[] = ['PENDIENTE', 'PAGADA', 'ANULADA'];
const CERO = () => new Prisma.Decimal(0);

// Reporte de comisiones (RF-REP-08): por estado, por vendedor y el detalle de cada una.
export function construirComisiones(comisiones: ComisionParaReporte[]): SeccionReporte[] {
  const suma = (lista: ComisionParaReporte[]) => lista.reduce((total, c) => total.plus(c.valor), CERO());

  const porEstado: SeccionReporte = {
    titulo: 'Por estado',
    columnas: [
      { clave: 'estado', encabezado: 'Estado', tipo: 'texto', peso: 2 },
      { clave: 'cantidad', encabezado: 'Comisiones', tipo: 'entero' },
      { clave: 'valor', encabezado: 'Valor', tipo: 'pesos', peso: 1.5 },
    ],
    filas: ESTADOS.map((estado): FilaReporte => {
      const delEstado = comisiones.filter((c) => c.estado === estado);
      return { estado: ETIQUETA_ESTADO_COMISION[estado], cantidad: delEstado.length, valor: pesos(suma(delEstado)) };
    }),
    totales: { estado: 'Total', cantidad: comisiones.length, valor: pesos(suma(comisiones)) },
  };

  const vendedores = [...new Set(comisiones.map((c) => c.vendedor))].sort((a, b) => a.localeCompare(b, 'es'));
  const porVendedor: SeccionReporte = {
    titulo: 'Por vendedor',
    columnas: [
      { clave: 'vendedor', encabezado: 'Vendedor', tipo: 'texto', peso: 3 },
      { clave: 'tipo', encabezado: 'Tipo', tipo: 'texto', peso: 2 },
      { clave: 'cantidad', encabezado: 'Comisiones', tipo: 'entero' },
      { clave: 'pendiente', encabezado: 'Por pagar', tipo: 'pesos', peso: 1.5 },
      { clave: 'pagada', encabezado: 'Pagado', tipo: 'pesos', peso: 1.5 },
      { clave: 'anulada', encabezado: 'Anulado', tipo: 'pesos', peso: 1.5 },
    ],
    filas: vendedores.map((vendedor): FilaReporte => {
      const suyas = comisiones.filter((c) => c.vendedor === vendedor);
      return {
        vendedor,
        tipo: ETIQUETA_TIPO[suyas[0].tipoVendedor],
        cantidad: suyas.length,
        pendiente: pesos(suma(suyas.filter((c) => c.estado === 'PENDIENTE'))),
        pagada: pesos(suma(suyas.filter((c) => c.estado === 'PAGADA'))),
        anulada: pesos(suma(suyas.filter((c) => c.estado === 'ANULADA'))),
      };
    }),
    totales: {
      vendedor: 'Total',
      cantidad: comisiones.length,
      pendiente: pesos(suma(comisiones.filter((c) => c.estado === 'PENDIENTE'))),
      pagada: pesos(suma(comisiones.filter((c) => c.estado === 'PAGADA'))),
      anulada: pesos(suma(comisiones.filter((c) => c.estado === 'ANULADA'))),
    },
  };

  const detalle = recortarDetalle(
    [...comisiones]
      .sort((a, b) => a.fechaVenta.localeCompare(b.fechaVenta) || a.vendedor.localeCompare(b.vendedor, 'es'))
      .map((c): FilaReporte => ({
        fechaVenta: c.fechaVenta,
        proyecto: c.proyecto,
        lote: c.lote,
        cliente: c.cliente,
        vendedor: c.vendedor,
        valor: pesos(c.valor),
        estado: ETIQUETA_ESTADO_COMISION[c.estado],
        fechaPago: c.fechaPago,
        medio: c.medioPago ? ETIQUETA_MEDIO_PAGO[c.medioPago] : null,
        motivo: c.motivoAnulacion,
      })),
  );

  return [
    porEstado,
    porVendedor,
    {
      titulo: 'Detalle de comisiones',
      columnas: [
        { clave: 'fechaVenta', encabezado: 'Venta', tipo: 'fecha' },
        { clave: 'proyecto', encabezado: 'Proyecto', tipo: 'texto', peso: 2 },
        { clave: 'lote', encabezado: 'Lote', tipo: 'texto', peso: 0.8 },
        { clave: 'cliente', encabezado: 'Cliente', tipo: 'texto', peso: 3 },
        { clave: 'vendedor', encabezado: 'Vendedor', tipo: 'texto', peso: 2.5 },
        { clave: 'valor', encabezado: 'Valor', tipo: 'pesos', peso: 1.4 },
        { clave: 'estado', encabezado: 'Estado', tipo: 'texto', peso: 1.2 },
        { clave: 'fechaPago', encabezado: 'Pago', tipo: 'fecha' },
        { clave: 'medio', encabezado: 'Medio', tipo: 'texto', peso: 1.3 },
        { clave: 'motivo', encabezado: 'Motivo de anulación', tipo: 'texto', peso: 3 },
      ],
      filas: detalle.filas,
      filasTotales: detalle.filasTotales,
      totales: { fechaVenta: 'Total', valor: pesos(suma(comisiones)) },
    },
  ];
}
