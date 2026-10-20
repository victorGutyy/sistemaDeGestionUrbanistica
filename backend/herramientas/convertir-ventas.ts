// Conversor de un libro de "ventas por lote" (una fila por lote, con los abonos puestos en horizontal: cuota inicial y
// un par fecha/valor por mes) a la plantilla estándar de importación (hojas Proyectos, Lotes, Clientes, Ventas y Abonos).
//
// Es una herramienta de UNA sola vez para la puesta en marcha: corre en el computador de quien migra, lee el Excel
// original y deja el libro convertido en `datos-reales/` (fuera de Git). Ese libro se revisa a ojo, se corrige lo que
// falte y se carga por la pantalla "Importar Excel", que valida sin guardar y reporta la conciliación de saldos.
//
// Confidencialidad: el conversor NUNCA imprime datos del libro. Solo imprime cuántas filas generó y los NÚMEROS DE FILA
// que necesitan atención (por ejemplo "sin cédula"), para que se corrijan en el Excel.
//
// Uso (desde backend/):
//   npm run datos:convertir-ventas -- "../datos-reales/VENTAS.xlsx" --proyecto "Nombre del proyecto" [--hoja VENTAS] [--medio Efectivo] [--salida ../datos-reales/ventas-convertido.xlsx]
import ExcelJS from 'exceljs';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { limpiarTexto, normalizarTexto } from '../src/importacion/celdas.js';
import { generarPlantilla } from '../src/importacion/plantilla.js';
import { HOJAS, MEDIOS_DE_PAGO, type ClaveHoja } from '../src/importacion/plantilla-definicion.js';

export interface OpcionesConversion {
  proyecto: string;
  medioPago: string;
}

export type FilaConvertida = Record<string, string | number | Date | null>;

export interface ResultadoConversion {
  proyectos: FilaConvertida[];
  lotes: FilaConvertida[];
  clientes: FilaConvertida[];
  ventas: FilaConvertida[];
  abonos: FilaConvertida[];
  // Avisos por tipo, con los números de fila del Excel original (nunca valores).
  avisos: Map<string, number[]>;
  // Filas del original cuyo ABONO TOTAL (calculado por su Excel) no coincide con la suma de lo que se convirtió.
  filasQueNoCuadran: number[];
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const FILAS_PARA_BUSCAR_ENCABEZADO = 15;

type Valor = string | number | boolean | Date | null;

// Lo que hay en una celda ya como valor simple (las fórmulas entregan el resultado que guardó Excel).
function valorDe(celda: ExcelJS.Cell): Valor {
  const v = celda.value;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) {
      const r = v.result as unknown;
      return r instanceof Date || typeof r === 'string' || typeof r === 'number' || typeof r === 'boolean' ? r : null;
    }
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return String(v.text);
    return null;
  }
  return v;
}

const vacio = (v: Valor) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

function aNumero(v: Valor): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const limpio = v.replace(/[$\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
    const n = Number(limpio);
    return limpio !== '' && Number.isFinite(n) ? n : null;
  }
  return null;
}

// Fecha como la quiere la plantilla: una fecha de Excel o un texto dd/mm/aaaa.
function aFecha(v: Valor): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === 'string') {
    const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(v.trim());
    if (m) return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  }
  return null;
}

// Documento: solo dígitos si es una cédula; si trae letras o guion (un NIT, un pasaporte) se deja como está.
function limpiarDocumento(v: Valor): string | null {
  if (vacio(v)) return null;
  const texto = typeof v === 'number' ? String(Math.trunc(v)) : limpiarTexto(String(v));
  const soloDigitos = texto.replace(/[.\s]/g, '');
  return /^\d+$/.test(soloDigitos) ? soloDigitos : texto;
}

// "A 12", "A-12" o "A12" → manzana "A" y lote "12". Lo que no tenga esa forma se deja entero como número de lote.
export function partirNomenclatura(texto: string): { manzana: string | null; numero: string; reconocida: boolean } {
  const m = /^([A-Za-zÑñ]+)[\s\-._]*(\d+)$/.exec(limpiarTexto(texto));
  return m ? { manzana: m[1].toUpperCase(), numero: m[2], reconocida: true } : { manzana: null, numero: limpiarTexto(texto), reconocida: false };
}

