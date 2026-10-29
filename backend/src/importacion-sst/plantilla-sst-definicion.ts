import type { ColumnaPlantilla, HojaPlantilla } from '../importacion/plantilla-definicion.js';
import { TIPOS_DE_DOCUMENTO } from '../importacion/plantilla-definicion.js';

// ---------------------------------------------------------------------------------------------
// Definición de la plantilla de carga de seguridad y salud en el trabajo (RF-SST-23). BORRADOR: el libro real de la empresa
// no está en el repositorio, así que las hojas y los encabezados se ajustan cuando llegue.
//
// Todo lo que describe el libro vive AQUÍ: qué hojas tiene, qué columnas, cuáles son obligatorias, qué nombres alternativos se
// aceptan para cada encabezado y qué texto de ayuda lleva. La plantilla que se descarga, la lectura del archivo y la
// validación se leen de esta definición: cambiar un nombre de columna o agregar un alias es tocar una línea de este archivo.
// Los ejemplos de las ayudas son inventados: nunca hay filas de ejemplo en las hojas.
// ---------------------------------------------------------------------------------------------

export type ClaveHojaSst = 'trabajadores' | 'ausentismos' | 'entregasEpp' | 'asistencias';

export const SEXOS = ['Femenino', 'Masculino', 'Otro'];
export const SI_NO = ['Sí', 'No'];

// El texto que se ve en el Excel y el valor que guarda el sistema.
export const TIPOS_DE_CONTRATO: Record<string, string> = {
  'Obra o labor': 'OBRA_LABOR',
  'Término fijo': 'TERMINO_FIJO',
  'Término indefinido': 'TERMINO_INDEFINIDO',
  'Prestación de servicios': 'PRESTACION_SERVICIOS',
};

export const MOTIVOS_DE_ENTREGA_EPP: Record<string, string> = {
  'Dotación inicial': 'DOTACION_INICIAL',
  'Reposición por vida útil': 'REPOSICION_VIDA_UTIL',
  'Reposición por daño o deterioro': 'REPOSICION_DANO',
  Pérdida: 'PERDIDA',
  'Cambio de cargo': 'CAMBIO_CARGO',
};

// Tope de filas por hoja y de tamaño del archivo (protegen al servidor de un archivo enorme o mal armado).
export const MAXIMO_FILAS_POR_HOJA_SST = 5000;
export const TAMANO_MAXIMO_ARCHIVO_SST = 5 * 1024 * 1024;

const DOCUMENTO_DEL_TRABAJADOR: ColumnaPlantilla = {
  clave: 'documento',
  encabezado: 'Documento del trabajador',
  alias: ['Documento', 'Cédula', 'Cedula', 'Identificación', 'Identificacion'],
  tipo: 'texto',
  obligatoria: true,
  ayuda: 'El documento del trabajador, igual que en la hoja Trabajadores (o que en el sistema).',
  ejemplo: '1000000001',
  ancho: 22,
};

