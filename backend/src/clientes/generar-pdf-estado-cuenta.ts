import PDFDocument from 'pdfkit';
import { ajustarAlAncho } from '../common/pdf-texto.js';
import { formatearCOP } from '../common/formato.util.js';
import { ETIQUETA_MEDIO_PAGO } from '../common/medio-pago.js';
import { ETIQUETA_TIPO_DOCUMENTO } from '../common/tipo-documento.js';
import type { EstadoCuentaCliente } from './estado-cuenta-cliente.js';

export interface EmpresaPdfEstadoCuenta {
  nombreComercial: string;
  razonSocial: string;
  nit: string;
  direccion: string | null;
  telefonos: string | null;
  correo: string | null;
  colorPrimario: string;
}

export interface OpcionesPdfEstadoCuenta {
  empresa: EmpresaPdfEstadoCuenta;
  // Imagen del logo ya leída del almacenamiento (solo PNG o JPG).
  logo?: Buffer;
  generadoEn?: Date;
}

const FORMATO_FECHA = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' });
const FORMATO_FECHA_HORA = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const ETIQUETA_SEMAFORO = { VERDE: 'Al día', AMARILLO: 'Próximo a vencer', ROJO: 'En mora' } as const;
const COLOR_SEMAFORO = { VERDE: '#166534', AMARILLO: '#92400e', ROJO: '#991b1b' } as const;
const ETIQUETA_ESTADO_VENTA = {
  ACTIVA: 'Vigente',
  PENDIENTE_APROBACION: 'Pendiente de aprobación',
  RECHAZADA: 'Rechazada',
  DESISTIDA: 'Desistida',
} as const;
const ETIQUETA_ESTADO_CUOTA = { PENDIENTE: 'Pendiente', PARCIAL: 'Parcial', PAGADA: 'Pagada' } as const;