interface Columnas {
  filaEncabezado: number;
  nomenclatura: number;
  cedula?: number;
  cliente?: number;
  celular?: number;
  fecha?: number;
  area?: number;
  valorLote?: number;
  vrCuota?: number;
  saldo?: number;
  abonoTotal?: number;
  // Cuota inicial y cada mes: la columna del valor y la de su fecha (la inmediata a la izquierda).
  pagos: { nombre: string; valor: number; fecha: number }[];
}

function ubicarColumnas(hoja: ExcelJS.Worksheet): Columnas {
  for (let n = 1; n <= Math.min(hoja.rowCount, FILAS_PARA_BUSCAR_ENCABEZADO); n++) {
    const encabezados = new Map<number, string>();
    hoja.getRow(n).eachCell({ includeEmpty: false }, (celda, columna) => {
      const v = valorDe(celda);
      if (typeof v === 'string' && v.trim() !== '') encabezados.set(columna, normalizarTexto(v));
    });
    const nomenclatura = [...encabezados].find(([, t]) => t === 'nomenclatura')?.[0];
    if (!nomenclatura) continue;

    const buscar = (prueba: (t: string) => boolean) => [...encabezados].find(([, t]) => prueba(t))?.[0];
    const pagos: Columnas['pagos'] = [];
    const inicial = buscar((t) => /^cuota ini/.test(t));
    if (inicial) pagos.push({ nombre: 'cuota inicial', valor: inicial, fecha: inicial - 1 });
    for (const [columna, texto] of [...encabezados].sort((a, b) => a[0] - b[0])) {
      if (MESES.includes(texto)) pagos.push({ nombre: texto, valor: columna, fecha: columna - 1 });
    }
    return {
      filaEncabezado: n,
      nomenclatura,
      cedula: buscar((t) => t.includes('cedula')),
      cliente: buscar((t) => t === 'cliente'),
      celular: buscar((t) => t === 'celular' || t === 'telefono'),
      fecha: buscar((t) => t === 'fecha'),
      area: buscar((t) => t === 'm2 lote' || t.startsWith('area')),
      valorLote: buscar((t) => t === 'valor lote'),
      vrCuota: buscar((t) => t === 'vr cuota' || t === 'valor cuota'),
      saldo: buscar((t) => t === 'saldo lote'),
      abonoTotal: buscar((t) => t === 'abono total'),
      pagos,
    };
  }
  throw new Error('No encontré la fila de encabezados (la que tiene la columna NOMENCLATURA) en las primeras filas de la hoja.');
}

