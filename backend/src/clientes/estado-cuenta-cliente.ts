import { resumirCartera } from '../cartera/cartera-venta.js';
import { evaluarCuotaPendiente, type ParametrosMora, type Semaforo } from '../cartera/mora.js';
import { Prisma } from '../generated/prisma/client.js';
import { EstadoAbono, EstadoCuota, EstadoVenta, type FormaPago, type MedioPago, type TipoDocumento } from '../generated/prisma/enums.js';

// ---------------------------------------------------------------------------------------------
// Estado de cuenta de un cliente (RF-CLI-03, RF-CAR-03 y RF-REP-03). Es una función pura: recibe lo que se leyó de la
// base y arma la ficha con todos los números calculados, que son los mismos que muestra la cartera (comparten
// `resumirCartera`). La ficha de pantalla y el PDF salen de esta misma estructura.
// ---------------------------------------------------------------------------------------------

export interface ClienteCrudo {
  id: string;
  nombre: string;
  documento: string;
  tipoDocumento: TipoDocumento;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  autorizaDatos: boolean;
  fechaAutorizacion: Date | null;
  autorizacionRegistradaPor: { nombre: string } | null;
  ventas: VentaCruda[];
}

export interface VentaCruda {
  id: string;
  estado: EstadoVenta;
  formaPago: FormaPago;
  fechaVenta: Date;
  valorTotal: Prisma.Decimal;
  cuotaInicial: Prisma.Decimal;
  lote: { id: string; numero: string; proyecto: { nombre: string }; manzana: { nombre: string } | null };
  cuotas: {
    numero: number;
    fechaVencimiento: Date;
    valor: Prisma.Decimal;
    estado: EstadoCuota;
    // Solo lo aplicado por abonos ACTIVOS.
    aplicaciones: { valor: Prisma.Decimal }[];
  }[];
  abonos: {
    id: string;
    fecha: Date;
    valor: Prisma.Decimal;
    medioPago: MedioPago;
    estado: EstadoAbono;
    recibo: { numeroTexto: string } | null;
    cuentaDestino: { alias: string } | null;
  }[];
}

export interface CuotaDeEstadoCuenta {
  numero: number;
  fechaVencimiento: Date;
  valor: Prisma.Decimal;
  pagado: Prisma.Decimal;
  saldo: Prisma.Decimal;
  estado: EstadoCuota;
  vencida: boolean;
  diasAtraso: number;
  interesMora: Prisma.Decimal;
}

export interface VentaDeEstadoCuenta {
  id: string;
  estado: EstadoVenta;
  formaPago: FormaPago;
  fechaVenta: Date;
  valorTotal: Prisma.Decimal;
  cuotaInicial: Prisma.Decimal;
  lote: { id: string; numero: string; proyecto: string; manzana: string | null };
  // Solo una venta ACTIVA cuenta en los totales y tiene saldo; una desistida, rechazada o pendiente se lista aparte.
  vigente: boolean;
  pagado: Prisma.Decimal;
  saldo: Prisma.Decimal | null;
  cartera: {
    semaforo: Semaforo;
    saldoVencido: Prisma.Decimal;
    interesMora: Prisma.Decimal;
    saldoPorVencer: Prisma.Decimal;
    cuotasVencidas: number;
    cuotasPendientes: number;
    proximaCuota: { numero: number; fechaVencimiento: Date; valor: Prisma.Decimal } | null;
  } | null;
  cuotas: CuotaDeEstadoCuenta[];
  abonos: VentaCruda['abonos'];
}

export interface EstadoCuentaCliente {
  cliente: Omit<ClienteCrudo, 'ventas'>;
  // false = la tasa de mora no está definida: el interés se muestra en $0 por falta de dato.
  moraConfigurada: boolean;
  resumen: {
    semaforo: Semaforo;
    ventasVigentes: number;
    totalVendido: Prisma.Decimal;
    totalPagado: Prisma.Decimal;
    saldo: Prisma.Decimal;
    saldoVencido: Prisma.Decimal;
    interesMora: Prisma.Decimal;
    saldoPorVencer: Prisma.Decimal;
    cuotasVencidas: number;
  };
  ventas: VentaDeEstadoCuenta[];
}

const CERO = new Prisma.Decimal(0);
const suma = (valores: Prisma.Decimal[]) => valores.reduce((total, valor) => total.plus(valor), CERO);

