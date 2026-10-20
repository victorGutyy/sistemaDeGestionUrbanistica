// Muestra la ESTRUCTURA de un libro de Excel sin mostrar el contenido de sus celdas.
// Sirve para ajustar la plantilla de importación (backend/src/importacion/plantilla-definicion.ts) cuando el archivo
// trae información confidencial: se imprime qué hojas hay, qué columnas tienen y de qué forma son sus datos, pero
// nunca el contenido (ni nombres, ni documentos, ni valores en dinero).
//
// Uso (desde backend/):
//   node herramientas/estructura-excel.mjs "../datos-reales/archivo.xlsx"
//   node herramientas/estructura-excel.mjs "../datos-reales/archivo.xlsx" --permitir "palabra1,palabra2"
//
// Protección de los encabezados: a veces la "primera fila" de una hoja no es un encabezado sino un dato (por ejemplo, el
// nombre de un cliente que encabeza un bloque). Por eso un texto de encabezado solo se imprime si TODAS sus palabras
// están en la lista de palabras de encabezado conocidas (fecha, cliente, valor, lote...). Cualquier otro texto se
// reemplaza por "[texto no reconocido: N palabras]". Si una columna importante queda oculta, di tú qué es, o agrega
// sus palabras con --permitir (solo palabras de encabezado, nunca nombres ni datos).
import { createRequire } from 'node:module';
import { basename } from 'node:path';

const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');

const argumentos = process.argv.slice(2);
const ruta = argumentos.find((a) => !a.startsWith('--'));
if (!ruta) {
  console.error('Indica el archivo: node herramientas/estructura-excel.mjs "ruta/al/archivo.xlsx"');
  process.exit(1);
}
// Con --formas, además se muestra la FORMA de los textos más frecuentes de cada columna: cada letra se reemplaza por
// "A" y cada dígito por "9" ("B-12" queda "A-99"). Sirve para entender códigos como la nomenclatura de un lote.
const conFormas = argumentos.includes('--formas');
const indicePermitir = argumentos.indexOf('--permitir');
const extras = indicePermitir >= 0 ? (argumentos[indicePermitir + 1] ?? '').split(',') : [];

const quitarTildes = (texto) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
const normalizar = (texto) => quitarTildes(texto).toUpperCase();

// Palabras que aparecen en encabezados. Un nombre de persona, un barrio o un valor no están aquí.
const PALABRAS_DE_ENCABEZADO = new Set(
  (
    'FECHA FECHAS MES MESES ANIO DIA DIAS AÑO INGRESO INGRESOS SALIDA SALIDAS EGRESO EGRESOS ENTRADA ENTRADAS CENTRO DE DEL LA EL LOS LAS Y E O A EN POR CON SIN ' +
    'COSTO COSTOS NOMENCLATURA VIEJA NUEVA ANTIGUA IDENTIFICACION TERCERO TERCEROS OBSERVACION OBSERVACIONES OTRA OTRAS MEDIO MEDIOS PAGO PAGOS SOPORTE SOPORTES LEGAL ' +
    'CLIENTE CLIENTES NOMBRE NOMBRES APELLIDO APELLIDOS CEDULA CIUDADANIA EXPEDICION EXPEDIDA ESTADO CIVIL CORREO ELECTRONICO EMAIL TELEFONO TELEFONOS CELULAR ' +
    'CIUDAD DIRECCION MATRICULA INMOBILIARIA VALOR VALORES LOTE LOTES MANZANA MANZANAS PROYECTO PROYECTOS ITEM NUMERO NO N NRO ESCRITURA ESCRITURAS NOTARIA NOTARIAL ' +
    'SALDO SALDOS CUOTA CUOTAS ABONO ABONOS TOTAL TOTALES INICIAL PLAZO AREA M2 PRECIO PRECIOS TABLA RETENCION RETENCIONES CXC CXP RELACION DOCUMENTO DOCUMENTOS NIT ' +
    'TIPO FORMA COMISION COMISIONES ASESOR VENDEDOR REFERIDO BANCO CUENTA CUENTAS CONSIGNACION TRANSFERENCIA EFECTIVO CHEQUE FACTURA RECIBO CAJA CONCEPTO DESCRIPCION ' +
    'DETALLE VENTA VENTAS COMPRA COMPRAS ENTREGA SEPARACION APARTADO PROMESA CONTRATO FIRMA PAGADO PAGADA PENDIENTE MORA INTERES VENCIMIENTO UBICACION BARRIO VEREDA ' +
    'MUNICIPIO DEPARTAMENTO SECTOR ETAPA CANTIDAD UNIDAD UNIDADES RESPONSABLE ENCARGADO TRABAJADOR TRABAJADORES SALARIO CARGO NOMINA CONTRATO CODIGO REFERENCIA ' +
    'COMPRADOR COMPRADORES PROPIETARIO TITULAR BENEFICIARIO ABONOS GASTOS GASTO INGRESOS ESTADOS PRESUPUESTO HONORARIOS IMPUESTO IMPUESTOS IVA RETEFUENTE RETENCION ' +
    'ENERO FEBRERO MARZO ABRIL MAYO JUNIO JULIO AGOSTO SEPTIEMBRE OCTUBRE NOVIEMBRE DICIEMBRE LUNES MARTES MIERCOLES JUEVES VIERNES SABADO DOMINGO PRIMER PRIMERA SEGUNDO SEGUNDA TERCER TERCERA CUARTO CUARTA QUINTO QUINTA SEXTO SEXTA ' +
    'AVANCE ACUMULADO PARCIAL DESCUENTO ANTICIPO ENTREGADO RECIBIDO PORCENTAJE CAPITAL REAL FINAL INICIO FIN DESDE HASTA LINDEROS GENERAL OBRA OBRAS'
  )
    .split(/\s+/)
    .map((p) => normalizar(p)),
);
for (const extra of extras) PALABRAS_DE_ENCABEZADO.add(normalizar(extra.trim()));