export const HOJAS_SST: HojaPlantilla<ClaveHojaSst>[] = [
  {
    clave: 'trabajadores',
    nombre: 'Trabajadores',
    descripcion:
      'Los trabajadores. Un trabajador que ya existe en el sistema (por su documento) se reutiliza y no se modifica. Las afiliaciones a seguridad social se registran en la ficha de cada trabajador.',
    columnas: [
      { ...DOCUMENTO_DEL_TRABAJADOR, encabezado: 'Documento', alias: ['Documento del trabajador', 'Cédula', 'Cedula', 'Identificación', 'Identificacion'] },
      {
        clave: 'tipoDocumento',
        encabezado: 'Tipo de documento',
        alias: ['Tipo documento'],
        tipo: 'lista',
        obligatoria: false,
        opciones: TIPOS_DE_DOCUMENTO,
        ayuda: 'Si la dejas vacía se toma cédula de ciudadanía.',
        ejemplo: 'CC',
        ancho: 18,
      },
      { clave: 'nombres', encabezado: 'Nombres', alias: ['Nombre'], tipo: 'texto', obligatoria: true, ayuda: 'Los nombres del trabajador.', ejemplo: 'Persona Inventada', ancho: 24 },
      { clave: 'apellidos', encabezado: 'Apellidos', tipo: 'texto', obligatoria: true, ayuda: 'Los apellidos del trabajador.', ejemplo: 'Ejemplo Uno', ancho: 24 },
      { clave: 'cargo', encabezado: 'Cargo', tipo: 'texto', obligatoria: true, ayuda: 'El cargo u oficio.', ejemplo: 'Oficial de obra', ancho: 22 },
      {
        clave: 'tipoContrato',
        encabezado: 'Tipo de contrato',
        alias: ['Contrato'],
        tipo: 'lista',
        obligatoria: false,
        opciones: Object.keys(TIPOS_DE_CONTRATO),
        ayuda: 'Si la dejas vacía se toma obra o labor, el contrato habitual de la empresa.',
        ejemplo: 'Obra o labor',
        ancho: 22,
      },
      {
        clave: 'salarioBase',
        encabezado: 'Salario base',
        alias: ['Salario'],
        tipo: 'pesos',
        obligatoria: true,
        ayuda: 'Pesos enteros, sin centavos. Con este salario se liquida el ausentismo.',
        ejemplo: '1750905',
        ancho: 16,
      },
      {
        clave: 'fechaIngreso',
        encabezado: 'Fecha de ingreso',
        alias: ['Ingreso', 'Fecha ingreso'],
        tipo: 'fecha',
        obligatoria: true,
        ayuda: 'Día en que empezó a trabajar. Un ausentismo o una entrega de EPP no pueden ser anteriores.',
        ejemplo: '15/01/2026',
        ancho: 16,
      },
      { clave: 'area', encabezado: 'Área', alias: ['Area'], tipo: 'texto', obligatoria: false, ayuda: 'Área o proyecto donde trabaja.', ejemplo: 'Obra La Floresta', ancho: 22 },
      { clave: 'sexo', encabezado: 'Sexo', tipo: 'lista', obligatoria: false, opciones: SEXOS, ayuda: 'Opcional.', ejemplo: 'Femenino', ancho: 12 },
      {
        clave: 'fechaNacimiento',
        encabezado: 'Fecha de nacimiento',
        alias: ['Nacimiento', 'Fecha nacimiento'],
        tipo: 'fecha',
        obligatoria: false,
        ayuda: 'Opcional.',
        ejemplo: '03/05/1990',
        ancho: 18,
      },
      { clave: 'telefono', encabezado: 'Teléfono', alias: ['Telefono'], tipo: 'texto', obligatoria: false, ayuda: 'Opcional.', ejemplo: '6061234567', ancho: 16 },
      { clave: 'celular', encabezado: 'Celular', tipo: 'texto', obligatoria: false, ayuda: 'Opcional.', ejemplo: '3001234567', ancho: 16 },
      { clave: 'email', encabezado: 'Correo', alias: ['Correo electrónico', 'Correo electronico', 'Email'], tipo: 'texto', obligatoria: false, ayuda: 'Opcional.', ejemplo: 'persona@ejemplo.test', ancho: 26 },
    ],
  },
  {
    clave: 'ausentismos',
    nombre: 'Ausentismos',
    alias: ['Ausentismo', 'Incapacidades'],
    descripcion:
      'Incapacidades y licencias. Cada fila se registra y se liquida como si se hubiera digitado en el sistema, con el salario actual del trabajador y los parámetros legales del año en que empieza. Los certificados no se cargan.',
    columnas: [
      DOCUMENTO_DEL_TRABAJADOR,
      {
        clave: 'tipo',
        encabezado: 'Tipo de ausentismo',
        alias: ['Tipo'],
        tipo: 'texto',
        obligatoria: true,
        ayuda: 'El nombre del tipo, igual que en Configuración → Seguridad social (por ejemplo Enfermedad general o Licencia por luto).',
        ejemplo: 'Enfermedad general',
        ancho: 24,
      },
      { clave: 'fechaInicio', encabezado: 'Fecha de inicio', alias: ['Desde', 'Inicio'], tipo: 'fecha', obligatoria: true, ayuda: 'Primer día del ausentismo.', ejemplo: '10/03/2026', ancho: 16 },
      { clave: 'fechaFin', encabezado: 'Fecha de fin', alias: ['Hasta', 'Fin'], tipo: 'fecha', obligatoria: true, ayuda: 'Último día del ausentismo (ese día cuenta).', ejemplo: '14/03/2026', ancho: 16 },
      {
        clave: 'numeroDocumento',
        encabezado: 'N.º de incapacidad',
        alias: ['Número de incapacidad', 'Numero de incapacidad', 'N° incapacidad', 'Número del certificado', 'Numero del certificado'],
        tipo: 'texto',
        obligatoria: false,
        ayuda: 'El número que trae el certificado de incapacidad o la licencia.',
        ejemplo: 'INC-0001',
        ancho: 20,
      },
      {
        clave: 'cie10',
        encabezado: 'Código CIE-10',
        alias: ['CIE-10', 'CIE10', 'Diagnóstico', 'Diagnostico', 'Código del diagnóstico'],
        tipo: 'texto',
        obligatoria: false,
        ayuda: 'El código del diagnóstico (por ejemplo M54.5). Es obligatorio en los tipos que lo exigen, como las incapacidades. Es un dato de salud: solo lo ven los roles con permiso.',
        ejemplo: 'M54.5',
        ancho: 16,
      },
      {
        clave: 'prorroga',
        encabezado: 'Es prórroga',
        alias: ['Prórroga', 'Prorroga'],
        tipo: 'lista',
        obligatoria: false,
        opciones: SI_NO,
        ayuda: 'Sí si continúa una incapacidad anterior. Entonces indica cuántos días llevaba acumulados.',
        ejemplo: 'No',
        ancho: 14,
      },
      {
        clave: 'diasPrevios',
        encabezado: 'Días previos',
        alias: ['Dias previos', 'Días acumulados', 'Dias acumulados'],
        tipo: 'entero',
        obligatoria: false,
        ayuda: 'Solo en una prórroga: los días que llevaba la incapacidad anterior. Cuentan para los tramos de pago.',
        ejemplo: '30',
        ancho: 14,
      },
      {
        clave: 'observaciones',
        encabezado: 'Observaciones',
        tipo: 'texto',
        obligatoria: false,
        ayuda: 'Opcional. Es un dato de salud: solo lo ven los roles con permiso.',
        ejemplo: 'Reposo indicado por el médico',
        ancho: 32,
      },
    ],
  },
  {
    clave: 'entregasEpp',
    nombre: 'Entregas EPP',
    alias: ['Entrega EPP', 'EPP', 'Entregas de EPP'],
    descripcion: 'Entregas de elementos de protección personal. El elemento debe existir antes en el catálogo de EPP; la próxima reposición se calcula con su vida útil.',
    columnas: [
      DOCUMENTO_DEL_TRABAJADOR,
      {
        clave: 'elemento',
        encabezado: 'Elemento',
        tipo: 'texto',
        obligatoria: true,
        ayuda: 'El nombre del elemento, igual que en el catálogo de EPP.',
        ejemplo: 'Casco de seguridad',
        ancho: 28,
      },
      { clave: 'fecha', encabezado: 'Fecha de entrega', alias: ['Fecha'], tipo: 'fecha', obligatoria: true, ayuda: 'Día de la entrega. No puede ser futura.', ejemplo: '05/03/2026', ancho: 16 },
      { clave: 'cantidad', encabezado: 'Cantidad', tipo: 'entero', obligatoria: true, ayuda: 'De 1 a 1000 unidades.', ejemplo: '1', ancho: 10 },
      { clave: 'tallaReferencia', encabezado: 'Talla o referencia', alias: ['Talla', 'Referencia'], tipo: 'texto', obligatoria: false, ayuda: 'Talla, marca o referencia.', ejemplo: 'M', ancho: 18 },
      {
        clave: 'motivo',
        encabezado: 'Motivo',
        tipo: 'lista',
        obligatoria: true,
        opciones: Object.keys(MOTIVOS_DE_ENTREGA_EPP),
        ayuda: 'Por qué se entrega.',
        ejemplo: 'Dotación inicial',
        ancho: 30,
      },
      {
        clave: 'entregadoPor',
        encabezado: 'Entregado por',
        alias: ['Entregó', 'Entrego'],
        tipo: 'texto',
        obligatoria: false,
        ayuda: 'Quién entregó. Si la dejas vacía queda quien hace la carga.',
        ejemplo: 'Responsable Inventado',
        ancho: 26,
      },
      { clave: 'firmo', encabezado: 'Firmó el recibido', alias: ['Firmó', 'Firmo'], tipo: 'lista', obligatoria: false, opciones: SI_NO, ayuda: 'Si el trabajador firmó el acta de recibido. Vacía es No.', ejemplo: 'Sí', ancho: 18 },
    ],
  },
  {
    clave: 'asistencias',
    nombre: 'Asistencias',
    alias: ['Asistencia', 'Asistencias a capacitaciones'],
    descripcion:
      'Asistencia de los trabajadores a capacitaciones que ya existen en el sistema. La capacitación se identifica por su tema y su fecha programada.',
    columnas: [
      DOCUMENTO_DEL_TRABAJADOR,
      { clave: 'tema', encabezado: 'Capacitación', alias: ['Tema', 'Capacitacion'], tipo: 'texto', obligatoria: true, ayuda: 'El tema, igual que en el plan de capacitación.', ejemplo: 'Trabajo seguro en alturas', ancho: 32 },
      { clave: 'fechaProgramada', encabezado: 'Fecha programada', alias: ['Fecha de la capacitación', 'Fecha de la capacitacion'], tipo: 'fecha', obligatoria: true, ayuda: 'La fecha programada de esa capacitación (sirve para distinguir dos con el mismo tema).', ejemplo: '10/04/2026', ancho: 18 },
      { clave: 'firmo', encabezado: 'Firmó', alias: ['Firmó la asistencia', 'Firmo'], tipo: 'lista', obligatoria: false, opciones: SI_NO, ayuda: 'Si firmó el listado de asistencia. Vacía es No.', ejemplo: 'Sí', ancho: 12 },
      { clave: 'calificacion', encabezado: 'Calificación', alias: ['Calificacion', 'Nota'], tipo: 'decimal', obligatoria: false, ayuda: 'De 0 a 5, con hasta dos decimales. Opcional.', ejemplo: '4,5', ancho: 14 },
    ],
  },
];

