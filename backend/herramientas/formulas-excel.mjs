// Muestra QUÉ HACEN las fórmulas de una hoja de Excel, sin mostrar valores: cada referencia a una celda se reemplaza por
// su posición relativa (por ejemplo "[col -2]" = dos columnas a la izquierda) y cada número escrito dentro de la
// fórmula por "#". Sirve para entender la lógica de un libro (cuotas, saldos, fechas) sin ver datos.
//
// Uso (desde backend/):
//   node herramientas/formulas-excel.mjs "../datos-reales/archivo.xlsx" "Nombre de la hoja"
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');

const [ruta, nombreHoja] = process.argv.slice(2);
if (!ruta || !nombreHoja) {
  console.error('Uso: node herramientas/formulas-excel.mjs "archivo.xlsx" "Nombre de la hoja"');
  process.exit(1);
}

const libro = new ExcelJS.Workbook();
await libro.xlsx.readFile(ruta);
const hoja = libro.getWorksheet(nombreHoja);
if (!hoja) {
  console.error(`No existe la hoja "${nombreHoja}". Hojas: ${libro.worksheets.map((h) => h.name).join(', ')}`);
  process.exit(1);
}

function letrasANumero(letras) {
  return [...letras].reduce((total, letra) => total * 26 + (letra.charCodeAt(0) - 64), 0);
}

// "=K10+30" en la celda de la columna 13, fila 12  ->  "=[col -2, fila -2]+#"
function normalizar(formula, columna, fila) {
  return formula
    .replace(/'[^']*'!|[A-Za-z0-9_]+!/g, 'OTRAHOJA!')
    .replace(/\$?([A-Z]{1,3})\$?(\d+)/g, (_, letras, numero) => `[col ${letrasANumero(letras) - columna >= 0 ? '+' : ''}${letrasANumero(letras) - columna}, fila ${Number(numero) - fila >= 0 ? '+' : ''}${Number(numero) - fila}]`)
    .replace(/"[^"]*"/g, '"texto"')
    .replace(/(?<![\w[])\d+(\.\d+)?/g, '#');
}

const patrones = new Map();
hoja.eachRow({ includeEmpty: false }, (fila, numeroFila) => {
  fila.eachCell({ includeEmpty: false }, (celda, numeroColumna) => {
    const v = celda.value;
    const formula = v && typeof v === 'object' && !(v instanceof Date) ? (v.formula ?? (v.sharedFormula ? celda.formula : null)) : null;
    if (!formula) return;
    const clave = `${numeroColumna}|${normalizar(`=${formula}`, numeroColumna, numeroFila)}`;
    patrones.set(clave, (patrones.get(clave) ?? 0) + 1);
  });
});

console.log(`Hoja "${hoja.name}": patrones de fórmulas por columna (solo estructura)\n`);
const porColumna = new Map();
for (const [clave, veces] of patrones) {
  const [columna, patron] = clave.split('|');
  porColumna.set(Number(columna), [...(porColumna.get(Number(columna)) ?? []), { patron, veces }]);
}
for (const columna of [...porColumna.keys()].sort((a, b) => a - b)) {
  const lista = porColumna.get(columna).sort((a, b) => b.veces - a.veces).slice(0, 3);
  console.log(`Columna ${columna}:`);
  for (const { patron, veces } of lista) console.log(`  ${veces} veces: ${patron}`);
}
if (patrones.size === 0) console.log('Esta hoja no tiene fórmulas.');
console.log('\nNo se imprimió ningún valor de las celdas.');