// Devuelve el texto del encabezado si todas sus palabras son de encabezado; si no, un marcador sin contenido.
function textoSeguro(texto) {
  const palabras = normalizar(texto)
    .split(/[^A-Z0-9Ñ]+/)
    .filter(Boolean);
  if (palabras.length === 0) return '[vacío]';
  // Números sueltos y ordinales (1, 2, 1ER, 2DO, 3RA) también son palabras de encabezado: "ABONO 1", "CUOTA 2".
  const esNumeroOOrdinal = (p) => /^d{1,3}(ER|ERO|DO|RO|TO|VO|MO|NO|RA|DA|TA|A|O)?$/.test(p);
  if (palabras.every((p) => PALABRAS_DE_ENCABEZADO.has(p) || esNumeroOOrdinal(p))) return texto;
  return `[texto no reconocido: ${palabras.length} palabra${palabras.length === 1 ? '' : 's'}]`;
}

const LIMITE_FILAS_BUSQUEDA_ENCABEZADO = 15;
const FECHA_COMO_TEXTO = /^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}$/;

function valorSimple(celda) {
  const v = celda.value;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('richText' in v) return v.richText.map((p) => p.text).join('');
    if ('result' in v) return v.result;
    if ('text' in v) return v.text;
  }
  return v;
}

// Lo que hay en una celda, reducido a su forma (jamás su valor).
function formaDe(valor) {
  if (valor === null || valor === undefined || valor === '') return 'vacía';
  if (valor instanceof Date) return 'fecha';
  if (typeof valor === 'number') return Number.isInteger(valor) ? 'número entero' : 'número con decimales';
  if (typeof valor === 'boolean') return 'sí/no';
  if (typeof valor === 'object') {
    if ('formula' in valor || 'sharedFormula' in valor) return 'fórmula';
    if ('richText' in valor) return formaDe(valor.richText.map((parte) => parte.text).join(''));
    if ('hyperlink' in valor) return 'enlace';
    if ('error' in valor) return 'error de celda';
    return 'otro';
  }
  const texto = String(valor).trim();
  if (texto === '') return 'vacía';
  if (/^-?\d+([.,]\d+)?$/.test(texto)) return 'texto con forma de número';
  if (FECHA_COMO_TEXTO.test(texto)) return 'texto con forma de fecha';
  return 'texto';
}

// Cómo se ven los textos de una columna: solo dígitos, solo letras, mezcla, y su largo (nunca los textos).
const formaDelTexto = (texto) => texto.replace(/\p{L}/gu, 'A').replace(/\d/g, '9');

