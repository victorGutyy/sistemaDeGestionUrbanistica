import { valorEnLetras } from '../common/numero-a-letras.js';
import { ETIQUETA_MEDIO_PAGO } from '../common/medio-pago.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { MedioPago } from '../generated/prisma/enums.js';

// "Fotografía" de un recibo de caja: lo que se imprimió el día que se emitió. Se guarda tal cual en la base de
// datos, así que si luego cambia el nombre del cliente, el precio del lote o la configuración de la empresa,
// el recibo ya emitido no cambia (RF-REC-06). El PDF siempre se genera a partir de esta fotografía.

export interface EmpresaRecibo {
  nombreComercial: string;
  razonSocial: string;
  nit: string;
  direccion: string | null;
  telefonos: string | null;
  correo: string | null;
  // Ruta del logo en el almacenamiento (el archivo se conserva aunque luego se cambie el logo).
  logoRuta: string | null;
  colorPrimario: string;
  textoLegal: string | null;
}

export interface ContenidoRecibo {
  version: 1;
  numeroTexto: string;
  fechaEmision: string;
  esHistorico: boolean;
  empresa: EmpresaRecibo;
  cliente: { nombre: string; documento: string };
  proyecto: string;
  manzana: string | null;
  lote: string;
  fechaAbono: string;
  valor: string;
  valorEnLetras: string;
  medioPago: MedioPago;
  medioPagoEtiqueta: string;
  cuenta: { banco: string; alias: string; numero: string } | null;
  referencia: string | null;
  conSoporte: boolean;
  cuotasCubiertas: { numero: number; etiqueta: string; valor: string; completa: boolean }[];
  saldoAnterior: string;
  saldoNuevo: string;
  recibidoPor: string;
}

export function etiquetaCuotaRecibo(numero: number): string {
  return numero === 0 ? 'Cuota inicial' : `Cuota ${numero}`;
}

export interface EntradaContenidoRecibo {
  numeroTexto: string;
  esHistorico: boolean;
  fechaEmision: Date;
  empresa: EmpresaRecibo;
  cliente: { nombre: string; documento: string };
  proyecto: string;
  manzana: string | null;
  lote: string;
  fechaAbono: Date;
  valor: Prisma.Decimal;
  medioPago: MedioPago;
  cuenta: { banco: string; alias: string; numero: string } | null;
  referencia: string | null;
  conSoporte: boolean;
  cuotasCubiertas: { numero: number; valor: Prisma.Decimal; completa: boolean }[];
  saldoAnterior: Prisma.Decimal;
  saldoNuevo: Prisma.Decimal;
  recibidoPor: string;
}

// Los abonos nuevos son en pesos enteros, pero los datos antiguos pueden traer centavos: se dicen aparte
// ("... PESOS M/CTE Y 67 CENTAVOS") para que el recibo histórico se pueda emitir igual.
export function valorRecibidoEnLetras(valor: Prisma.Decimal): string {
  const enteros = valor.floor();
  const centavos = valor.minus(enteros).mul(100).round().toNumber();
  const letras = valorEnLetras(enteros);
  return centavos > 0 ? `${letras} Y ${centavos} CENTAVOS` : letras;
}

export function construirContenidoRecibo(entrada: EntradaContenidoRecibo): ContenidoRecibo {
  return {
    version: 1,
    numeroTexto: entrada.numeroTexto,
    fechaEmision: entrada.fechaEmision.toISOString(),
    esHistorico: entrada.esHistorico,
    empresa: entrada.empresa,
    cliente: entrada.cliente,
    proyecto: entrada.proyecto,
    manzana: entrada.manzana,
    lote: entrada.lote,
    fechaAbono: entrada.fechaAbono.toISOString(),
    valor: entrada.valor.toString(),
    valorEnLetras: valorRecibidoEnLetras(entrada.valor),
    medioPago: entrada.medioPago,
    medioPagoEtiqueta: ETIQUETA_MEDIO_PAGO[entrada.medioPago],
    cuenta: entrada.cuenta,
    referencia: entrada.referencia,
    conSoporte: entrada.conSoporte,
    cuotasCubiertas: entrada.cuotasCubiertas.map((cuota) => ({
      numero: cuota.numero,
      etiqueta: etiquetaCuotaRecibo(cuota.numero),
      valor: cuota.valor.toString(),
      completa: cuota.completa,
    })),
    saldoAnterior: entrada.saldoAnterior.toString(),
    saldoNuevo: entrada.saldoNuevo.toString(),
    recibidoPor: entrada.recibidoPor,
  };
}

interface FilaEmpresa {
  nombreComercial: string;
  razonSocial: string;
  nit: string;
  direccion: string | null;
  telefonos: string | null;
  correo: string | null;
  logoRuta: string | null;
  colorPrimario: string;
  textoLegalRecibo: string | null;
  prefijoRecibo: string;
}

// Los datos de la empresa que se "congelan" en cada recibo, tomados de la fila de configuración.
export function empresaParaRecibo(empresa: FilaEmpresa): EmpresaRecibo {
  return {
    nombreComercial: empresa.nombreComercial,
    razonSocial: empresa.razonSocial,
    nit: empresa.nit,
    direccion: empresa.direccion,
    telefonos: empresa.telefonos,
    correo: empresa.correo,
    logoRuta: empresa.logoRuta,
    colorPrimario: empresa.colorPrimario,
    textoLegal: empresa.textoLegalRecibo,
  };
}