export function construirEstadoCuentaCliente(
  cliente: ClienteCrudo,
  opciones: { hoy: Date; mora: ParametrosMora; diasAlertaAmarilla: number },
): EstadoCuentaCliente {
  const { ventas: ventasCrudas, ...datosCliente } = cliente;

  const ventas = ventasCrudas.map((venta): VentaDeEstadoCuenta => {
    const vigente = venta.estado === EstadoVenta.ACTIVA;
    const pagado = suma(venta.abonos.filter((abono) => abono.estado === EstadoAbono.ACTIVO).map((abono) => abono.valor));
    const cuotasConPagado = venta.cuotas
      .slice()
      .sort((a, b) => a.numero - b.numero)
      .map((cuota) => ({ ...cuota, pagado: suma(cuota.aplicaciones.map((aplicacion) => aplicacion.valor)) }));

    const cuotas = cuotasConPagado.map((cuota): CuotaDeEstadoCuenta => {
      const evaluacion = vigente ? evaluarCuotaPendiente(cuota, cuota.aplicaciones, opciones.hoy, opciones.mora) : null;
      const saldo = cuota.valor.minus(cuota.pagado);
      return {
        numero: cuota.numero,
        fechaVencimiento: cuota.fechaVencimiento,
        valor: cuota.valor,
        pagado: cuota.pagado,
        saldo: saldo.isNegative() ? CERO : saldo,
        estado: cuota.estado,
        vencida: evaluacion?.vencida ?? false,
        diasAtraso: evaluacion?.vencida ? evaluacion.diasAtraso : 0,
        interesMora: evaluacion?.interesMora ?? CERO,
      };
    });

    const cartera = vigente ? resumirCartera(cuotasConPagado, opciones.hoy, opciones.mora, opciones.diasAlertaAmarilla) : null;

    return {
      id: venta.id,
      estado: venta.estado,
      formaPago: venta.formaPago,
      fechaVenta: venta.fechaVenta,
      valorTotal: venta.valorTotal,
      cuotaInicial: venta.cuotaInicial,
      lote: { id: venta.lote.id, numero: venta.lote.numero, proyecto: venta.lote.proyecto.nombre, manzana: venta.lote.manzana?.nombre ?? null },
      vigente,
      pagado,
      saldo: vigente ? venta.valorTotal.minus(pagado) : null,
      cartera: cartera
        ? {
            semaforo: cartera.semaforo,
            saldoVencido: cartera.saldoVencido,
            interesMora: cartera.interesMora,
            saldoPorVencer: cartera.saldoPorVencer,
            cuotasVencidas: cartera.cuotasVencidas,
            cuotasPendientes: cartera.cuotasPendientes,
            proximaCuota: cartera.proximaCuota
              ? { numero: cartera.proximaCuota.numero, fechaVencimiento: cartera.proximaCuota.fechaVencimiento, valor: cartera.proximaCuota.valor }
              : null,
          }
        : null,
      cuotas,
      abonos: venta.abonos.slice().sort((a, b) => a.fecha.getTime() - b.fecha.getTime()),
    };
  });

  // Los totales y el semáforo del cliente salen de TODAS sus cuotas vigentes juntas (el peor semáforo manda).
  const cuotasVigentes = ventasCrudas
    .filter((venta) => venta.estado === EstadoVenta.ACTIVA)
    .flatMap((venta) => venta.cuotas);
  const carteraTotal = resumirCartera(cuotasVigentes, opciones.hoy, opciones.mora, opciones.diasAlertaAmarilla);
  const vigentes = ventas.filter((venta) => venta.vigente);
  const totalVendido = suma(vigentes.map((venta) => venta.valorTotal));
  const totalPagado = suma(vigentes.map((venta) => venta.pagado));

  return {
    cliente: datosCliente,
    moraConfigurada: opciones.mora.tasaMoraMensual !== null,
    resumen: {
      semaforo: carteraTotal.semaforo,
      ventasVigentes: vigentes.length,
      totalVendido,
      totalPagado,
      saldo: totalVendido.minus(totalPagado),
      saldoVencido: carteraTotal.saldoVencido,
      interesMora: carteraTotal.interesMora,
      saldoPorVencer: carteraTotal.saldoPorVencer,
      cuotasVencidas: carteraTotal.cuotasVencidas,
    },
    ventas,
  };
}
