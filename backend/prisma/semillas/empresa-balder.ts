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
  diasEntreAvisosMora: 7,
  enviarReciboPorCorreo: true,
  diasAlertaVerificacion: 3,
  minutosVigenciaRecuperacion: 60,
  recuperacionesPorHora: 3,
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
  // Propias de la maquinaria (RF-MAQ-06): solo se ofrecen en proyectos de maquinaria. El gerente las administra.
  { nombre: 'Combustible', esSistema: false, soloMaquinaria: true },
  { nombre: 'Mantenimiento de equipos', esSistema: false, soloMaquinaria: true },
  { nombre: 'Repuestos', esSistema: false, soloMaquinaria: true },
  { nombre: 'Operario', esSistema: false, soloMaquinaria: true },
  { nombre: 'Transporte del equipo', esSistema: false, soloMaquinaria: true },
];

// Los ingresos por cuotas y abonos de lotes no llevan categoría: se suman solos desde los abonos.
export const CATEGORIAS_INGRESO = [
  { nombre: 'Anticipo de remodelación', esSistema: false },
  { nombre: 'Otros servicios', esSistema: false },
  { nombre: 'Otros', esSistema: false },
];

// Tipos de equipo de ejemplo (RF-MAQ-02). El cliente aún no confirma los suyos: el gerente los edita en Configuración.
export const TIPOS_EQUIPO = ['Excavadora', 'Retroexcavadora', 'Volqueta'];

// Seguridad social (CC-03, RF-CFG-14). Lista inicial de ejemplo: el gerente agrega o desactiva entidades en
// Configuración. Quedan fuera las que el cliente no use; ninguna afiliación depende de esta lista.
export const ENTIDADES_SS = [
  ...['Sura', 'Sanitas', 'Nueva EPS', 'Salud Total', 'Compensar', 'Famisanar', 'Coosalud', 'Asmet Salud'].map((nombre) => ({ tipo: 'EPS' as const, nombre })),
  ...['Porvenir', 'Protección', 'Colfondos', 'Skandia', 'Colpensiones'].map((nombre) => ({ tipo: 'AFP' as const, nombre })),
  ...['Porvenir', 'Protección', 'Colfondos', 'Skandia', 'Fondo Nacional del Ahorro'].map((nombre) => ({ tipo: 'CESANTIAS' as const, nombre })),
  ...['Positiva', 'Sura', 'Colmena', 'Bolívar', 'La Equidad', 'Liberty'].map((nombre) => ({ tipo: 'ARL' as const, nombre })),
  ...['Comfenalco Quindío', 'Comfamiliar Risaralda', 'Cafam', 'Colsubsidio', 'Compensar'].map((nombre) => ({ tipo: 'CAJA' as const, nombre })),
];

// Clases de riesgo de la ARL con su tasa en porcentaje (RF-CFG-14, RF-PER-18). Tarifas del Decreto 1295 de 1994;
// el asesor laboral debe confirmarlas y el gerente puede ajustarlas.
export const CLASES_RIESGO_ARL = [
  { clase: 1, tasa: '0.522' },
  { clase: 2, tasa: '1.044' },
  { clase: 3, tasa: '2.436' },
  { clase: 4, tasa: '4.350' },
  { clase: 5, tasa: '6.960' },
];

// Valores legales de 2026 (RF-CFG-13), tomados del libro de especificación que envió el cliente. Se siembran SIN
// VALIDAR (validadoEn vacío) hasta que el asesor laboral los confirme; el gerente los edita en Configuración.
// Los días de cada tramo siguen la regla usual (empleador 2 días, EPS hasta el día 90 y hasta el 180): también
// quedan por validar.
export const PARAMETRO_LEGAL_2026 = {
  anio: 2026,
  smmlv: '1750905',
  auxilioTransporte: '249095',
  topeAuxilioSmmlv: '2',
  porcentajeIncapacidadTramo1: '66.67',
  porcentajeIncapacidadTramo2: '50',
  porcentajeIncapacidadLaboral: '100',
  diasEmpleador: 2,
  diasTramo1Hasta: 90,
  diasTramo2Hasta: 180,
  diasBaseMes: 30,
  notas: 'Valores del libro del cliente (28/10/2026). Pendiente de validación por el asesor laboral.',
};

// Elementos de protección personal con su vida útil en días (CC-03 fase B, RF-SST-12). Es el catálogo de referencia del
// libro del cliente: la vida útil debe ajustarse según la ficha técnica del fabricante y la matriz de EPP de la empresa, y el
// contratista SST o el gerente lo editan en la aplicación.
export const ELEMENTOS_EPP = [
  { nombre: 'Casco de seguridad dieléctrico', vidaUtilDias: 1095 },
  { nombre: 'Gafas de seguridad lente claro', vidaUtilDias: 180 },
  { nombre: 'Careta de soldador', vidaUtilDias: 730 },
  { nombre: 'Protector auditivo tipo inserción (tapones)', vidaUtilDias: 30 },
  { nombre: 'Protector auditivo tipo copa', vidaUtilDias: 365 },
  { nombre: 'Respirador media cara', vidaUtilDias: 365 },
  { nombre: 'Filtros/cartuchos para respirador', vidaUtilDias: 90 },
  { nombre: 'Mascarilla N95', vidaUtilDias: 7 },
  { nombre: 'Guantes de nitrilo', vidaUtilDias: 30 },
  { nombre: 'Guantes de carnaza', vidaUtilDias: 60 },
  { nombre: 'Guantes dieléctricos', vidaUtilDias: 365 },
  { nombre: 'Botas de seguridad punta de acero', vidaUtilDias: 365 },
  { nombre: 'Botas de caucho', vidaUtilDias: 180 },
  { nombre: 'Chaleco reflectivo', vidaUtilDias: 365 },
  { nombre: 'Overol / ropa de trabajo', vidaUtilDias: 180 },
  { nombre: 'Arnés de cuerpo completo', vidaUtilDias: 1825 },
  { nombre: 'Eslinga con absorbedor de choque', vidaUtilDias: 1825 },
  { nombre: 'Delantal / peto de PVC', vidaUtilDias: 365 },
];

export const COMISIONES = [
  { tipo: 'ASESOR_INMOBILIARIO' as const, valor: '1000000' },
  { tipo: 'REFERIDO' as const, valor: '500000' },
];
