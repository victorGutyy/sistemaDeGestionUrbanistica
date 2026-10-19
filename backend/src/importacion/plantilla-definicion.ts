// ---------------------------------------------------------------------------------------------
// Definición de la plantilla de Excel (RF-MIG-01). BORRADOR: se ajusta cuando llegue el Excel real de la empresa.
//
// Todo lo que describe el libro vive AQUÍ: qué hojas tiene, qué columnas, cuáles son obligatorias, qué nombres
// alternativos se aceptan para cada encabezado y qué texto de ayuda lleva. La plantilla que se descarga, la
// lectura del archivo y la validación se leen de esta definición, así que cambiar un nombre de columna o agregar
// un alias es tocar una línea de este archivo.
// ---------------------------------------------------------------------------------------------

export type ClaveHoja = 'proyectos' | 'lotes' | 'clientes' | 'ventas' | 'cuotas' | 'abonos';

export type TipoColumna = 'texto' | 'pesos' | 'decimal' | 'entero' | 'fecha' | 'lista';

export interface ColumnaPlantilla {
  clave: string;
  encabezado: string;
  // Otros nombres con los que se acepta el encabezado (se comparan sin tildes, mayúsculas ni signos).
  alias?: string[];
  tipo: TipoColumna;
  obligatoria: boolean;
  // Para el tipo "lista": los textos válidos tal como se muestran en la lista desplegable.
  opciones?: string[];
  ayuda: string;
  ejemplo: string;
  ancho?: number;
}

export interface HojaPlantilla {
  clave: ClaveHoja;
  nombre: string;
  alias?: string[];
  descripcion: string;
  columnas: ColumnaPlantilla[];
}

export const FORMAS_DE_PAGO = ['Contado', 'Financiado'];
export const MEDIOS_DE_PAGO = ['Efectivo', 'Consignación', 'Transferencia', 'Nequi', 'Daviplata', 'Cheque', 'Tarjeta'];
export const TIPOS_DE_VENDEDOR = ['Asesor inmobiliario', 'Referido'];
export const TIPOS_DE_DOCUMENTO = ['CC', 'CE', 'NIT', 'Pasaporte', 'TI', 'Otro'];

// Tope de filas por hoja y de tamaño del archivo (protegen al servidor de un archivo enorme o mal armado).
export const MAXIMO_FILAS_POR_HOJA = 5000;
export const TAMANO_MAXIMO_ARCHIVO = 5 * 1024 * 1024;

// Las tres columnas que identifican un lote en las hojas Lotes, Ventas, Cuotas y Abonos.
const COLUMNAS_LOTE: ColumnaPlantilla[] = [
  {
    clave: 'proyecto',
    encabezado: 'Proyecto',
    alias: ['Nombre del proyecto'],
    tipo: 'texto',
    obligatoria: true,
    ayuda: 'Nombre del proyecto, igual que en la hoja Proyectos (o que en el sistema).',
    ejemplo: 'La Floresta',
    ancho: 24,
  },
  {
    clave: 'manzana',
    encabezado: 'Manzana',
    tipo: 'texto',
    obligatoria: false,
    ayuda: 'Déjala vacía si el proyecto no se organiza por manzanas.',
    ejemplo: 'A',
    ancho: 12,
  },
  {
    clave: 'numero',
    encabezado: 'Lote',
    alias: ['Número de lote', 'Numero', 'No. lote'],
    tipo: 'texto',
    obligatoria: true,
    ayuda: 'Número o nombre del lote dentro de su manzana.',
    ejemplo: '12',
    ancho: 10,
  },
];