export function convertirVentas(hoja: ExcelJS.Worksheet, opciones: OpcionesConversion): ResultadoConversion {
  const columnas = ubicarColumnas(hoja);
  const resultado: ResultadoConversion = { proyectos: [], lotes: [], clientes: [], ventas: [], abonos: [], avisos: new Map(), filasQueNoCuadran: [] };
  const avisar = (tipo: string, fila: number) => resultado.avisos.set(tipo, [...(resultado.avisos.get(tipo) ?? []), fila]);

  resultado.proyectos.push({ nombre: opciones.proyecto });
  const clientes = new Map<string, { fila: FilaConvertida; nombreNormalizado: string }>();
  const lotesVistos = new Set<string>();

  const leer = (fila: ExcelJS.Row, columna?: number): Valor => (columna ? valorDe(fila.getCell(columna)) : null);

  for (let numeroFila = columnas.filaEncabezado + 1; numeroFila <= hoja.rowCount; numeroFila++) {
    const fila = hoja.getRow(numeroFila);
    const nomenclatura = leer(fila, columnas.nomenclatura);
    // Las filas de totales y las vacías no tienen nomenclatura.
    if (vacio(nomenclatura)) continue;

    const lote = partirNomenclatura(String(nomenclatura));
    if (!lote.reconocida) avisar('Nomenclatura con formato inesperado (se usó entera como número de lote)', numeroFila);
    const claveLote = `${lote.manzana ?? ''}|${lote.numero}`;
    if (lotesVistos.has(claveLote)) {
      avisar('Lote repetido en el original (se omitió la repetición)', numeroFila);
      continue;
    }
    lotesVistos.add(claveLote);

    const valorLote = aNumero(leer(fila, columnas.valorLote));
    const area = aNumero(leer(fila, columnas.area));
    resultado.lotes.push({ proyecto: opciones.proyecto, manzana: lote.manzana, numero: lote.numero, area, valorVenta: valorLote });
    if (area === null) avisar('Lote sin área (la plantilla la pide)', numeroFila);
    if (valorLote === null) avisar('Lote sin valor (la plantilla lo pide)', numeroFila);

    // Hay venta cuando la fila trae cliente o cédula.
    const nombre = vacio(leer(fila, columnas.cliente)) ? null : limpiarTexto(String(leer(fila, columnas.cliente)));
    const documento = limpiarDocumento(leer(fila, columnas.cedula));
    if (!nombre && !documento) continue;

    if (!documento) avisar('Venta sin cédula (no se creó el cliente; completa Clientes y Ventas)', numeroFila);
    if (!nombre) avisar('Venta sin nombre del cliente', numeroFila);
    if (documento && nombre) {
      const existente = clientes.get(documento);
      const telefonoCrudo = leer(fila, columnas.celular);
      const telefono = vacio(telefonoCrudo) ? null : typeof telefonoCrudo === 'number' ? String(Math.trunc(telefonoCrudo)) : limpiarTexto(String(telefonoCrudo));
      if (!existente) {
        clientes.set(documento, { fila: { documento, tipoDocumento: 'CC', nombre, telefono }, nombreNormalizado: normalizarTexto(nombre) });
      } else if (existente.nombreNormalizado !== normalizarTexto(nombre)) {
        avisar('La misma cédula aparece con otro nombre (se dejó el primero)', numeroFila);
      }
    }

    // Pagos: la cuota inicial y cada mes, con la fecha de la columna inmediata a la izquierda.
    const pagos: { fecha: Date | null; valor: number }[] = [];
    let sumaConvertida = 0;
    for (const pago of columnas.pagos) {
      const valor = aNumero(leer(fila, pago.valor));
      if (valor === null || valor <= 0) continue;
      const fecha = pago.fecha >= 1 ? aFecha(leer(fila, pago.fecha)) : null;
      if (!fecha) avisar(`Pago de ${pago.nombre} sin fecha (la plantilla la pide)`, numeroFila);
      pagos.push({ fecha, valor });
      sumaConvertida += valor;
      resultado.abonos.push({ proyecto: opciones.proyecto, manzana: lote.manzana, numero: lote.numero, fecha, valor, medioPago: opciones.medioPago });
    }
    const abonoTotal = aNumero(leer(fila, columnas.abonoTotal));
    if (abonoTotal !== null && Math.round(abonoTotal) !== Math.round(sumaConvertida)) resultado.filasQueNoCuadran.push(numeroFila);

    const inicial = columnas.pagos.find((p) => p.nombre === 'cuota inicial');
    const valorInicial = inicial ? aNumero(leer(fila, inicial.valor)) : null;
    const fechaInicial = inicial && inicial.fecha >= 1 ? aFecha(leer(fila, inicial.fecha)) : null;
    const vrCuota = aNumero(leer(fila, columnas.vrCuota));
    const financiado = vrCuota !== null && vrCuota > 0;
    const saldoPendiente = valorLote !== null ? valorLote - (valorInicial ?? 0) : null;
    const fechaVenta = aFecha(leer(fila, columnas.fecha));
    if (!fechaVenta) avisar('Venta sin fecha de venta (la plantilla la pide)', numeroFila);

    resultado.ventas.push({
      proyecto: opciones.proyecto,
      manzana: lote.manzana,
      numero: lote.numero,
      documentoCliente: documento,
      fechaVenta,
      formaPago: financiado ? 'Financiado' : 'Contado',
      valorTotal: valorLote,
      cuotaInicial: financiado ? (valorInicial ?? 0) : null,
      fechaCuotaInicial: financiado ? fechaInicial : null,
      numeroCuotas: financiado && saldoPendiente !== null && saldoPendiente > 0 ? Math.ceil(saldoPendiente / vrCuota) : null,
      saldoSegunExcel: aNumero(leer(fila, columnas.saldo)),
    });
    if (financiado && valorInicial === null) avisar('Venta financiada sin cuota inicial (se tomó como 0)', numeroFila);
  }

  resultado.clientes = [...clientes.values()].map((c) => c.fila);
  return resultado;
}

