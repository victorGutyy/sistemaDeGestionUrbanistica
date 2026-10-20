import ExcelJS from 'exceljs';
import { diaLocal, formatearDiaDDMMAAAA } from '../cierres-caja/periodo.js';
import { ETIQUETA_ESTADO_COMISION } from './reglas-comision.js';
import type { EstadoComision, MedioPago, TipoVendedor } from '../generated/prisma/enums.js';

export interface FilaComision {
  estado: EstadoComision;
  valor: { toString(): string };
  tipoVendedor: TipoVendedor;
  motivoAnulacion: string | null;
  vendedor: { nombre: string; documento: string };
  venta: { fechaVenta: Date; cliente: { nombre: string }; lote: { numero: string; proyecto: { nombre: string }; manzana: { nombre: string } | null } };
  movimiento: { fecha: Date; medioPago: MedioPago } | null;
}

const diaDDMMAAAA = (fecha: Date) => formatearDiaDDMMAAAA(diaLocal(fecha));

const ETIQUETA_TIPO: Record<TipoVendedor, string> = { ASESOR_INMOBILIARIO: 'Asesor inmobiliario', REFERIDO: 'Referido' };

// Reporte de comisiones (RF-REP-08) en Excel: una fila por comisión y los totales por estado al final.
export async function generarExcelComisiones(
  filas: FilaComision[],
  empresa: { nombreComercial: string; razonSocial: string; nit: string },
  rango: { desde?: string; hasta?: string },
): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Comisiones');

  hoja.addRow([empresa.nombreComercial]).font = { bold: true, size: 14 };
  hoja.addRow([`${empresa.razonSocial} · NIT ${empresa.nit}`]);
  hoja.addRow(['Reporte de comisiones de venta']).font = { bold: true };
  hoja.addRow([`Período: ${rango.desde ? formatearDiaDDMMAAAA(rango.desde) : 'inicio'} a ${rango.hasta ? formatearDiaDDMMAAAA(rango.hasta) : 'hoy'}`]);
  hoja.addRow([]);

  const encabezado = hoja.addRow(['Fecha de venta', 'Proyecto', 'Lote', 'Cliente', 'Vendedor', 'Documento', 'Tipo', 'Valor', 'Estado', 'Fecha de pago', 'Medio de pago', 'Motivo de anulación']);
  encabezado.font = { bold: true };

  const totales = new Map<EstadoComision, { cantidad: number; valor: number }>();
  for (const fila of filas) {
    const valor = Number(fila.valor.toString());
    const acumulado = totales.get(fila.estado) ?? { cantidad: 0, valor: 0 };
    totales.set(fila.estado, { cantidad: acumulado.cantidad + 1, valor: acumulado.valor + valor });
    hoja.addRow([
      diaDDMMAAAA(fila.venta.fechaVenta),
      fila.venta.lote.proyecto.nombre,
      fila.venta.lote.manzana ? `${fila.venta.lote.manzana.nombre}-${fila.venta.lote.numero}` : fila.venta.lote.numero,
      fila.venta.cliente.nombre,
      fila.vendedor.nombre,
      fila.vendedor.documento,
      ETIQUETA_TIPO[fila.tipoVendedor],
      valor,
      ETIQUETA_ESTADO_COMISION[fila.estado],
      fila.movimiento ? diaDDMMAAAA(fila.movimiento.fecha) : '',
      fila.movimiento?.medioPago ?? '',
      fila.motivoAnulacion ?? '',
    ]);
  }
  hoja.getColumn(8).numFmt = '"$"#,##0';

  hoja.addRow([]);
  hoja.addRow(['Totales por estado']).font = { bold: true };
  for (const estado of ['PENDIENTE', 'PAGADA', 'ANULADA'] as const) {
    const total = totales.get(estado) ?? { cantidad: 0, valor: 0 };
    const fila = hoja.addRow([ETIQUETA_ESTADO_COMISION[estado], `${total.cantidad} comisión(es)`, total.valor]);
    fila.getCell(3).numFmt = '"$"#,##0';
  }

  hoja.columns.forEach((columna) => {
    columna.width = 22;
  });

  return Buffer.from(await libro.xlsx.writeBuffer());
}