const colorSeguro = (color: string) => (/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#2563eb');
const etiquetaCuota = (numero: number) => (numero === 0 ? 'Cuota inicial' : `Cuota ${numero}`);

// Estado de cuenta del cliente en PDF (RF-REP-03): datos del cliente, resumen de cartera y, por cada venta, sus cuotas
// y sus abonos (los anulados se muestran marcados y no cuentan). Sale de la misma estructura que la ficha de pantalla.
export function generarPdfEstadoCuenta(estado: EstadoCuentaCliente, opciones: OpcionesPdfEstadoCuenta): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const titulo = `Estado de cuenta - ${estado.cliente.nombre}`;
    const documento = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true, info: { Title: titulo } });
    const trozos: Buffer[] = [];
    documento.on('data', (trozo: Buffer) => trozos.push(trozo));
    documento.on('end', () => resolve(Buffer.concat(trozos)));
    documento.on('error', reject);

    const color = colorSeguro(opciones.empresa.colorPrimario);
    const ancho = documento.page.width - 80;
    const { cliente, resumen } = estado;

    const asegurarEspacio = (alto: number) => {
      if (documento.y + alto > documento.page.height - 60) documento.addPage();
    };
    const seccion = (nombre: string) => {
      asegurarEspacio(60);
      documento.moveDown(0.8);
      documento.font('Helvetica-Bold').fontSize(10.5).fillColor(color).text(nombre.toUpperCase(), 40, documento.y, { width: ancho });
      documento.moveTo(40, documento.y + 2).lineTo(40 + ancho, documento.y + 2).strokeColor('#e2e8f0').lineWidth(1).stroke();
      documento.moveDown(0.5);
    };
    const fila = (columnas: { texto: string; ancho: number; derecha?: boolean; negrita?: boolean; color?: string }[], alto = 14) => {
      asegurarEspacio(alto + 4);
      const y = documento.y;
      let x = 40;
      for (const columna of columnas) {
        documento.font(columna.negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).fillColor(columna.color ?? '#0f172a');
        documento.text(ajustarAlAncho(documento, columna.texto, columna.ancho - 6), x, y, { width: columna.ancho - 6, align: columna.derecha ? 'right' : 'left', lineBreak: false });
        x += columna.ancho;
      }
      documento.y = y + alto;
    };

    // ---- Encabezado ----
    let xTexto = 40;
    if (opciones.logo) {
      try {
        documento.image(opciones.logo, 40, 40, { fit: [60, 60] });
        xTexto = 110;
      } catch {
        // Un logo que no se pueda dibujar no debe impedir generar el estado de cuenta.
      }
    }
    documento.fillColor('#0f172a').font('Helvetica-Bold').fontSize(15).text(opciones.empresa.nombreComercial, xTexto, 42, { width: ancho - 200 });
    documento.font('Helvetica').fontSize(9).fillColor('#475569');
    documento.text(`${opciones.empresa.razonSocial} · NIT ${opciones.empresa.nit}`, xTexto, documento.y + 1, { width: ancho - 200 });
    const contacto = [opciones.empresa.direccion, opciones.empresa.telefonos, opciones.empresa.correo].filter(Boolean).join(' · ');
    if (contacto) documento.text(contacto, xTexto, documento.y + 1, { width: ancho - 200 });

    const xCaja = documento.page.width - 40 - 180;
    documento.roundedRect(xCaja, 40, 180, 64, 6).lineWidth(1.2).strokeColor(color).stroke();
    documento.fillColor(color).font('Helvetica-Bold').fontSize(10).text('ESTADO DE CUENTA', xCaja, 52, { width: 180, align: 'center' });
    documento.fillColor('#0f172a').font('Helvetica').fontSize(8.5).text(`Al ${FORMATO_FECHA.format(opciones.generadoEn ?? new Date())}`, xCaja, 70, { width: 180, align: 'center' });
    documento.fillColor(COLOR_SEMAFORO[resumen.semaforo]).font('Helvetica-Bold').fontSize(9).text(ETIQUETA_SEMAFORO[resumen.semaforo], xCaja, 84, { width: 180, align: 'center' });

    // ---- Cliente ----
    documento.y = 118;
    documento.font('Helvetica-Bold').fontSize(12).fillColor('#0f172a').text(cliente.nombre, 40, documento.y, { width: ancho });
    documento.font('Helvetica').fontSize(9).fillColor('#475569');
    documento.text(`${ETIQUETA_TIPO_DOCUMENTO[cliente.tipoDocumento]}: ${cliente.documento}`, 40, documento.y + 1, { width: ancho });
    const datosContacto = [cliente.telefono && `Tel. ${cliente.telefono}`, cliente.email, cliente.direccion].filter(Boolean).join(' · ');
    if (datosContacto) documento.text(datosContacto, 40, documento.y + 1, { width: ancho });

    // ---- Resumen ----
    seccion('Resumen');
    const c2 = [{ ancho: ancho * 0.7 }, { ancho: ancho * 0.3 }];
    const fila2 = (texto: string, valor: string, negrita = false, colorValor?: string) =>
      fila([{ texto, ancho: c2[0].ancho, negrita }, { texto: valor, ancho: c2[1].ancho, derecha: true, negrita, color: colorValor }]);
    fila2('Ventas vigentes', String(resumen.ventasVigentes));
    fila2('Total vendido', formatearCOP(resumen.totalVendido));
    fila2('Total pagado', formatearCOP(resumen.totalPagado));
    fila2('Saldo pendiente', formatearCOP(resumen.saldo), true);
    fila2(`Saldo vencido (${resumen.cuotasVencidas} cuota${resumen.cuotasVencidas === 1 ? '' : 's'})`, formatearCOP(resumen.saldoVencido), true, resumen.saldoVencido.greaterThan(0) ? '#991b1b' : undefined);
    fila2('Interés de mora (informativo)', estado.moraConfigurada ? formatearCOP(resumen.interesMora) : 'Sin tasa de mora definida');
    fila2('Saldo por vencer', formatearCOP(resumen.saldoPorVencer));

    // ---- Una sección por venta ----
    if (estado.ventas.length === 0) {
      seccion('Ventas');
      fila([{ texto: 'Este cliente no tiene ventas registradas.', ancho }]);
    }
    for (const venta of estado.ventas) {
      const lugar = `${venta.lote.proyecto}${venta.lote.manzana ? ` · Manzana ${venta.lote.manzana}` : ''} · Lote ${venta.lote.numero}`;
      seccion(`${lugar} (${ETIQUETA_ESTADO_VENTA[venta.estado]})`);
      documento.font('Helvetica').fontSize(8.5).fillColor('#475569').text(
        `${venta.formaPago === 'CONTADO' ? 'Venta de contado' : 'Venta financiada'} del ${FORMATO_FECHA.format(venta.fechaVenta)} · Valor total ${formatearCOP(venta.valorTotal)} · Pagado ${formatearCOP(venta.pagado)}${venta.saldo ? ` · Saldo ${formatearCOP(venta.saldo)}` : ''}`,
        40,
        documento.y,
        { width: ancho },
      );
      documento.moveDown(0.4);

      if (venta.cuotas.length > 0) {
        const cc = [0.17, 0.17, 0.18, 0.18, 0.15, 0.15].map((parte) => ({ ancho: ancho * parte }));
        fila([
          { texto: 'Cuota', ancho: cc[0].ancho, negrita: true },
          { texto: 'Vencimiento', ancho: cc[1].ancho, negrita: true },
          { texto: 'Valor', ancho: cc[2].ancho, derecha: true, negrita: true },
          { texto: 'Pagado', ancho: cc[3].ancho, derecha: true, negrita: true },
          { texto: 'Saldo', ancho: cc[4].ancho, derecha: true, negrita: true },
          { texto: 'Estado', ancho: cc[5].ancho, negrita: true },
        ]);
        for (const cuota of venta.cuotas) {
          const colorFila = cuota.vencida ? '#991b1b' : undefined;
          fila([
            { texto: etiquetaCuota(cuota.numero), ancho: cc[0].ancho, color: colorFila },
            { texto: FORMATO_FECHA.format(cuota.fechaVencimiento), ancho: cc[1].ancho, color: colorFila },
            { texto: formatearCOP(cuota.valor), ancho: cc[2].ancho, derecha: true },
            { texto: formatearCOP(cuota.pagado), ancho: cc[3].ancho, derecha: true },
            { texto: formatearCOP(cuota.saldo), ancho: cc[4].ancho, derecha: true },
            { texto: cuota.vencida ? `Vencida (${cuota.diasAtraso} d)` : ETIQUETA_ESTADO_CUOTA[cuota.estado], ancho: cc[5].ancho, color: colorFila },
          ]);
        }
      }

      documento.moveDown(0.4);
      documento.font('Helvetica-Bold').fontSize(8.5).fillColor('#334155').text(`Abonos (${venta.abonos.length})`, 40, documento.y, { width: ancho });
      documento.moveDown(0.2);
      if (venta.abonos.length === 0) {
        fila([{ texto: 'Sin abonos registrados.', ancho }]);
      } else {
        const ca = [0.14, 0.2, 0.2, 0.26, 0.2].map((parte) => ({ ancho: ancho * parte }));
        fila([
          { texto: 'Fecha', ancho: ca[0].ancho, negrita: true },
          { texto: 'Recibo', ancho: ca[1].ancho, negrita: true },
          { texto: 'Medio', ancho: ca[2].ancho, negrita: true },
          { texto: 'Cuenta', ancho: ca[3].ancho, negrita: true },
          { texto: 'Valor', ancho: ca[4].ancho, derecha: true, negrita: true },
        ]);
        for (const abono of venta.abonos) {
          const anulado = abono.estado === 'ANULADO';
          fila([
            { texto: FORMATO_FECHA.format(abono.fecha), ancho: ca[0].ancho, color: anulado ? '#94a3b8' : undefined },
            { texto: abono.recibo?.numeroTexto ?? '—', ancho: ca[1].ancho, color: anulado ? '#94a3b8' : undefined },
            { texto: ETIQUETA_MEDIO_PAGO[abono.medioPago] ?? abono.medioPago, ancho: ca[2].ancho, color: anulado ? '#94a3b8' : undefined },
            { texto: abono.cuentaDestino?.alias ?? '—', ancho: ca[3].ancho, color: anulado ? '#94a3b8' : undefined },
            { texto: `${formatearCOP(abono.valor)}${anulado ? ' (ANULADO)' : ''}`, ancho: ca[4].ancho, derecha: true, color: anulado ? '#94a3b8' : undefined },
          ]);
        }
      }
    }

    // Pie de cada hoja con la numeración de páginas.
    const rango = documento.bufferedPageRange();
    for (let i = rango.start; i < rango.start + rango.count; i += 1) {
      documento.switchToPage(i);
      documento.page.margins.bottom = 0;
      documento
        .font('Helvetica')
        .fontSize(7)
        .fillColor('#94a3b8')
        .text(`${titulo} · Generado el ${FORMATO_FECHA_HORA.format(opciones.generadoEn ?? new Date())} · Hoja ${i + 1} de ${rango.count}`, 40, documento.page.height - 30, {
          width: ancho,
          align: 'center',
          lineBreak: false,
        });
    }

    documento.end();
  });
}