export const HOJAS: HojaPlantilla[] = [
  {
    clave: 'proyectos',
    nombre: 'Proyectos',
    descripcion: 'Un proyecto por fila. Si el proyecto ya existe en el sistema se reutiliza y no se modifica.',
    columnas: [
      { clave: 'nombre', encabezado: 'Nombre', alias: ['Proyecto'], tipo: 'texto', obligatoria: true, ayuda: 'Nombre del proyecto (mínimo 3 letras).', ejemplo: 'La Floresta', ancho: 26 },
      { clave: 'ubicacion', encabezado: 'Ubicación', alias: ['Direccion', 'Dirección'], tipo: 'texto', obligatoria: false, ayuda: 'Vereda, barrio o dirección.', ejemplo: 'Vereda El Edén', ancho: 28 },
      { clave: 'municipio', encabezado: 'Municipio', tipo: 'texto', obligatoria: false, ayuda: 'Municipio del proyecto.', ejemplo: 'Armenia', ancho: 18 },
      { clave: 'areaTotal', encabezado: 'Área total (m²)', alias: ['Area total', 'Área total', 'Area m2'], tipo: 'decimal', obligatoria: true, ayuda: 'Área total del predio en metros cuadrados (hasta 2 decimales).', ejemplo: '25000', ancho: 16 },
      { clave: 'valorCompra', encabezado: 'Valor de compra', alias: ['Valor compra'], tipo: 'pesos', obligatoria: false, ayuda: 'Lo que costó el predio, en pesos enteros.', ejemplo: '1500000000', ancho: 18 },
      { clave: 'fechaCompra', encabezado: 'Fecha de compra', alias: ['Fecha compra'], tipo: 'fecha', obligatoria: false, ayuda: 'dd/mm/aaaa.', ejemplo: '15/03/2024', ancho: 16 },
    ],
  },
  {
    clave: 'lotes',
    nombre: 'Lotes',
    descripcion: 'Un lote por fila. Los lotes nuevos entran como disponibles; los que tienen venta quedan vendidos al cargar la hoja Ventas.',
    columnas: [
      ...COLUMNAS_LOTE,
      { clave: 'area', encabezado: 'Área (m²)', alias: ['Area', 'Área', 'Area m2'], tipo: 'decimal', obligatoria: true, ayuda: 'Área del lote en metros cuadrados (hasta 2 decimales).', ejemplo: '90', ancho: 12 },
      { clave: 'valorVenta', encabezado: 'Precio de venta', alias: ['Valor de venta', 'Valor venta', 'Precio'], tipo: 'pesos', obligatoria: true, ayuda: 'Precio de lista del lote, en pesos enteros.', ejemplo: '45000000', ancho: 18 },
      { clave: 'valorPorM2', encabezado: 'Valor por m²', alias: ['Valor m2', 'Precio por m2'], tipo: 'pesos', obligatoria: false, ayuda: 'Informativo.', ejemplo: '500000', ancho: 14 },
      { clave: 'linderos', encabezado: 'Linderos', alias: ['Medidas', 'Medidas y linderos'], tipo: 'texto', obligatoria: false, ayuda: 'Medidas y linderos en texto libre.', ejemplo: 'Norte 9 m con vía, sur 9 m con lote 13', ancho: 36 },
    ],
  },
  {
    clave: 'clientes',
    nombre: 'Clientes',
    descripcion: 'Un cliente por fila, identificado por su documento. Si ya existe en el sistema se reutiliza y no se modifica.',
    columnas: [
      { clave: 'documento', encabezado: 'Documento', alias: ['Cédula', 'Cedula', 'Identificación', 'Identificacion', 'NIT'], tipo: 'texto', obligatoria: true, ayuda: 'Cédula o NIT, sin puntos.', ejemplo: '1000000001', ancho: 16 },
      { clave: 'tipoDocumento', encabezado: 'Tipo de documento', alias: ['Tipo documento', 'Tipo'], tipo: 'lista', obligatoria: false, opciones: TIPOS_DE_DOCUMENTO, ayuda: 'CC, CE, NIT, Pasaporte, TI u Otro. Vacío = CC.', ejemplo: 'CC', ancho: 18 },
      { clave: 'nombre', encabezado: 'Nombre', alias: ['Nombre completo', 'Cliente'], tipo: 'texto', obligatoria: true, ayuda: 'Nombre completo.', ejemplo: 'Cliente de Prueba Uno', ancho: 30 },
      { clave: 'telefono', encabezado: 'Teléfono', alias: ['Telefono', 'Celular'], tipo: 'texto', obligatoria: false, ayuda: 'Teléfono o celular.', ejemplo: '3000000001', ancho: 16 },
      { clave: 'email', encabezado: 'Correo', alias: ['Email', 'Correo electrónico', 'Correo electronico'], tipo: 'texto', obligatoria: false, ayuda: 'Correo electrónico.', ejemplo: 'cliente1@ejemplo.test', ancho: 28 },
      { clave: 'direccion', encabezado: 'Dirección', alias: ['Direccion'], tipo: 'texto', obligatoria: false, ayuda: 'Dirección del cliente.', ejemplo: 'Calle 1 # 2-3', ancho: 28 },
    ],
  },
  {
    clave: 'ventas',
    nombre: 'Ventas',
    descripcion: 'Una venta por lote. Las ventas históricas entran como activas, sin pasar por la aprobación de excepciones.',
    columnas: [
      ...COLUMNAS_LOTE,
      { clave: 'documentoCliente', encabezado: 'Documento del cliente', alias: ['Documento cliente', 'Cédula del cliente', 'Cedula cliente'], tipo: 'texto', obligatoria: true, ayuda: 'Documento del comprador, igual que en la hoja Clientes (o que en el sistema).', ejemplo: '1000000001', ancho: 20 },
      { clave: 'fechaVenta', encabezado: 'Fecha de venta', alias: ['Fecha venta', 'Fecha'], tipo: 'fecha', obligatoria: true, ayuda: 'dd/mm/aaaa. No puede ser futura.', ejemplo: '10/05/2026', ancho: 16 },
      { clave: 'formaPago', encabezado: 'Forma de pago', alias: ['Forma pago', 'Tipo de venta'], tipo: 'lista', obligatoria: true, opciones: FORMAS_DE_PAGO, ayuda: 'Contado o Financiado.', ejemplo: 'Financiado', ancho: 16 },
      { clave: 'valorTotal', encabezado: 'Valor total', alias: ['Valor de la venta', 'Precio final'], tipo: 'pesos', obligatoria: true, ayuda: 'Valor total pactado, en pesos enteros.', ejemplo: '45000000', ancho: 16 },
      { clave: 'cuotaInicial', encabezado: 'Cuota inicial', alias: ['Cuota inicial pagada'], tipo: 'pesos', obligatoria: false, ayuda: 'Obligatoria si es financiado (0 si no hubo). En una venta de contado se deja vacía: la cuota inicial es el valor total.', ejemplo: '13500000', ancho: 16 },
      { clave: 'fechaCuotaInicial', encabezado: 'Fecha de la cuota inicial', alias: ['Fecha cuota inicial'], tipo: 'fecha', obligatoria: false, ayuda: 'Vacía = el día de la venta.', ejemplo: '10/05/2026', ancho: 20 },
      { clave: 'numeroCuotas', encabezado: 'Número de cuotas', alias: ['Numero de cuotas', 'Cuotas', 'Plazo'], tipo: 'entero', obligatoria: false, ayuda: 'Cuotas del saldo (financiado). Si la hoja Cuotas trae el plan de esta venta, se toma de allí. Sin hoja Cuotas, el sistema reparte el saldo en cuotas mensuales iguales, sin interés.', ejemplo: '12', ancho: 14 },
      { clave: 'saldoSegunExcel', encabezado: 'Saldo según el Excel', alias: ['Saldo', 'Saldo pendiente'], tipo: 'pesos', obligatoria: false, ayuda: 'Opcional: el saldo que hoy muestra su Excel. Sirve solo para el reporte de conciliación.', ejemplo: '31500000', ancho: 20 },
      { clave: 'vendedorTipo', encabezado: 'Tipo de vendedor', alias: ['Tipo vendedor'], tipo: 'lista', obligatoria: false, opciones: TIPOS_DE_VENDEDOR, ayuda: 'Asesor inmobiliario o Referido. Si lo llenas, llena también el documento y el nombre del vendedor.', ejemplo: 'Asesor inmobiliario', ancho: 20 },
      { clave: 'vendedorDocumento', encabezado: 'Documento del vendedor', alias: ['Documento vendedor'], tipo: 'texto', obligatoria: false, ayuda: 'Documento de quien trajo la venta.', ejemplo: '2000000001', ancho: 20 },
      { clave: 'vendedorNombre', encabezado: 'Nombre del vendedor', alias: ['Vendedor', 'Nombre vendedor'], tipo: 'texto', obligatoria: false, ayuda: 'Nombre de quien trajo la venta.', ejemplo: 'Asesor de Prueba', ancho: 26 },
    ],
  },
  {
    clave: 'cuotas',
    nombre: 'Cuotas',
    descripcion:
      'OPCIONAL. Solo si quieres cargar el plan de cuotas real de una venta financiada (las cuotas 1, 2, 3… del saldo; la cuota inicial va en la hoja Ventas). Las ventas que no aparecen aquí usan el plan generado por el sistema.',
    columnas: [
      ...COLUMNAS_LOTE,
      { clave: 'cuota', encabezado: 'Cuota', alias: ['Número de cuota', 'Numero de cuota', 'No. cuota'], tipo: 'entero', obligatoria: true, ayuda: 'Número de la cuota: 1, 2, 3… sin saltos.', ejemplo: '1', ancho: 10 },
      { clave: 'fechaVencimiento', encabezado: 'Fecha de vencimiento', alias: ['Vencimiento', 'Fecha vencimiento'], tipo: 'fecha', obligatoria: true, ayuda: 'dd/mm/aaaa.', ejemplo: '10/06/2026', ancho: 20 },
      { clave: 'valor', encabezado: 'Valor de la cuota', alias: ['Valor cuota', 'Valor'], tipo: 'pesos', obligatoria: true, ayuda: 'Pesos enteros. Las cuotas deben sumar el saldo financiado (valor total menos cuota inicial).', ejemplo: '2625000', ancho: 18 },
    ],
  },
  {
    clave: 'abonos',
    nombre: 'Abonos',
    descripcion:
      'Cada pago que el cliente ya hizo, incluida la cuota inicial. Entran con recibo histórico (serie H-) y se aplican a las cuotas en orden de vencimiento.',
    columnas: [
      ...COLUMNAS_LOTE,
      { clave: 'fecha', encabezado: 'Fecha del pago', alias: ['Fecha pago', 'Fecha del abono', 'Fecha'], tipo: 'fecha', obligatoria: true, ayuda: 'dd/mm/aaaa. No puede ser futura.', ejemplo: '10/05/2026', ancho: 16 },
      { clave: 'valor', encabezado: 'Valor pagado', alias: ['Valor', 'Valor del abono', 'Abono'], tipo: 'pesos', obligatoria: true, ayuda: 'Pesos enteros, mayor a cero.', ejemplo: '13500000', ancho: 16 },
      { clave: 'medioPago', encabezado: 'Medio de pago', alias: ['Medio', 'Forma de pago del abono'], tipo: 'lista', obligatoria: true, opciones: MEDIOS_DE_PAGO, ayuda: 'Efectivo, Consignación, Transferencia, Nequi, Daviplata, Cheque o Tarjeta.', ejemplo: 'Consignación', ancho: 18 },
      { clave: 'cuenta', encabezado: 'Cuenta de destino', alias: ['Cuenta', 'Cuenta destino', 'Banco'], tipo: 'texto', obligatoria: false, ayuda: 'Alias de la cuenta de recaudo registrada en Configuración. Obligatoria si el pago no fue en efectivo.', ejemplo: 'Bancolombia ahorros', ancho: 24 },
      { clave: 'referencia', encabezado: 'Referencia', alias: ['Referencia de la transacción', 'Referencia transaccion', 'Comprobante'], tipo: 'texto', obligatoria: false, ayuda: 'Número de la consignación o transferencia. No se puede repetir en la misma cuenta.', ejemplo: '000123456', ancho: 20 },
    ],
  },
];

export function hojaPorClave(clave: ClaveHoja): HojaPlantilla {
  const hoja = HOJAS.find((candidata) => candidata.clave === clave);
  if (!hoja) throw new Error(`Hoja desconocida: ${clave}`);
  return hoja;
}
