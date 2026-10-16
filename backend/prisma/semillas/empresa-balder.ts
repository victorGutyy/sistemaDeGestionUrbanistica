// Datos de ejemplo para la configuración inicial del primer cliente (Balder).
// Son SOLO valores iniciales: la app los lee de la base de datos y el gerente
// los edita desde "Configuración". El código de la aplicación no depende de
// este archivo; para otro cliente se cambia este archivo (o se omite) y listo.
//
// Lo que aún no confirma el cliente queda vacío o marcado "POR CONFIGURAR":
// la tasa de mora (null = no se cobra interés), los números de cuenta, el
// logo (se muestra uno genérico), la dirección y los teléfonos.

export const EMPRESA = {
  razonSocial: 'Balder Ingeniería y Mantenimiento SAS',
  nombreComercial: 'Balder Ingeniería',
  nit: '901125081',
  colorPrimario: '#2563eb',
  nombreProducto: 'Urbanix',
  textoLegalRecibo: 'Este recibo certifica el pago recibido. Conserve este documento como soporte.',
};

export const PARAMETROS = {
  porcentajeCuotaInicial: 30,
  plazoMaximoMeses: 12,
  tasaFinanciacionMensual: 0,
  tasaMoraMensual: null as number | null,
  diasGraciaMora: 0,
  diasSemaforoAmarillo: 5,
  diasAntesRecordatorio: 3,
};

// Inactivas hasta que el gerente escriba los números reales.
export const CUENTAS = [
  { banco: 'Bancolombia', tipo: 'AHORROS' as const, numero: 'POR CONFIGURAR', alias: 'Bancolombia (por configurar)' },
  { banco: 'Davivienda', tipo: 'AHORROS' as const, numero: 'POR CONFIGURAR', alias: 'Davivienda (por configurar)' },
];

// "Nómina", "Comisiones" y "Devolución por desistimiento" son del sistema: otros módulos las usan y no se pueden quitar.
export const CATEGORIAS_GASTO = [
  { nombre: 'Nómina', esSistema: true },
  { nombre: 'Comisiones', esSistema: true },
  { nombre: 'Devolución por desistimiento', esSistema: true },
  { nombre: 'Materiales', esSistema: false },
  { nombre: 'Servicios públicos', esSistema: false },
  { nombre: 'Transporte', esSistema: false },
  { nombre: 'Trámites y legales', esSistema: false },
  { nombre: 'Publicidad', esSistema: false },
  { nombre: 'Otros', esSistema: false },
];

// Los ingresos por cuotas y abonos de lotes no llevan categoría: se suman solos desde los abonos.
export const CATEGORIAS_INGRESO = [
  { nombre: 'Anticipo de remodelación', esSistema: false },
  { nombre: 'Otros servicios', esSistema: false },
  { nombre: 'Otros', esSistema: false },
];

export const COMISIONES = [
  { tipo: 'ASESOR_INMOBILIARIO' as const, valor: '1000000' },
  { tipo: 'REFERIDO' as const, valor: '500000' },
];