export const PASOS_SST = [
  '1. Llena las hojas que necesites (puedes dejar vacías las que no uses). No cambies los nombres de las hojas ni de los encabezados.',
  '2. Una fila por registro. Las filas completamente vacías se ignoran.',
  '3. Los trabajadores se identifican por su Documento. Escríbelo igual en todas las hojas.',
  '4. Se procesa en este orden: Trabajadores, Ausentismos, Entregas EPP y Asistencias. Un ausentismo, una entrega o una asistencia puede ser de un trabajador que ya existe o de uno de la hoja Trabajadores.',
  '5. Fechas como dd/mm/aaaa. Dinero en pesos enteros, sin centavos.',
  '6. Cada fila pasa por las mismas reglas que al digitarla en el sistema: un ausentismo no puede traslaparse con otro del mismo trabajador, no puede empezar antes del ingreso, y necesita los parámetros legales del año en que empieza (Configuración → Seguridad social).',
  '7. El elemento de EPP y la capacitación deben existir antes en el sistema: esta carga no los crea.',
  '8. En el sistema, sube el archivo: primero se valida SIN guardar y se muestran los errores por hoja y fila. Solo cuando no haya errores se confirma la carga: entra todo o no entra nada.',
  '9. Lo que ya existe (un trabajador con ese documento) se reutiliza y no se modifica. Un registro cargado no se puede borrar: si algo quedó mal, se anula con motivo y se registra el correcto.',
  '10. Pasa el cursor sobre cada encabezado para ver la ayuda y un ejemplo. Las columnas obligatorias tienen el encabezado en amarillo.',
];
