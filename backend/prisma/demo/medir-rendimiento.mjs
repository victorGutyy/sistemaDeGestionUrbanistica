// Mide el rendimiento contra la API de la base de VOLUMEN (RNF-REN-01..04).
//   1) npm run demo:volumen            (una vez: carga 10 proyectos, 1.000 lotes y unos 5.000 abonos)
//   2) npm run demo:api -- volumen     (en otra terminal: API en el puerto 3002)
//   3) npm run demo:medir              (esta medición; acepta --url http://localhost:3002)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argumentos = process.argv.slice(2);
const url = (argumentos.includes('--url') ? argumentos[argumentos.indexOf('--url') + 1] : 'http://localhost:3002').replace(/\/$/, '');
const REPETICIONES = 7;

const credenciales = readFileSync(join(process.cwd(), '.demo', 'volumen', 'credenciales.txt'), 'utf8');
const [, email, password] = /Administrador:\s+(\S+)\s+(\S+)/.exec(credenciales) ?? [];
if (!email) throw new Error('No encuentro las credenciales en backend/.demo/volumen/credenciales.txt');

const [, emailGerente, passwordGerente] = /Gerente:\s+(\S+)\s+(\S+)/.exec(credenciales) ?? [];

const iniciarSesion = async (usuario = { email, password }) => {
  const respuesta = await fetch(`${url}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(usuario) });
  if (!respuesta.ok) throw new Error(`No se pudo iniciar sesión (${respuesta.status})`);
  return (await respuesta.json()).accessToken;
};

// Una petición completa (incluye descargar el cuerpo, como lo haría el navegador). Devuelve milisegundos y bytes.
const pedir = async (token, ruta) => {
  const inicio = performance.now();
  const respuesta = await fetch(url + ruta, { headers: { Authorization: `Bearer ${token}` } });
  const cuerpo = Buffer.from(await respuesta.arrayBuffer());
  const ms = performance.now() - inicio;
  if (!respuesta.ok) throw new Error(`${ruta} → ${respuesta.status} ${cuerpo.toString('utf8').slice(0, 200)}`);
  return { ms, bytes: cuerpo.length, cuerpo };
};

const percentil = (valores, p) => {
  const orden = [...valores].sort((a, b) => a - b);
  return orden[Math.min(orden.length - 1, Math.ceil((p / 100) * orden.length) - 1)];
};
const resumen = (valores) => ({ min: Math.min(...valores), mediana: percentil(valores, 50), p95: percentil(valores, 95), max: Math.max(...valores) });
const redondear = (n) => Math.round(n);

async function medir(token, nombre, ruta, limiteMs) {
  await pedir(token, ruta); // calentamiento: la primera vez compila consultas y abre conexiones
  const tiempos = [];
  let bytes = 0;
  for (let i = 0; i < REPETICIONES; i++) {
    const r = await pedir(token, ruta);
    tiempos.push(r.ms);
    bytes = r.bytes;
  }
  const r = resumen(tiempos);
  return { nombre, ruta, limiteMs, bytes, mediana: redondear(r.mediana), p95: redondear(r.p95), max: redondear(r.max), cumple: r.p95 < limiteMs };
}

const token = await iniciarSesion();
const tokenGerente = await iniciarSesion({ email: emailGerente, password: passwordGerente });
const resultados = { fecha: new Date().toISOString(), url, repeticiones: REPETICIONES };

// ---- RNF-REN-01: pantallas de consulta < 2 s ----
const consultas = [
  ['Proyectos', '/proyectos'],
  ['Lotes (todos)', '/lotes'],
  ['Clientes (todos)', '/clientes'],
  ['Clientes (búsqueda)', '/clientes?buscar=Rojas'],
  ['Ventas', '/ventas'],
  ['Cartera por cliente', '/cartera'],
  ['Cartera por proyecto', '/cartera/reporte'],
  ['Tablero', '/dashboard'],
  ['Finanzas: movimientos', '/finanzas/movimientos'],
  ['Finanzas: consolidado', '/finanzas/consolidado'],
  ['Nómina: pagos', '/nomina/pagos'],
  ['Recibos (búsqueda)', '/recibos'],
  ['Cierres de caja', '/cierres-caja'],
  ['Reporte de cartera por edades (pantalla)', '/reportes/cartera-edades'],
  ['Reporte de recaudo (pantalla)', '/reportes/recaudo'],
];
resultados.consulta = [];
for (const [nombre, ruta] of consultas) {
  try {
    resultados.consulta.push(await medir(token, nombre, ruta, 2000));
  } catch (error) {
    resultados.consulta.push({ nombre, ruta, limiteMs: 2000, error: String(error.message ?? error), cumple: false });
  }
}

// ---- RNF-REN-02: buscar un cliente y obtener su estado de cuenta < 1 min ----
{
  const inicio = performance.now();
  const lista = JSON.parse((await pedir(token, '/clientes?buscar=Rojas')).cuerpo.toString('utf8'));
  const clientes = Array.isArray(lista) ? lista : (lista.clientes ?? lista.items ?? []);
  const objetivo = clientes[0];
  if (!objetivo) throw new Error('La búsqueda de clientes no devolvió resultados');
  await pedir(token, `/clientes/${objetivo.id}`);
  const pdf = await pedir(token, `/clientes/${objetivo.id}/estado-cuenta`);
  const total = performance.now() - inicio;
  resultados.estadoDeCuenta = { cliente: objetivo.nombre, totalMs: redondear(total), pdfMs: redondear(pdf.ms), pdfBytes: pdf.bytes, limiteMs: 60000, cumple: total < 60000 };
}

// ---- RNF-REN-03: reportes PDF y Excel < 10 s ----
const reportes = [
  ['Tablero en PDF', '/dashboard/exportar?formato=pdf'],
  ['Tablero en Excel', '/dashboard/exportar?formato=excel'],
  ['Exportación completa a Excel (gerente)', '/exportacion/completa', true],
  // Reportes de la Etapa 2 (RF-REP-10): todo el historial, que es el caso más pesado.
  ['Reporte de recaudo en PDF', '/reportes/recaudo/exportar?formato=pdf'],
  ['Reporte de recaudo en Excel', '/reportes/recaudo/exportar?formato=excel'],
  ['Cartera por edades en PDF', '/reportes/cartera-edades/exportar?formato=pdf'],
  ['Cartera por edades en Excel', '/reportes/cartera-edades/exportar?formato=excel'],
  ['Egresos por categoría en PDF', '/reportes/egresos/exportar?formato=pdf'],
  ['Inventario de lotes en PDF', '/reportes/inventario-lotes/exportar?formato=pdf'],
  ['Flujo de caja mensual en PDF', `/reportes/flujo-caja/exportar?formato=pdf&desde=2025-01-01&hasta=${new Date().toISOString().slice(0, 10)}&granularidad=MES`],
  ['Flujo de caja diario en Excel', `/reportes/flujo-caja/exportar?formato=excel&desde=${new Date(Date.now() - 300 * 86400000).toISOString().slice(0, 10)}&hasta=${new Date().toISOString().slice(0, 10)}&granularidad=DIA`],
];
resultados.reportes = [];
for (const [nombre, ruta, soloGerente] of reportes) {
  try {
    const tiempos = [];
    let bytes = 0;
    for (let i = 0; i < 3; i++) {
      const r = await pedir(soloGerente ? tokenGerente : token, ruta);
      tiempos.push(r.ms);
      bytes = r.bytes;
    }
    const r = resumen(tiempos);
    resultados.reportes.push({ nombre, ruta, limiteMs: 10000, bytes, mediana: redondear(r.mediana), max: redondear(r.max), cumple: r.max < 10000 });
  } catch (error) {
    resultados.reportes.push({ nombre, ruta, limiteMs: 10000, error: String(error.message ?? error), cumple: false });
  }
}

// ---- RNF-REN-04: 10 usuarios simultáneos sin degradarse ----
{
  const mezcla = ['/proyectos', '/clientes', '/ventas', '/cartera', '/dashboard', '/finanzas/movimientos'];
  const rondas = 5;
  const base = [];
  for (const ruta of mezcla) base.push((await pedir(token, ruta)).ms);
  const lineaBase = resumen(base).mediana;

  // Con pausas = personas reales (leen la pantalla 1 a 3 s antes de la siguiente acción); sin pausas = prueba de
  // esfuerzo (cada usuario dispara su siguiente petición apenas recibe la anterior).
  const simular = async (usuarios, conPausas) => {
    const sesiones = await Promise.all(Array.from({ length: usuarios }, () => iniciarSesion()));
    const tiempos = [];
    let errores = 0;
    const inicio = performance.now();
    await Promise.all(
      sesiones.map(async (sesion, indice) => {
        for (let ronda = 0; ronda < rondas; ronda++) {
          for (let k = 0; k < mezcla.length; k++) {
            try {
              tiempos.push((await pedir(sesion, mezcla[(k + indice) % mezcla.length])).ms);
            } catch {
              errores += 1;
            }
            if (conPausas) await new Promise((resolver) => setTimeout(resolver, 1000 + Math.random() * 2000));
          }
        }
      }),
    );
    const r = resumen(tiempos);
    return { usuarios, conPausas, peticiones: tiempos.length + errores, errores, medianaMs: redondear(r.mediana), p95Ms: redondear(r.p95), maxMs: redondear(r.max), totalMs: redondear(performance.now() - inicio) };
  };
  const diez = await simular(10, true);
  const diezSinPausas = await simular(10, false);
  const treintaSinPausas = await simular(30, false);
  resultados.concurrencia = { medianaIndividualMs: redondear(lineaBase), diez, diezSinPausas, treintaSinPausas, limiteMs: 2000, cumple: diez.errores === 0 && diez.p95Ms < 2000 };
}

const carpeta = join(process.cwd(), '.demo', 'volumen');
writeFileSync(join(carpeta, 'medicion.json'), JSON.stringify(resultados, null, 2), 'utf8');

const marca = (ok) => (ok ? '✔' : '✘');
console.log('\nRNF-REN-01  Pantallas de consulta (límite 2 s, se evalúa el p95)');
for (const f of resultados.consulta) console.log(`  ${marca(f.cumple)} ${f.nombre.padEnd(26)} ${f.error ? f.error : `mediana ${f.mediana} ms · p95 ${f.p95} ms · ${(f.bytes / 1024).toFixed(0)} KB`}`);
const e = resultados.estadoDeCuenta;
console.log(`\nRNF-REN-02  Estado de cuenta (límite 60 s)\n  ${marca(e.cumple)} ${e.cliente}: búsqueda + ficha + PDF en ${e.totalMs} ms (PDF ${e.pdfMs} ms, ${(e.pdfBytes / 1024).toFixed(0)} KB)`);
console.log('\nRNF-REN-03  Reportes PDF y Excel (límite 10 s)');
for (const f of resultados.reportes) console.log(`  ${marca(f.cumple)} ${f.nombre.padEnd(30)} ${f.error ? f.error : `mediana ${f.mediana} ms · máx ${f.max} ms · ${(f.bytes / 1024).toFixed(0)} KB`}`);
const c = resultados.concurrencia;
console.log(`\nRNF-REN-04  Usuarios simultáneos (referencia individual: mediana ${c.medianaIndividualMs} ms)`);
for (const f of [c.diez, c.diezSinPausas, c.treintaSinPausas]) console.log(`  ${f.errores === 0 ? '✔' : '✘'} ${String(f.usuarios).padStart(2)} usuarios ${f.conPausas ? 'con pausas  ' : 'sin pausas (esfuerzo)'}: ${f.peticiones} peticiones, ${f.errores} errores, mediana ${f.medianaMs} ms · p95 ${f.p95Ms} ms · máx ${f.maxMs} ms`);
console.log(`\nDetalle guardado en backend/.demo/volumen/medicion.json`);