function patronDeTexto(textos) {
  if (textos.length === 0) return null;
  const largos = textos.map((t) => t.length);
  const clases = new Set(textos.map((t) => (/^\d+$/.test(t) ? 'solo dígitos' : /^[\p{L}\s.'-]+$/u.test(t) ? 'solo letras y espacios' : 'mezcla de letras, dígitos o símbolos')));
  const base = `${[...clases].join(' / ')}; largo de ${Math.min(...largos)} a ${Math.max(...largos)} caracteres`;
  if (!conFormas) return base;
  const conteo = new Map();
  for (const t of textos) conteo.set(formaDelTexto(t), (conteo.get(formaDelTexto(t)) ?? 0) + 1);
  const top = [...conteo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([forma, n]) => `"${forma}" ${n}`).join(', ');
  return `${base}; formas: ${top}`;
}

// La fila de encabezados es la de las primeras filas con MÁS celdas de texto y sin textos repetidos (una fila con el
// mismo texto en varias celdas es un título combinado, no un encabezado).
function buscarFilaEncabezado(hoja) {
  let mejor = null;
  for (let n = 1; n <= Math.min(hoja.rowCount, LIMITE_FILAS_BUSQUEDA_ENCABEZADO); n++) {
    const textos = [];
    hoja.getRow(n).eachCell({ includeEmpty: false }, (celda) => {
      const v = valorSimple(celda);
      if (typeof v === 'string' && v.trim() !== '') textos.push(v.trim());
    });
    if (textos.length < 2 || new Set(textos).size !== textos.length) continue;
    if (!mejor || textos.length > mejor.cantidad) mejor = { fila: n, cantidad: textos.length };
  }
  return mejor?.fila ?? null;
}

const libro = new ExcelJS.Workbook();
await libro.xlsx.readFile(ruta);

console.log(`Archivo: ${basename(ruta)}`);
console.log(`Hojas: ${libro.worksheets.length}\n`);

let ocultos = 0;
for (const hoja of libro.worksheets) {
  const estado = hoja.state === 'visible' ? '' : ` (${hoja.state === 'hidden' ? 'OCULTA' : 'MUY OCULTA'})`;
  console.log(`=== Hoja "${hoja.name}"${estado}`);
  console.log(`Filas con datos: ${hoja.actualRowCount} · Columnas: ${hoja.actualColumnCount} · Celdas combinadas: ${hoja.model.merges?.length ?? 0}`);

  const filaEncabezado = buscarFilaEncabezado(hoja);
  if (!filaEncabezado) {
    console.log('No se encontró una fila de encabezados confiable en las primeras filas (hay títulos combinados o datos).\n');
    continue;
  }
  const total = Math.max(hoja.rowCount - filaEncabezado, 0);
  console.log(`Fila de encabezados: ${filaEncabezado} · Filas de datos debajo: ${total}`);

  const columnas = [];
  hoja.getRow(filaEncabezado).eachCell({ includeEmpty: false }, (celda, numero) => columnas.push({ numero, encabezado: String(valorSimple(celda) ?? '').trim() }));

  for (const columna of columnas) {
    const formas = new Map();
    const textos = [];
    const distintos = new Set();
    let llenas = 0;
    for (let n = filaEncabezado + 1; n <= hoja.rowCount; n++) {
      const celda = hoja.getRow(n).getCell(columna.numero);
      const forma = formaDe(celda.value);
      formas.set(forma, (formas.get(forma) ?? 0) + 1);
      if (forma !== 'vacía') {
        llenas += 1;
        const simple = valorSimple(celda);
        distintos.add(String(simple));
        if (forma === 'texto' || forma === 'texto con forma de número' || forma === 'texto con forma de fecha') textos.push(String(simple).trim());
      }
    }
    const resumenFormas = [...formas.entries()]
      .filter(([forma]) => forma !== 'vacía')
      .sort((a, b) => b[1] - a[1])
      .map(([forma, cantidad]) => `${forma} ${cantidad}`)
      .join(', ');
    const patron = patronDeTexto(textos);
    const repetidos = llenas > 0 ? (distintos.size === llenas ? 'todos distintos' : `${distintos.size} distintos de ${llenas}`) : '';
    const nombre = textoSeguro(columna.encabezado);
    if (nombre.startsWith('[')) ocultos += 1;
    console.log(`  · Columna ${columna.numero} "${nombre}": llena ${llenas} de ${total}${resumenFormas ? ` · ${resumenFormas}` : ''}${repetidos ? ` · ${repetidos}` : ''}${patron ? ` · ${patron}` : ''}`);
  }
  console.log('');
}

console.log('Solo se mostraron nombres de hojas, encabezados reconocidos y formas de los datos. No se imprimió ningún valor de las celdas.');
if (ocultos > 0) console.log(`${ocultos} encabezado(s) quedaron ocultos por no ser palabras de encabezado conocidas; dime qué son, o usa --permitir con sus palabras.`);