// Escribe el resultado sobre la plantilla estándar (con sus encabezados, listas y ayudas).
export async function escribirPlantilla(resultado: ResultadoConversion): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load((await generarPlantilla()) as unknown as ExcelJS.Buffer);

  const datos: Record<Exclude<ClaveHoja, 'cuotas'>, FilaConvertida[]> = {
    proyectos: resultado.proyectos,
    lotes: resultado.lotes,
    clientes: resultado.clientes,
    ventas: resultado.ventas,
    abonos: resultado.abonos,
  };
  for (const definicion of HOJAS) {
    if (definicion.clave === 'cuotas') continue;
    const hoja = libro.getWorksheet(definicion.nombre);
    if (!hoja) throw new Error(`La plantilla no trae la hoja ${definicion.nombre}`);
    datos[definicion.clave].forEach((fila, indice) => {
      definicion.columnas.forEach((columna, posicion) => {
        const valor = fila[columna.clave];
        if (valor !== null && valor !== undefined) hoja.getRow(indice + 2).getCell(posicion + 1).value = valor;
      });
    });
  }
  return Buffer.from(await libro.xlsx.writeBuffer());
}

// ---------------------------------------------------------------------------------------------
// Línea de comandos
// ---------------------------------------------------------------------------------------------
function argumento(args: string[], nombre: string): string | undefined {
  const i = args.indexOf(nombre);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const entrada = args.find((a) => !a.startsWith('--'));
  const proyecto = argumento(args, '--proyecto');
  if (!entrada || !proyecto) {
    console.error('Uso: npm run datos:convertir-ventas -- "archivo.xlsx" --proyecto "Nombre del proyecto" [--hoja VENTAS] [--medio Efectivo] [--salida ruta.xlsx]');
    process.exit(1);
  }
  const medio = argumento(args, '--medio') ?? 'Efectivo';
  if (!MEDIOS_DE_PAGO.includes(medio)) {
    console.error(`El medio de pago debe ser uno de: ${MEDIOS_DE_PAGO.join(', ')}`);
    process.exit(1);
  }
  const salida = resolve(argumento(args, '--salida') ?? '../datos-reales/ventas-convertido.xlsx');

  const origen = new ExcelJS.Workbook();
  await origen.xlsx.readFile(entrada);
  const nombreHoja = argumento(args, '--hoja') ?? 'VENTAS';
  const hoja = origen.getWorksheet(nombreHoja);
  if (!hoja) {
    console.error(`No existe la hoja "${nombreHoja}". Hojas del archivo: ${origen.worksheets.map((h) => h.name).join(', ')}`);
    process.exit(1);
  }

  const resultado = convertirVentas(hoja, { proyecto, medioPago: medio });
  mkdirSync(dirname(salida), { recursive: true });
  await (await import('node:fs/promises')).writeFile(salida, await escribirPlantilla(resultado));

  console.log(`Conversión lista → ${salida}`);
  console.log(`  Proyectos: ${resultado.proyectos.length} · Lotes: ${resultado.lotes.length} · Clientes: ${resultado.clientes.length} · Ventas: ${resultado.ventas.length} · Abonos: ${resultado.abonos.length}`);
  console.log(`  Ventas financiadas: ${resultado.ventas.filter((v) => v.formaPago === 'Financiado').length} · de contado: ${resultado.ventas.filter((v) => v.formaPago === 'Contado').length}`);
  console.log(`  Filas cuyo ABONO TOTAL del original no coincide con la suma de los abonos convertidos: ${resultado.filasQueNoCuadran.length}${resultado.filasQueNoCuadran.length ? ` (filas ${resultado.filasQueNoCuadran.join(', ')})` : ''}`);
  if (resultado.avisos.size === 0) {
    console.log('  Sin avisos.');
  } else {
    console.log('  Avisos (números de fila del Excel original):');
    for (const [tipo, filas] of resultado.avisos) console.log(`   · ${tipo}: ${filas.length} fila(s) — ${filas.slice(0, 40).join(', ')}${filas.length > 40 ? '…' : ''}`);
  }
  console.log(`  Todos los abonos quedaron con medio de pago "${medio}": el original no dice cómo se pagó cada uno.`);
  console.log('  Completa los datos que falten en el libro convertido y cárgalo en "Importar Excel": allí se valida sin guardar.');
}

// Solo corre al ejecutarlo por la línea de comandos (las pruebas importan las funciones sin disparar esto).
if (process.argv[1] && /convertir-ventas\.(js|ts)$/.test(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
