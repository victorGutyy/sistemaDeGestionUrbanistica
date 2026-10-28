// Toma las capturas del manual de usuario con la base de DEMOSTRACIÓN (datos inventados).
//
// Antes: en backend/ -> npm run demo:preparar -- --reiniciar, luego npm run demo:api (puerto 3001),
// y en frontend/ -> npm run dev:demo (puerto 5174). Después, desde la raíz del proyecto:
//   node docs/manual/herramientas/capturar-manual.mjs            (todas las capturas)
//   node docs/manual/herramientas/capturar-manual.mjs ventas     (solo las del capítulo "ventas")
// Escribe docs/manual/capturas/*.png y docs/manual/capturas/manifiesto.json (título y leyenda de cada figura).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Navegador } from './navegador.mjs';

const API = 'http://localhost:3001', FRONT = 'http://localhost:5174';
const RAIZ = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\\/g, '/');
const SALIDA = RAIZ + 'docs/manual/capturas/';
const CREDENCIALES = RAIZ + 'backend/.demo/demo/credenciales.txt';
mkdirSync(SALIDA, { recursive: true });

const filtro = process.argv.slice(2);
const manifiestoRuta = SALIDA + 'manifiesto.json';
const manifiesto = existsSync(manifiestoRuta) ? JSON.parse(readFileSync(manifiestoRuta, 'utf8')) : {};

// ---------------------------------------------------------------- sesión
const lineas = readFileSync(CREDENCIALES, 'utf8').split('\n');
function credencial(prefijo) {
  const l = lineas.find((x) => x.startsWith(prefijo));
  const m = l.match(/(\S+@\S+)\s+(\S+)\s*$/);
  return { email: m[1], password: m[2] };
}
async function token(prefijo) {
  const r = await fetch(API + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(credencial(prefijo)) });
  return (await r.json()).accessToken;
}
const tokenGerente = await token('Gerente:');
const llamar = async (ruta, opciones = {}) => {
  const r = await fetch(API + ruta, { ...opciones, headers: { authorization: 'Bearer ' + tokenGerente, 'content-type': 'application/json', ...(opciones.headers ?? {}) } });
  return r.headers.get('content-type')?.includes('json') ? r.json() : r;
};

const nav = await Navegador.abrir();
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
let capitulo = '';

// ---------------------------------------------------------------- ayudas dentro de la página
const JS_AYUDAS = `
window.__buscar = (texto, campo, tag) => {
  const t = texto.toLowerCase();
  const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const norm = (e) => (e.innerText || e.value || e.getAttribute('aria-label') || e.placeholder || '').replace(/\\s+/g, ' ').trim().toLowerCase();
  if (campo) {
    const rotulos = [...document.querySelectorAll('label, p, span, div, legend, h3, h4')].filter((e) => visible(e) && norm(e).startsWith(t) && norm(e).length < t.length + 60 && e.children.length < 4);
    for (const rot of rotulos) {
      const ctl = rot.control || (rot.htmlFor && document.getElementById(rot.htmlFor));
      if (ctl && visible(ctl)) return ctl;
      const todos = [...document.querySelectorAll('input:not([type=radio]):not([type=checkbox]), select, textarea')].filter(visible);
      const sig = todos.find((c) => rot.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING);
      if (sig) return sig;
    }
    return null;
  }
  const cands = [...document.querySelectorAll('button, a, label, summary, h1, h2, h3, h4, th, [role=tab], select, input, textarea, p, span, div')].filter((e) => visible(e) && norm(e).includes(t) && (!tag || new RegExp('^(' + tag + ')$').test(e.tagName)));
  if (!cands.length) return null;
  const peso = (e) => (norm(e) === t ? 0 : norm(e).startsWith(t) ? 1 : 2) * 1e7 + (/^(BUTTON|A|LABEL|SUMMARY|SELECT|INPUT|H1|H2|H3|H4|TH)$/.test(e.tagName) ? 0 : 1e6) + e.getBoundingClientRect().width * e.getBoundingClientRect().height;
  return cands.sort((a, b) => peso(a) - peso(b))[0];
};
window.__marcar = (marcas) => {
  document.querySelectorAll('.__marca').forEach((e) => e.remove());
  document.querySelectorAll('[data-__marcado]').forEach((e) => { e.style.outline = ''; e.style.outlineOffset = ''; e.removeAttribute('data-__marcado'); });
  const faltan = [];
  for (const m of marcas) {
    let el = m.sel ? document.querySelector(m.sel) : window.__buscar(m.t ?? m.campo, !!m.campo, m.tag);
    if (!el) { faltan.push(m.t ?? m.campo ?? m.sel); continue; }
    if (m.caja) el = el.closest('[class*="rounded"]') || el;
    el.setAttribute('data-__marcado', '1');
    el.style.outline = '2px solid #DC2626'; el.style.outlineOffset = '2px';
    const r = el.getBoundingClientRect();
    const d = document.createElement('div');
    d.className = '__marca'; d.textContent = String(m.n);
    d.style.cssText = 'position:fixed;z-index:99999;width:26px;height:26px;border-radius:50%;background:#DC2626;color:#fff;font:700 14px Arial;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);pointer-events:none;left:' + Math.max(2, r.left - 14) + 'px;top:' + Math.max(2, r.top - 14) + 'px';
    document.body.appendChild(d);
  }
  return faltan;
};
window.__irA = (texto) => {
  const el = window.__buscar(texto, false);
  if (!el) return false;
  el.scrollIntoView({ block: 'start' });
  const cont = el.closest('main') ; if (cont) cont.scrollTop = Math.max(0, cont.scrollTop - 24); else window.scrollBy(0, -24);
  return true;
};
true;`;

async function preparar() { await nav.evaluar(JS_AYUDAS); }
async function marcar(marcas = []) {
  await preparar();
  const faltan = await nav.evaluar(`window.__marcar(${JSON.stringify(marcas)})`);
  if (faltan.length) console.log('   (!) sin marcar:', faltan.join(' | '));
}
async function irA(texto) {
  await preparar();
  const ok = await nav.evaluar(`window.__irA(${JSON.stringify(texto)})`);
  if (!ok) console.log('   (!) no encontré para desplazar:', texto);
  await pausa(400);
}
async function llenar(campo, valor) {
  await preparar();
  const ok = await nav.evaluar(`(() => { const e = window.__buscar(${JSON.stringify(campo)}, true); if (!e) return false; e.setAttribute('data-__llenar', '1'); return true; })()`);
  if (!ok) { console.log('   (!) no encontré el campo:', campo); return; }
  const esSelect = await nav.evaluar(`document.querySelector('[data-__llenar]').tagName === 'SELECT'`);
  if (esSelect) {
    await nav.evaluar(`(() => { const s = document.querySelector('[data-__llenar]'); const o = [...s.options].find((x) => x.text.toLowerCase().includes(${JSON.stringify(String(valor).toLowerCase())})); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, o.value); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  } else {
    await nav.escribir('[data-__llenar]', String(valor));
  }
  await nav.evaluar(`document.querySelector('[data-__llenar]').removeAttribute('data-__llenar')`);
  await pausa(250);
}

// ---------------------------------------------------------------- captura
async function foto(id, titulo, { marcas = [], antes, ancho = 1100, alto = 960, movil = false, conMenu = false, desplazar, nota, leyenda } = {}) {
  console.log('  ·', id);
  if (antes) await antes();
  await nav.tamano(ancho, alto, movil);
  if (desplazar) await irA(desplazar);
  await nav.esperarCarga(500);
  if (!desplazar) await nav.evaluar(`(() => { window.scrollTo(0, 0); document.querySelectorAll('main, [class*="overflow"]').forEach((e) => { e.scrollTop = 0; }); return true; })()`);
  await marcar(marcas);
  await pausa(300);
  // Las pantallas de módulo se recortan sin el menú lateral (240 px) para que el texto se lea más grande en el manual.
  const sinMenu = !conMenu && !movil && ancho >= 1000;
  await nav.capturar(SALIDA + id + '.png', sinMenu ? { x: 240, y: 0, width: ancho - 240, height: alto } : undefined);
  manifiesto[id] = {
    id, capitulo, titulo, nota: nota ?? null,
    leyenda: leyenda ?? marcas.filter((m) => m.r).map((m) => ({ n: m.n, texto: m.r })),
  };
}


// PDF servido por la API, abierto en el visor del navegador (sin barras) y recortado a la hoja.
async function fotoPdf(id, titulo, rutaApi, { ancho = 1200, alto = 1700, clip = { x: 4, y: 4, width: ancho - 8, height: alto - 4 } } = {}) {
  console.log('  ·', id, '(PDF)');
  const r = await llamar(rutaApi);
  const buf = Buffer.from(await r.arrayBuffer());
  const archivo = join(tmpdir(), `manual-${id}.pdf`);
  writeFileSync(archivo, buf);
  await nav.tamano(ancho, alto, false, 1);
  await nav.ir('file:///' + archivo.replaceAll('\\', '/') + '#toolbar=0&navpanes=0&scrollbar=0&view=FitH', 3000);
  await nav.capturar(SALIDA + id + '.png', clip);
  manifiesto[id] = { id, capitulo, titulo, nota: 'Documento generado con datos de demostración.', leyenda: [] };
  await conSesion(tokenGerente);
}

// Hace clic en el primer botón con ese texto que aparece DESPUÉS de un título dado (para distinguir botones repetidos).
async function clicDespuesDe(ancla, texto) {
  await preparar();
  const ok = await nav.evaluar(`(() => {
    const a = window.__buscar(${JSON.stringify(ancla)}, false); if (!a) return 'sin-ancla';
    const b = [...document.querySelectorAll('button')].filter((x) => x.getBoundingClientRect().width > 0 && x.innerText.trim().toLowerCase().includes(${JSON.stringify(texto.toLowerCase())}))
      .find((x) => a.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (!b) return 'sin-boton'; b.scrollIntoView({ block: 'center' }); b.click(); return 'ok';
  })()`);
  if (ok !== 'ok') console.log('   (!) clicDespuesDe:', ancla, '→', texto, ok);
  await pausa(700);
}

async function ir(ruta, extra = 1500) { await nav.ir(FRONT + ruta, extra); }
async function enlaceDe(seleccion, texto) {
  return nav.evaluar(`(() => { const a = [...document.querySelectorAll(${JSON.stringify(seleccion)})].find((x) => x.innerText.includes(${JSON.stringify(texto)})); return a ? a.getAttribute('href') : null; })()`);
}
async function conSesion(tk) { await nav.sesion(FRONT, tk); }

const cap = (nombre, fn) => async () => {
  if (filtro.length && !filtro.includes(nombre)) return;
  capitulo = nombre; console.log('\n== ' + nombre);
  if (nombre !== 'primeros-pasos') await conSesion(tokenGerente);
  await fn();
};

// ---------------------------------------------------------------- capítulos
const capitulos = [
  cap('primeros-pasos', async () => {
    await nav.cerrarSesion(FRONT);
    await ir('/login', 1000);
    await foto('ingreso', 'Pantalla de ingreso al sistema', { conMenu: true, alto: 700, marcas: [
      { campo: 'Correo', n: 1, r: 'Escribe aquí tu correo.' },
      { campo: 'Contraseña', n: 2, r: 'Escribe aquí tu contraseña.' },
      { t: 'Ingresar', n: 3, r: 'Pulsa este botón para entrar.' },
      { t: '¿Olvidaste tu contraseña?', n: 4, r: 'Si no recuerdas tu contraseña, entra por aquí.' },
    ] });
    await ir('/recuperar', 1000);
    await foto('recuperar', 'Pantalla para pedir el enlace de recuperación', { conMenu: true, alto: 640, marcas: [
      { campo: 'Correo', n: 1, r: 'Escribe el correo de tu cuenta.' },
      { t: 'Enviar enlace', n: 2, r: 'El sistema te manda un enlace para elegir una contraseña nueva.' },
    ] });
    await conSesion(tokenGerente);
    await ir('/dashboard', 2000);
    await foto('menu', 'Pantalla principal con el menú lateral', { conMenu: true, marcas: [
      { t: 'Panel general', n: 1, sel: 'nav a[href="/dashboard"]', r: 'El menú lateral: cada opción abre un módulo del sistema.' },
      { t: 'Gerente de demostración', n: 2, r: 'Aquí aparece tu nombre y tu rol.' },
      { t: 'Cerrar sesión', n: 3, r: 'Al terminar, cierra tu sesión con este botón.' },
    ] });
    await foto('movil-panel', 'El sistema en un celular', { ancho: 360, alto: 780, movil: true, marcas: [
      { t: 'Abrir menú', n: 1, r: 'Toca este botón para abrir el menú.' },
    ] });
    await foto('movil-menu', 'Menú abierto en el celular', { ancho: 360, alto: 780, movil: true, antes: async () => { await nav.clicTexto('Abrir menú'); } });
  }),

  cap('panel', async () => {
    await ir('/dashboard', 2000);
    await foto('panel-finanzas', 'Panel general: filtros y resumen de finanzas', { marcas: [
      { campo: 'Desde', n: 1, r: 'Filtra por fecha de inicio.' },
      { campo: 'Proyecto', n: 2, r: 'Mira todos los proyectos o solo uno.' },
      { t: 'Exportar PDF', n: 3, r: 'Descarga el panel en PDF.' },
      { t: 'Exportar Excel', n: 4, r: 'Descarga el panel en Excel.' },
      { t: 'Utilidad del período', n: 5, caja: true, r: 'Lo que realmente quedó en caja: ingresos menos gastos.' },
    ] });
    await foto('panel-pendientes', 'Panel general: pendientes y cartera', { desplazar: 'Pendientes', marcas: [
      { t: 'Cierres de caja por aprobar', n: 1, caja: true, r: 'Cierres que esperan la decisión del gerente.' },
      { t: 'Pagos por verificar contra el extracto', n: 2, caja: true, r: 'Pagos que faltan por confirmar con el banco.' },
      { t: 'Cartera vencida', n: 3, caja: true, tag: 'P|SPAN|DIV', r: 'Dinero que los clientes ya debieron pagar.' },
      { t: 'Interés de mora', n: 4, caja: true, tag: 'P|SPAN|DIV', r: 'Interés acumulado por los pagos atrasados.' },
    ] });
    await foto('panel-lotes', 'Panel general: lotes por estado', { desplazar: 'Lotes por estado' });
    await foto('panel-proyecto', 'Panel general filtrado por un proyecto', {
      antes: async () => { await ir('/dashboard', 1500); await llenar('Proyecto', 'La Floresta'); await nav.esperarCarga(1200); },
      marcas: [{ campo: 'Proyecto', n: 1, r: 'Elige el proyecto y todo el panel se recalcula.' }],
    });
  }),

  cap('proyectos', async () => {
    await ir('/proyectos');
    await foto('proyectos-lista', 'Lista de proyectos', { alto: 700, marcas: [
      { t: 'Nuevo proyecto', n: 1, r: 'Crea un proyecto nuevo.' },
      { t: 'Registrar venta', n: 2, r: 'Atajo para registrar una venta.' },
      { t: 'La Floresta', n: 3, r: 'Toca un proyecto para ver su detalle.' },
    ] });
    await ir('/proyectos/nuevo', 1200);
    await foto('proyecto-nuevo', 'Formulario para crear un proyecto', { marcas: [
      { campo: 'Nombre del proyecto', n: 1, r: 'El nombre con el que lo reconoce el equipo.' },
      { campo: 'Tipo de proyecto', n: 2, r: 'Venta de lotes, remodelación o maquinaria.' },
      { t: 'Registrar proyecto', n: 3, r: 'Guarda el proyecto.' },
    ] });
    await ir('/proyectos');
    const href = await enlaceDe('main a', 'La Floresta');
    await ir(href, 2000);
    const hrefFloresta = href;
    await foto('proyecto-detalle', 'Detalle de un proyecto de venta de lotes', { marcas: [
      { t: 'Finanzas', n: 1, r: 'Ingresos y egresos de este proyecto.' },
      { t: 'Marcar como finalizado', n: 2, r: 'Cierra el proyecto sin borrar nada.' },
      { t: 'Nuevo lote', n: 3, r: 'Agrega un lote.' },
      { t: 'Área disponible', n: 4, r: 'Metros que todavía no se han repartido en lotes.' },
    ] });
    await foto('proyecto-lotes', 'Lotes del proyecto con sus filtros', { desplazar: 'Lotes', marcas: [
      { t: 'Todas las manzanas', n: 1, r: 'Filtra por manzana.' },
      { t: 'Todos los estados', n: 2, r: 'Filtra por estado del lote.' },
    ] });
    await ir(hrefFloresta + '/lotes/nuevo', 1200);
    await foto('lote-nuevo', 'Formulario para crear un lote', { marcas: [
      { campo: 'Número del lote', n: 1, r: 'No se puede repetir dentro de la manzana.' },
      { campo: 'Área (m²)', n: 2, r: 'Los metros cuadrados del lote.' },
      { campo: 'Precio de venta', n: 3, r: 'El valor al que se ofrece.' },
    ] });
    await ir(hrefFloresta, 1800);
    const lote = await enlaceDe('main a', 'Mz. A · Lote 1');
    await ir(lote, 1500);
    await foto('lote-detalle', 'Ficha de un lote', { alto: 800, marcas: [
      { t: 'Escriturar', n: 1, r: 'Marca el lote como escriturado cuando se firma la escritura.' },
      { t: 'Editar ficha', n: 2, r: 'Cambia el precio o los linderos.' },
      { t: 'Historial', n: 3, r: 'Cada cambio de estado o de precio queda anotado.' },
    ] });
    await ir('/proyectos');
    const maq = await enlaceDe('main a', 'Maquinaria Demo');
    await ir(maq, 1800);
    await foto('maquinaria', 'Proyecto de maquinaria con su catálogo de equipos', { alto: 760, marcas: [
      { t: 'Nuevo equipo', n: 1, r: 'Registra una máquina en el catálogo.' },
      { t: 'Excavadora 320D', n: 2, r: 'Toca un equipo para ver su utilidad.' },
    ] });
    const eq = await enlaceDe('main a', 'Excavadora 320D');
    await ir(eq, 1800);
    await foto('equipo', 'Ficha de un equipo con su utilidad', { marcas: [
      { t: 'Registrar ingreso o egreso', n: 1, r: 'Anota un alquiler, un gasto o un mantenimiento del equipo.' },
      { t: 'Utilidad', n: 2, r: 'Ingresos menos egresos de esta máquina.' },
      { t: 'Dar de baja este equipo', n: 3, r: 'El equipo no se borra: queda de baja con su historial.' },
    ] });
    await ir('/proyectos');
    const rem = await enlaceDe('main a', 'Remodelación Casa Demo');
    await ir(rem, 1500);
    await foto('remodelacion', 'Proyecto de remodelación', { alto: 520, marcas: [{ t: 'Finanzas', n: 1, r: 'En remodelaciones se lleva el seguimiento de ingresos y egresos.' }] });
  }),

  cap('clientes', async () => {
    await ir('/clientes');
    await foto('clientes-lista', 'Lista de clientes', { alto: 760, marcas: [
      { t: 'Nuevo cliente', n: 1, r: 'Registra un comprador nuevo.' },
      { sel: 'main input[type=search]', n: 2, r: 'Busca por nombre, documento o teléfono.' },
    ] });
    await foto('clientes-busqueda', 'Búsqueda de un cliente por nombre', { alto: 560, antes: async () => { await nav.escribir('main input[type=search]', 'Ana Sofía'); await pausa(1200); } });
    await ir('/clientes');
    const ana = await enlaceDe('main a', 'Ana Sofía Rojas Zapata');
    await ir(ana, 1800);
    await foto('cliente-ficha', 'Ficha de un cliente', { marcas: [
      { t: 'Estado de cuenta (PDF)', n: 1, r: 'Descarga el estado de cuenta para entregárselo al cliente.' },
      { t: 'Saldo pendiente', n: 2, r: 'Lo que el cliente todavía debe.' },
      { t: 'Editar', n: 3, r: 'Corrige los datos de contacto.' },
      { t: 'Autorización de tratamiento de datos', n: 4, r: 'Queda registrado que el cliente autorizó el uso de sus datos (Ley 1581).' },
    ] });
    await foto('cliente-ventas', 'Ventas del cliente y sus acciones rápidas', { desplazar: 'Ventas (1)', marcas: [
      { t: 'Registrar abono', n: 1, r: 'Registra un pago de este cliente.' },
      { t: 'Ver venta', n: 2, r: 'Abre el detalle de la venta.' },
      { t: 'Recordar cuota por WhatsApp', n: 3, r: 'Arma un mensaje de recordatorio listo para enviar.' },
    ] });
    await ir('/clientes/nuevo', 1200);
    await foto('cliente-nuevo', 'Formulario para registrar un cliente', { marcas: [
      { campo: 'Nombre completo', n: 1, r: 'Nombre completo del comprador.' },
      { campo: 'Número de documento', n: 2, r: 'Sin puntos ni espacios.' },
      { t: 'El cliente autorizó el tratamiento', n: 3, r: 'Marca la casilla solo si el cliente autorizó el uso de sus datos.' },
      { t: 'Guardar cliente', n: 4, r: 'Guarda el cliente.' },
    ] });
  }),

  cap('ventas', async () => {
    await ir('/ventas');
    await foto('ventas-lista', 'Lista de ventas', { marcas: [
      { t: 'Registrar venta', n: 1, r: 'Registra una venta nueva.' },
      { t: 'Todos los estados', n: 2, r: 'Filtra por estado de la venta.' },
      { t: 'Aprobar', n: 3, r: 'El gerente aprueba una venta con excepción.' },
      { t: 'Rechazar', n: 4, r: 'O la rechaza.' },
    ] });
    await ir('/ventas/nueva', 1500);
    await foto('venta-nueva', 'Formulario para registrar una venta', { alto: 760, marcas: [
      { campo: 'Lote', n: 1, r: 'Elige un lote disponible o separado.' },
    ] });
    await foto('venta-contado', 'Venta de contado con el pago completo', { alto: 1000, antes: async () => { await llenar('Lote', 'Mz. A · Lote 10'); await nav.esperarCarga(600); }, marcas: [
      { t: 'Contado', n: 1, r: 'Forma de pago: de contado.' },
      { t: 'Ya se recibió el pago completo', n: 2, r: 'Marca si el cliente pagó todo hoy: el sistema emite el recibo.' },
      { t: 'Registrar venta', n: 3, r: 'Guarda la venta.' },
    ] });
    await foto('venta-financiada', 'Venta financiada: cuota inicial y plazo', { alto: 1100, antes: async () => { await nav.clicTexto('Financiado'); await nav.esperarCarga(600); }, marcas: [
      { t: 'Financiado', n: 1, r: 'Forma de pago: financiada por la empresa.' },
    ] });
    await foto('venta-comprador-nuevo', 'Registrar la venta a un cliente que todavía no existe', { alto: 1000, antes: async () => { await nav.clicTexto('Cliente nuevo'); await nav.esperarCarga(500); }, marcas: [
      { t: 'Cliente nuevo', n: 1, r: 'Crea al comprador en el mismo formulario.' },
    ] });
    await ir('/ventas');
    const ana = await enlaceDe('main a', 'Mz. B · Lote 1');
    await ir(ana, 2000);
    await foto('venta-financiada-detalle', 'Detalle de una venta financiada', { marcas: [
      { t: 'Registrar abono', n: 1, r: 'Registra un pago de esta venta.' },
      { t: 'Total pagado', n: 2, r: 'Lo que el cliente ya pagó.' },
      { t: 'Saldo pendiente', n: 3, r: 'Lo que todavía debe.' },
      { t: 'Próxima cuota', n: 4, r: 'La siguiente cuota por pagar.' },
    ] });
    await foto('venta-cuotas', 'Plan de cuotas de la venta', { desplazar: 'Cuota inicial', alto: 900, marcas: [{ t: 'Cuota 4', n: 1, r: 'Cada cuota muestra su vencimiento, su valor y si está pagada.' }] });
    await foto('venta-documentos', 'Documentos firmados y desistimiento', { desplazar: 'Documentos firmados', alto: 800, marcas: [
      { t: 'Subir documentos', n: 1, r: 'Adjunta el contrato firmado (PDF o foto).' },
      { t: 'Registrar desistimiento', n: 2, r: 'Solo el gerente puede registrar que el cliente se retira.' },
    ] });
    await foto('venta-abonos', 'Abonos de la venta y sus acciones', { desplazar: 'Abonos registrados', alto: 800, marcas: [
      { t: 'Ver recibo', n: 1, r: 'Abre el recibo en PDF.' },
      { t: 'Avisar por WhatsApp', n: 2, r: 'Arma el mensaje para el cliente.' },
      { t: 'Enviar por correo', n: 3, r: 'Manda el recibo al correo del cliente.' },
      { t: 'Anular', n: 4, r: 'Solo el gerente anula un abono, con un motivo.' },
    ] });
  }),

  cap('abonos', async () => {
    await ir('/ventas');
    const ana = await enlaceDe('main a', 'Mz. B · Lote 1');
    await ir(ana + '/abonos/nuevo', 1500);
    await foto('abono-nuevo', 'Formulario para registrar un abono', { alto: 800, marcas: [
      { t: 'Saldo pendiente', n: 1, r: 'Lo que el cliente todavía debe antes de este pago.' },
      { campo: 'Valor recibido', n: 2, r: 'El valor que el cliente entregó, en pesos y sin puntos.' },
      { campo: 'Fecha del pago', n: 3, r: 'El día en que el cliente pagó.' },
      { campo: 'Medio de pago', n: 4, r: 'Efectivo, transferencia, consignación, Nequi o Daviplata.' },
      { t: 'Registrar abono y emitir recibo', n: 5, r: 'Guarda el abono y crea el recibo con su número.' },
    ] });
    await foto('abono-transferencia', 'Abono por transferencia: cuenta y referencia', { alto: 960, antes: async () => {
      await llenar('Valor recibido', '500000');
      await llenar('Medio de pago', 'Transferencia');
      await llenar('Cuenta donde entró el dinero', 'Bancolombia');
      await llenar('Referencia de la transacción', 'MAN-0001');
    }, marcas: [
      { campo: 'Cuenta donde entró el dinero', n: 1, r: 'La cuenta de la empresa que recibió el dinero.' },
      { campo: 'Referencia de la transacción', n: 2, r: 'El número del comprobante. No se puede repetir en la misma cuenta.' },
      { campo: 'Soporte del pago', n: 3, r: 'Adjunta la foto o el PDF del comprobante (opcional).' },
    ] });
    await ir('/recibos', 1800);
    await foto('recibos-lista', 'Búsqueda y lista de recibos', { marcas: [
      { campo: 'Buscar', n: 1, r: 'Busca por número de recibo, cliente, lote o referencia.' },
      { campo: 'Estado', n: 2, r: 'Muestra solo los vigentes o los anulados.' },
      { t: 'Ver recibo', n: 3, r: 'Abre el recibo en PDF.' },
      { t: 'Ver la venta', n: 4, r: 'Va a la venta a la que pertenece el pago.' },
    ] });
    const recibos = await llamar('/recibos');
    await fotoPdf('recibo-pdf', 'Recibo de caja en PDF', `/abonos/${recibos[1].id ?? recibos[1].abonoId}/recibo`, { ancho: 1200, alto: 1700 });
    const cli = await llamar('/clientes');
    await fotoPdf('estado-cuenta-pdf', 'Estado de cuenta de un cliente en PDF', `/clientes/${cli[0].id}/estado-cuenta`, { ancho: 1200, alto: 1700 });
  }),

  cap('por-verificar', async () => {
    await ir('/por-verificar', 1800);
    await foto('por-verificar-lista', 'Pagos por verificar contra el extracto', { marcas: [
      { t: 'Por verificar', n: 1, caja: true, tag: 'P|SPAN|DIV', r: 'Cuántos pagos faltan y por cuánto dinero.' },
      { t: 'El más antiguo lleva', n: 2, caja: true, tag: 'P|SPAN|DIV', r: 'Cuántos días lleva esperando el pago más viejo.' },
      { campo: 'Cuenta', n: 3, r: 'Filtra por la cuenta bancaria.' },
      { t: 'Elegir todos los que se ven', n: 4, r: 'Marca todos los pagos de la lista.' },
    ] });
    await foto('por-verificar-seleccion', 'Pagos seleccionados listos para confirmar', { antes: async () => {
      await nav.evaluar(`(() => { const c = [...document.querySelectorAll('main input[type=checkbox]')].filter(e => e.getBoundingClientRect().width > 0); c.slice(1, 3).forEach((x) => x.click()); return c.length; })()`);
      await pausa(800);
    }, marcas: [
      { t: 'Confirmar', n: 1, tag: 'BUTTON', r: 'Confirma que los pagos marcados aparecen en el extracto del banco.' },
    ] });
  }),

  cap('caja', async () => {
    await ir('/caja', 1800);
    await foto('caja-lista', 'Cierres de caja', { marcas: [
      { campo: 'Tipo', n: 1, r: 'Elige si el cierre es diario, semanal o quincenal.' },
      { t: 'Generar cierre', n: 2, tag: 'BUTTON', r: 'Calcula lo que entró y salió en el período.' },
      { t: 'CC-000003', n: 3, r: 'Cada cierre tiene su número. Toca uno para abrirlo.' },
      { t: 'Pendiente de aprobación', n: 4, r: 'Estado del cierre: espera la decisión del gerente.' },
    ] });
    const cierre = await enlaceDe('main a', 'CC-000003');
    await ir(cierre, 1800);
    await foto('cierre-detalle', 'Detalle de un cierre de caja', { marcas: [
      { t: 'Ver PDF', n: 1, r: 'Descarga el cierre en PDF.' },
      { t: 'Efectivo esperado', n: 2, r: 'El efectivo que debería haber en la caja.' },
      { t: 'Efectivo contado', n: 3, r: 'El efectivo que se contó de verdad.' },
      { t: 'Diferencia (contado − esperado)', n: 4, r: 'Si hay diferencia, se explica antes de cerrar.' },
      { t: 'Aprobar cierre', n: 5, tag: 'BUTTON', r: 'El gerente aprueba el cierre.' },
      { t: 'Devolver con observación', n: 6, tag: 'BUTTON', r: 'O lo devuelve para corregirlo.' },
    ] });
    await foto('cierre-medios', 'Cierre: totales por medio de pago y por cuenta', { desplazar: 'Por medio de pago', alto: 800 });
    const id = cierre.split('/').pop();
    await fotoPdf('cierre-pdf', 'Cierre de caja en PDF', `/cierres-caja/${id}/pdf`, { ancho: 1200, alto: 1700 });
  }),

  cap('cartera', async () => {
    await ir('/cartera', 2000);
    await foto('cartera-lista', 'Cartera y mora', { marcas: [
      { t: 'Cartera vencida (consolidado)', n: 1, caja: true, tag: 'P|SPAN|DIV', r: 'Total que los clientes deben y ya está vencido.' },
      { t: 'Interés de mora acumulado', n: 2, caja: true, tag: 'P|SPAN|DIV', r: 'Interés por los pagos atrasados.' },
      { t: 'Al día', n: 3, tag: 'SPAN|DIV|TD|P', r: 'El semáforo de cada cliente.' },
      { t: 'WhatsApp: recordar', n: 4, r: 'Arma un mensaje de recordatorio para el cliente.' },
    ] });
    await foto('cartera-mora', 'Clientes en mora y próximos a vencer', { desplazar: 'En mora', alto: 700, marcas: [
      { t: 'En mora', n: 1, tag: 'SPAN|DIV|TD|P', r: 'Rojo: tiene cuotas vencidas.' },
      { t: 'Próximo a vencer', n: 2, tag: 'SPAN|DIV|TD|P', r: 'Amarillo: una cuota vence en pocos días.' },
    ] });
  }),

  cap('finanzas', async () => {
    await ir('/finanzas', 2000);
    await foto('finanzas-lista', 'Finanzas: resumen de caja', { marcas: [
      { t: 'Registrar egreso o ingreso', n: 1, r: 'Anota un gasto o un ingreso que no es un abono.' },
      { campo: 'Proyecto', n: 2, r: 'Filtra por proyecto.' },
      { t: 'Caja neta', n: 3, caja: true, tag: 'P|SPAN|DIV', r: 'Lo que queda: ingresos menos egresos.' },
      { t: 'Caja por proyecto', n: 4, r: 'La caja de cada proyecto por separado.' },
    ] });
    await foto('finanzas-movimientos', 'Egresos e ingresos registrados', { desplazar: 'Egresos e ingresos registrados', alto: 800, marcas: [
      { t: 'Sin soporte', n: 1, r: 'Aviso cuando el movimiento no tiene comprobante adjunto.' },
    ] });
    await ir('/finanzas/nuevo', 1500);
    await foto('egreso-nuevo', 'Formulario para registrar un egreso', { alto: 1100, marcas: [
      { campo: 'Categoría', n: 1, r: 'El tipo de gasto (materiales, publicidad, servicios…).' },
      { campo: 'Proyecto', n: 2, r: 'A qué proyecto pertenece, o general de la empresa.' },
      { campo: 'Valor', n: 3, r: 'El valor en pesos.' },
      { campo: 'Soporte', n: 4, r: 'La factura o el recibo. Si no hay, explica por qué.' },
    ] });
    await ir('/finanzas', 1800);
    const mov = await nav.evaluar(`[...document.querySelectorAll('main a[href]')].map(a => a.getAttribute('href')).find(h => h.startsWith('/finanzas/movimientos/'))`);
    await ir(mov, 1500);
    await foto('egreso-detalle', 'Detalle de un egreso', { alto: 800, marcas: [{ t: 'Anular', n: 1, tag: 'BUTTON', r: 'Solo el gerente anula un movimiento; queda registrado y no suma.' }] });
    await ir('/proyectos');
    const flo = await enlaceDe('main a', 'La Floresta');
    await ir(flo + '/finanzas', 2000);
    await foto('proyecto-finanzas', 'Finanzas de un proyecto', { marcas: [
      { t: 'Utilidad', n: 1, caja: true, tag: 'P|SPAN|DIV', r: 'Lo que ha ganado el proyecto.' },
      { t: 'Valor vendido', n: 2, caja: true, tag: 'P|SPAN|DIV', r: 'Total de las ventas del proyecto.' },
      { t: 'Saldo por cobrar', n: 3, caja: true, tag: 'P|SPAN|DIV', r: 'Lo que los clientes todavía deben.' },
    ] });
  }),

  cap('comisiones', async () => {
    await ir('/comisiones', 2000);
    await foto('comisiones-lista', 'Comisiones de venta', { marcas: [
      { t: 'Exportar a PDF', n: 1, r: 'Descarga el reporte de comisiones.' },
      { campo: 'Vendedor', n: 2, r: 'Filtra por vendedor.' },
      { t: 'Pendiente · 6', n: 3, caja: true, tag: 'P|SPAN|DIV', r: 'Comisiones que todavía no se han pagado.' },
      { t: 'Pagar', n: 4, tag: 'BUTTON', r: 'Paga la comisión: el sistema crea el egreso en Finanzas.' },
    ] });
    await foto('comisiones-detalle', 'Comisiones pagadas y anuladas', { desplazar: 'Pagada · 2', alto: 800 });
  }),

  cap('reportes', async () => {
    await ir('/reportes', 1800);
    await foto('reportes-catalogo', 'Catálogo de reportes', { marcas: [
      { t: 'Recaudo', n: 1, caja: true, tag: 'P|SPAN|DIV|H2|H3', r: 'Cada tarjeta es un reporte.' },
      { t: 'Ver reporte', n: 2, tag: 'BUTTON', r: 'Míralo en pantalla.' },
      { t: 'Descargar PDF', n: 3, tag: 'BUTTON', r: 'Bájalo en PDF.' },
      { t: 'Descargar Excel', n: 4, tag: 'BUTTON', r: 'O en Excel.' },
    ] });
    await foto('reporte-recaudo', 'Reporte de recaudo en pantalla', { antes: async () => {
      await nav.clicTexto('Ver reporte', 'button');
      await nav.esperarCarga(2000);
    }, alto: 1000 });
    const id = await nav.evaluar('true');
  }),

  cap('notificaciones', async () => {
    const ventas = await llamar('/ventas');
    const lista = Array.isArray(ventas) ? ventas : (ventas.items ?? []);
    let n = 0;
    for (const v of lista.slice(0, 6)) {
      for (const tipo of ['RECORDATORIO', 'MORA']) {
        const r = await llamar('/notificaciones/whatsapp', { method: 'POST', body: JSON.stringify({ tipo, ventaId: v.id }) });
        if (r && r.status === undefined) n++;
      }
    }
    console.log('   avisos de WhatsApp preparados:', n);
    await ir('/notificaciones', 2000);
    await foto('notificaciones', 'Historial de avisos a clientes', { marcas: [
      { campo: 'Aviso', n: 1, r: 'Recibo, recordatorio de cuota o aviso de mora.' },
      { campo: 'Canal', n: 2, r: 'Correo o WhatsApp.' },
      { campo: 'Resultado', n: 3, r: 'Si se envió, falló, se omitió o se abrió el enlace.' },
    ] });
  }),

  cap('nomina', async () => {
    await ir('/nomina', 1800);
    await foto('nomina-lista', 'Trabajadores y nómina', { alto: 700, marcas: [
      { t: 'Nuevo trabajador', n: 1, r: 'Registra un trabajador.' },
      { t: 'Maestro de obra', n: 2, r: 'Toca un trabajador para ver sus pagos.' },
    ] });
    await ir('/trabajadores/nuevo', 1200);
    await foto('trabajador-nuevo', 'Formulario para registrar un trabajador', { alto: 800, marcas: [
      { campo: 'Cargo', n: 1, r: 'Por ejemplo, ayudante de obra.' },
      { campo: 'Salario base', n: 2, r: 'El salario mensual, en pesos.' },
      { t: 'Registrar trabajador', n: 3, tag: 'BUTTON', r: 'Guarda al trabajador.' },
    ] });
    await ir('/nomina', 1500);
    const t = await enlaceDe('main a', 'María Fernanda Valencia Salazar');
    await ir(t, 1500);
    await foto('trabajador-ficha', 'Ficha de un trabajador', { alto: 1000, marcas: [
      { t: 'Registrar pago', n: 1, tag: 'BUTTON|A', r: 'Registra un pago de nómina.' },
      { t: 'Editar', n: 2, tag: 'BUTTON|A', r: 'Corrige los datos del trabajador.' },
      { t: 'Ver en SST', n: 3, tag: 'BUTTON|A', r: 'Abre su ficha de seguridad y salud.' },
      { t: 'Retirar trabajador', n: 4, tag: 'BUTTON', r: 'Registra el retiro con su fecha y motivo; la ficha se conserva.' },
    ] });
    await ir(t + '/pagos/nuevo', 1500);
    await foto('pago-nomina-nuevo', 'Formulario para registrar un pago de nómina', { alto: 900, marcas: [
      { campo: 'Período desde', n: 1, r: 'Primer día del período que se paga.' },
      { campo: 'Período hasta', n: 2, r: 'Último día del período.' },
      { t: '+ Agregar novedad', n: 3, r: 'Suma o resta valores: horas extras, descuentos, bonos.' },
      { t: 'Registrar pago', n: 4, tag: 'BUTTON', r: 'Guarda el pago y lo anota en Finanzas.' },
    ] });
  }),

  cap('auditoria', async () => {
    await ir('/auditoria', 2000);
    await foto('auditoria-lista', 'Auditoría: quién hizo qué y cuándo', { marcas: [
      { campo: 'Usuario', n: 1, r: 'Filtra por la persona que hizo el cambio.' },
      { campo: 'Tipo de registro', n: 2, r: 'Filtra por el tipo de dato: venta, abono, lote…' },
      { campo: 'Acción', n: 3, r: 'Filtra por lo que se hizo.' },
      { t: 'Ver cambios', n: 4, r: 'Muestra los valores de antes y de después.' },
    ] });
    await foto('auditoria-cambios', 'Auditoría: valores de antes y de después', { antes: async () => { await nav.clicTexto('Ver cambios'); await pausa(700); }, desplazar: 'Ver cambios' });
  }),

  cap('importacion', async () => {
    await ir('/importacion', 1800);
    await foto('importacion', 'Importar datos desde Excel', { alto: 760, marcas: [
      { t: 'Descargar plantilla (.xlsx)', n: 1, r: 'Descarga el Excel modelo y llénalo con tus datos.' },
      { t: 'Archivo de Excel', n: 2, r: 'Escoge el archivo ya lleno (máximo 5 MB).' },
      { t: 'Revisar sin guardar', n: 3, tag: 'BUTTON', r: 'El sistema revisa todo y te muestra los errores sin guardar nada.' },
    ] });
  }),

  cap('usuarios', async () => {
    await ir('/usuarios', 1800);
    await foto('usuarios-lista', 'Usuarios del sistema', { alto: 760, marcas: [
      { t: 'Nuevo usuario', n: 1, r: 'Crea una cuenta para una persona.' },
      { t: 'Editar', n: 2, tag: 'A|BUTTON', r: 'Cambia el rol o los proyectos que puede ver.' },
      { t: 'Desactivar', n: 3, tag: 'BUTTON', r: 'Quita el acceso sin borrar el historial.' },
    ] });
    await ir('/usuarios/nuevo', 1200);
    await foto('usuario-nuevo', 'Formulario para crear un usuario', { alto: 900, marcas: [
      { campo: 'Correo', n: 1, r: 'Con este correo ingresará la persona.' },
      { campo: 'Contraseña', n: 2, r: 'Mínimo 8 caracteres. Entrégasela por un medio seguro.' },
      { campo: 'Rol', n: 3, r: 'Gerente, administrador o consulta.' },
    ] });
    await ir('/usuarios', 1500);
    const ed = await nav.evaluar(`(() => { const a = [...document.querySelectorAll('main a[href$="/editar"]')].find((x) => (x.closest('tr, li') ?? x.parentElement).innerText.includes('Socio de La Floresta')); return a ? a.getAttribute('href') : null; })()`);
    await ir(ed, 1500);
    await foto('usuario-editar', 'Editar un usuario y limitar sus proyectos', { alto: 1100, marcas: [
      { t: 'Solo algunos proyectos', n: 1, r: 'Limita lo que la persona puede ver (útil para un socio).' },
      { t: 'Restablecer contraseña', n: 2, tag: 'BUTTON', r: 'Define una contraseña nueva si la persona olvidó la suya.' },
    ] });
  }),

  cap('configuracion', async () => {
    await ir('/configuracion', 2000);
    await foto('config-empresa', 'Configuración: datos de la empresa', { marcas: [
      { t: 'Subir logo', n: 1, r: 'Sube el logo: aparece en el menú, los recibos y los reportes.' },
      { campo: 'Razón social', n: 2, r: 'El nombre legal de la empresa.' },
      { campo: 'Color principal', n: 3, r: 'Cambia el color de los botones.' },
      { t: 'Guardar datos de la empresa', n: 4, tag: 'BUTTON', r: 'Guarda los cambios.' },
    ] });
    await foto('config-parametros', 'Configuración: reglas del negocio', { desplazar: 'Parámetros del negocio', marcas: [
      { campo: 'Cuota inicial (%)', n: 1, r: 'Porcentaje que se pide al firmar.' },
      { campo: 'Plazo máximo (meses)', n: 2, r: 'Meses máximos para pagar el saldo.' },
      { campo: 'Interés de mora mensual (%)', n: 3, r: 'Interés por pagos atrasados.' },
    ] });
    await foto('config-avisos', 'Configuración: avisos a clientes y verificación de pagos', { desplazar: 'Avisos a clientes' });
    await foto('config-seguridad', 'Configuración: seguridad de la sesión', { desplazar: 'Seguridad de la sesión' });
    await foto('config-correo', 'Configuración: correo de avisos', { desplazar: 'Correo de avisos', marcas: [
      { t: 'Enviar correo de prueba', n: 1, tag: 'BUTTON', r: 'Comprueba que el correo de la empresa funciona.' },
    ] });
    await foto('config-cuentas', 'Configuración: cuentas de recaudo y medios de pago', { desplazar: 'Cuentas de recaudo', marcas: [
      { t: 'Agregar cuenta', n: 1, tag: 'BUTTON', r: 'Agrega una cuenta bancaria o billetera.' },
      { t: 'Desactivar', n: 2, tag: 'BUTTON', r: 'Las cuentas no se borran: se desactivan.' },
    ] });
  }),

  cap('config-extra', async () => {
    await ir('/configuracion', 2000);
    await foto('config-categorias', 'Configuración: categorías de gasto y de ingreso', { desplazar: 'Categorías de gasto', alto: 1000, marcas: [
      { sel: 'input[aria-label="Nueva categoría"]', n: 1, r: 'Escribe el nombre de una categoría nueva y agrégala.' },
    ] });
    await foto('config-comisiones', 'Configuración: tipos de equipo y valor de las comisiones', { desplazar: 'Tipos de equipo', alto: 1000 });
    await foto('config-exportar', 'Configuración: exportar todos los datos a Excel', { desplazar: 'Exportar todos mis datos a Excel', alto: 600, marcas: [
      { t: 'Exportar todos los datos', n: 1, tag: 'BUTTON', r: 'Descarga un libro de Excel con todos los datos de la empresa.' },
    ] });
  }),

  cap('roles', async () => {
    const tAdmin = await token('Administrador:');
    await conSesion(tAdmin);
    await ir('/dashboard', 2000);
    await foto('rol-administrador', 'Menú del rol Administrador', { conMenu: true, alto: 900 });
    const tSocio = await token('Socio');
    await conSesion(tSocio);
    await ir('/dashboard', 2000);
    await foto('rol-consulta', 'Menú del rol Consulta limitado a un proyecto', { conMenu: true, alto: 900 });
  }),

  cap('detalles', async () => {
    await ir('/ventas');
    const ana = await enlaceDe('main a', 'Mz. B · Lote 1');
    await foto('desistimiento', 'Formulario de desistimiento de una venta', { alto: 900, antes: async () => { await ir(ana, 1800); await nav.clicTexto('Registrar desistimiento', 'button'); }, desplazar: 'El cliente desiste de la compra', marcas: [
      { campo: 'A devolver', n: 1, r: 'Lo que la empresa le devuelve al cliente.' },
      { campo: 'A retener', n: 2, r: 'Lo que la empresa se queda.' },
      { campo: 'Motivo', n: 3, r: 'Escribe por qué se retira el cliente.' },
      { t: 'Confirmar desistimiento', n: 4, tag: 'BUTTON', r: 'Registra el desistimiento. El lote vuelve a quedar disponible.' },
    ] });
    await foto('comision-pagar', 'Pago de una comisión desde la venta', { alto: 900, antes: async () => { await ir(ana, 1800); await clicDespuesDe('Comisión de la venta', 'Pagar'); }, desplazar: 'Comisión de la venta', marcas: [
      { campo: 'Fecha del pago', n: 1, r: 'El día en que se pagó la comisión.' },
      { campo: 'Medio de pago', n: 2, r: 'Cómo se pagó.' },
      { t: 'Registrar el pago', n: 3, tag: 'BUTTON', r: 'Paga la comisión y crea el egreso en Finanzas.' },
    ] });
    await ir('/proyectos');
    const flo = await enlaceDe('main a', 'La Floresta');
    await ir(flo, 1800);
    const lote = await enlaceDe('main a', 'Mz. A · Lote 10');
    await foto('lote-disponible', 'Ficha de un lote disponible y sus acciones', { alto: 760, antes: async () => { await ir(lote, 1500); }, marcas: [
      { t: 'Vender', n: 1, tag: 'A|BUTTON', r: 'Abre el formulario de venta con este lote.' },
      { t: 'Separar', n: 2, tag: 'BUTTON', r: 'Aparta el lote para un cliente, con valor y fecha límite.' },
      { t: 'Editar ficha', n: 3, tag: 'BUTTON', r: 'Cambia el área, el precio o los linderos.' },
    ] });
    await foto('lote-editar', 'Edición de la ficha de un lote', { alto: 960, antes: async () => { await ir(lote, 1500); await nav.clicTexto('Editar ficha', 'button'); }, desplazar: 'Editar ficha', marcas: [
      { campo: 'Precio de venta', n: 1, r: 'Si cambias el precio, queda anotado en el historial.' },
      { campo: 'Motivo del cambio de precio', n: 2, r: 'Opcional: explica por qué cambió.' },
      { t: 'Guardar cambios', n: 3, tag: 'BUTTON', r: 'Guarda la ficha.' },
    ] });
    await foto('lote-separar', 'Separación de un lote', { alto: 900, antes: async () => { await ir(lote, 1500); await nav.clicTexto('Separar', 'button'); }, desplazar: 'Acciones' });
    await ir('/clientes');
    const cli = await enlaceDe('main a', 'Ana Sofía');
    await foto('cliente-editar', 'Edición de los datos de contacto de un cliente', { alto: 900, antes: async () => { await ir(cli, 1500); await nav.clicTexto('Editar', 'button'); }, desplazar: 'Datos de contacto', marcas: [
      { campo: 'Teléfono', n: 1, r: 'El teléfono que se usa para los avisos por WhatsApp.' },
      { campo: 'Correo electrónico', n: 2, r: 'El correo al que se envía el recibo.' },
      { t: 'Guardar cambios', n: 3, tag: 'BUTTON', r: 'Guarda los cambios.' },
    ] });
    await foto('movil-abono', 'Registrar un abono desde el celular', { ancho: 360, alto: 780, movil: true, antes: async () => { await nav.tamano(360, 780, true); await ir(ana + '/abonos/nuevo', 1500); }, marcas: [
      { campo: 'Valor recibido', n: 1, r: 'Escribe el valor recibido.' },
      { t: 'Registrar abono y emitir recibo', n: 2, tag: 'BUTTON', r: 'Guarda el abono y crea el recibo.' },
    ] });
    await foto('movil-cliente', 'Ficha de un cliente en el celular', { ancho: 360, alto: 780, movil: true, antes: async () => { await nav.tamano(360, 780, true); await ir(cli, 1500); }, marcas: [
      { t: 'Estado de cuenta (PDF)', n: 1, r: 'Descarga el estado de cuenta.' },
    ] });
    await ir('/proyectos');
    const maq = await enlaceDe('main a', 'Maquinaria Demo');
    await foto('equipo-nuevo', 'Formulario para registrar un equipo', { alto: 900, antes: async () => { await ir(maq + '/equipos/nuevo', 1500); }, marcas: [
      { campo: 'Nombre del equipo', n: 1, r: 'Por ejemplo, Excavadora 320D.' },
      { campo: 'Estado', n: 2, r: 'Activo, en mantenimiento o fuera de servicio.' },
      { campo: 'Placa o serie', n: 3, r: 'No se puede repetir entre equipos.' },
    ] });
    await ir(maq, 1500);
    const eq = await enlaceDe('main a', 'Excavadora');
    await foto('equipo-movimiento', 'Ingreso o egreso de un equipo', { alto: 1100, antes: async () => { await ir(eq, 1500); await nav.clicTexto('Registrar ingreso o egreso'); }, marcas: [
      { campo: 'Equipo', n: 1, r: 'El equipo al que pertenece el movimiento, o "general de la flota".' },
      { campo: 'Categoría', n: 2, r: 'Combustible, repuestos, operario, alquiler…' },
    ] });
  }),

  // Módulo de seguridad y salud en el trabajo (CC-03, fases A y B). Los datos salen de prisma/demo/datos-sst.ts.
  cap('sst', async () => {
    const trabajadores = await llamar('/trabajadores');
    const maestro = trabajadores.find((x) => x.cargo === 'Maestro de obra');
    const incompleto = trabajadores.find((x) => x.documento === '1000000503') ?? trabajadores[3];
    const fichaMaestro = '/sst/trabajadores/' + maestro.id;
    const fichaIncompleto = '/sst/trabajadores/' + incompleto.id;

    await ir('/sst', 2200);
    await foto('sst-trabajadores', 'Seguridad y salud: trabajadores y sus alertas', { alto: 1000, marcas: [
      { t: 'Trabajadores', n: 1, sel: 'nav[aria-label] a[href="/sst"]', r: 'Las pestañas del módulo: trabajadores, EPP, plan de trabajo, capacitaciones y avisos.' },
      { t: 'Con alguna alerta', n: 2, caja: true, tag: 'P|SPAN|DIV', r: 'Cuántos trabajadores tienen algo por completar.' },
      { sel: 'input[placeholder="Buscar por nombre o documento"]', n: 3, r: 'Busca a un trabajador por su nombre o su documento.' },
      { t: 'Parámetros y entidades', n: 4, r: 'Solo el gerente: valores legales del año y entidades de seguridad social.' },
    ] });
    await foto('sst-ficha', 'Ficha de seguridad social de un trabajador', { alto: 1200, antes: async () => { await ir(fichaMaestro, 2000); }, marcas: [
      { t: 'Ver ficha de nómina', n: 1, r: 'Pasa a la ficha de nómina del mismo trabajador (solo para quien tiene permiso).' },
      { t: 'Datos del trabajador', n: 2, tag: 'H2|H3', r: 'Documento, cargo, tipo de contrato y datos de contacto.' },
      { t: 'Valores legales de 2026', n: 3, tag: 'H2|H3', r: 'Se calculan con los parámetros legales del año; el aviso amarillo indica que aún no están validados.' },
      { t: 'Afiliaciones a la seguridad social', n: 4, tag: 'H2|H3', r: 'La entidad vigente de cada tipo: EPS, pensión, cesantías, ARL y caja.' },
    ] });
    await foto('sst-afiliacion-pendiente', 'Afiliaciones por completar', { alto: 1000, antes: async () => { await ir(fichaIncompleto, 2000); }, desplazar: 'Afiliaciones a la seguridad social', marcas: [
      { t: 'Sin afiliación vigente', n: 1, r: 'Falta registrar esta afiliación.' },
      { t: 'Registrar', n: 2, tag: 'BUTTON', r: 'Registra la entidad a la que está afiliado.' },
      { t: 'Cambiar', n: 3, tag: 'BUTTON', r: 'Cambia de entidad; la anterior se cierra sola y queda en el historial.' },
      { t: 'Cerrar', n: 4, tag: 'BUTTON', r: 'Cierra la afiliación cuando el trabajador deja la entidad.' },
    ] });
    await foto('sst-afiliacion-form', 'Formulario para registrar una afiliación', { alto: 900, antes: async () => { await ir(fichaIncompleto, 2000); await clicDespuesDe('Fondo de pensión', 'Registrar'); await pausa(600); }, desplazar: 'Afiliaciones a la seguridad social', marcas: [
      { campo: 'Fondo de pensión', n: 1, r: 'Elige la entidad de la lista.' },
      { campo: 'Afiliado desde', n: 2, r: 'La fecha en que empezó la afiliación.' },
      { t: 'Guardar afiliación', n: 3, tag: 'BUTTON', r: 'Guarda la afiliación; queda en el historial del trabajador.' },
    ] });
    await foto('sst-autorizacion', 'Autorización de datos de salud y documentos', { alto: 1000, antes: async () => { await ir(fichaMaestro, 2000); }, desplazar: 'Autorización de datos de salud', marcas: [
      { t: 'Autorización de datos de salud', n: 1, r: 'Se registra que el trabajador autorizó por escrito el uso de sus datos de salud.' },
      { t: 'Documentos', n: 2, tag: 'H2|H3', r: 'Certificados de afiliación y otros soportes: PDF, PNG o JPG de hasta 10 MB.' },
    ] });

    await ir('/sst/epp', 2200);
    await foto('sst-epp', 'Elementos de protección personal: reposiciones', { alto: 1000, marcas: [
      { t: 'Lo que pide atención', n: 1, r: 'Los elementos por reponer o vencidos, con su fecha de reposición.' },
      { t: 'Registrar entrega de EPP', n: 2, tag: 'BUTTON', r: 'Registra la entrega de un elemento a un trabajador.' },
    ] });
    await foto('sst-epp-entrega', 'Formulario para registrar una entrega de EPP', { alto: 1000, antes: async () => { await ir('/sst/epp', 1800); await nav.clicTexto('Registrar entrega de EPP', 'button'); await pausa(600); }, marcas: [
      { campo: 'Trabajador', n: 1, r: 'Quién recibe el elemento.' },
      { campo: 'Elemento', n: 2, r: 'Del catálogo; debajo aparece su vida útil.' },
      { campo: 'Motivo', n: 3, r: 'Dotación inicial, reposición, daño, pérdida o cambio de cargo.' },
      { campo: 'Acta firmada', n: 4, r: 'Adjunta el acta firmada, si la hay.' },
    ] });
    await foto('sst-epp-entregas', 'Entregas de EPP registradas', { alto: 1000, antes: async () => { await ir('/sst/epp', 2000); }, desplazar: 'Entregas', marcas: [
      { t: 'Entregas', n: 1, tag: 'H2|H3', r: 'Cada entrega con su acta. No se editan ni se borran: se anulan con motivo.' },
      { t: 'Incluir anuladas', n: 2, tag: 'LABEL', r: 'Muestra también las entregas anuladas.' },
      { t: 'Ver', n: 3, tag: 'BUTTON|A', r: 'Abre la entrega: su acta, la firma y la anulación.' },
    ] });
    await foto('sst-epp-catalogo', 'Catálogo de elementos de protección', { alto: 1000, antes: async () => { await ir('/sst/epp', 2000); await nav.clicTexto('Catálogo de elementos'); await pausa(500); }, desplazar: 'Catálogo de elementos', marcas: [
      { t: 'Catálogo de elementos', n: 1, tag: 'SUMMARY', r: 'La lista de elementos que se pueden entregar, con su vida útil en días y un botón para desactivarlos.' },
    ] });

    await ir('/sst/plan', 2200);
    await foto('sst-plan', 'Plan de trabajo anual con su cronograma', { alto: 1100, ancho: 1500, marcas: [
      { t: 'Cumplimiento', n: 1, caja: true, tag: 'P|SPAN|DIV', r: 'Qué porcentaje de las actividades ya se ejecutó.' },
      { t: 'Nueva actividad', n: 2, tag: 'BUTTON', r: 'Agrega una actividad al plan del año.' },
      { t: 'Copiar de otro', n: 3, tag: 'BUTTON', r: 'Copia el plan de un año como borrador del siguiente.' },
    ] });
    await foto('sst-plan-actividad', 'Formulario de una actividad del plan', { alto: 1100, antes: async () => { await ir('/sst/plan', 1800); await nav.clicTexto('Nueva actividad', 'button'); await pausa(600); }, marcas: [
      { campo: 'Ciclo PHVA', n: 1, r: 'Planear, hacer, verificar o actuar.' },
      { campo: 'Correo del responsable', n: 2, r: 'A este correo llegan los recordatorios.' },
      { campo: 'Fecha de fin', n: 3, r: 'Debe caer dentro del año del plan.' },
    ] });

    await ir('/sst/capacitaciones', 2200);
    await foto('sst-capacitaciones', 'Plan de capacitación del año', { alto: 1000, marcas: [
      { t: 'Cobertura de las ejecutadas', n: 1, caja: true, tag: 'P|SPAN|DIV', r: 'Asistentes reales sobre asistentes programados.' },
      { t: 'Nueva capacitación', n: 2, tag: 'BUTTON', r: 'Programa una capacitación.' },
    ] });
    const cdet = await enlaceDe('main a', 'Trabajo seguro en alturas');
    await foto('sst-capacitacion', 'Asistencia a una capacitación', { alto: 1200, antes: async () => { await ir(cdet, 2000); }, marcas: [
      { t: 'Agregar asistentes', n: 1, tag: 'BUTTON', r: 'Marca a varios trabajadores y regístralos juntos.' },
      { t: 'Cobertura', n: 2, caja: true, tag: 'P|SPAN|DIV', r: 'Asistentes reales sobre asistentes programados.' },
      { t: 'Quitar', n: 3, tag: 'BUTTON|A', r: 'Anula una asistencia con motivo; no se borra.' },
    ] });
    await foto('sst-asistentes', 'Agregar varios asistentes de una vez', { alto: 1100, antes: async () => { await ir(cdet, 1800); await nav.clicTexto('Agregar asistentes', 'button'); await pausa(600); }, desplazar: 'Asistencia', marcas: [
      { sel: 'input[placeholder="Buscar por nombre o documento"]', n: 1, r: 'Busca al trabajador.' },
    ] });

    await ir('/sst/avisos', 2200);
    // La demostración no tiene correo configurado: los avisos quedan "omitidos" y no sale nada a nadie.
    await nav.clicTexto('Enviar avisos ahora', 'button');
    await nav.esperarCarga(2500);
    await foto('sst-avisos', 'Avisos por correo y su historial', { alto: 900, marcas: [
      { t: 'Enviar avisos ahora', n: 1, tag: 'BUTTON', r: 'Envía ya los avisos que el sistema enviaría solo cada mañana.' },
      { t: 'Historial', n: 2, tag: 'H2|H3', r: 'Cada intento con su resultado. No se puede editar.' },
    ] });

    await ir('/configuracion/seguridad-social', 2500);
    await foto('sst-parametros', 'Parámetros legales por año', { alto: 1100, marcas: [
      { t: 'Agregar año', n: 1, tag: 'BUTTON', r: 'Cada año tiene sus propios valores legales.' },
      { t: 'Pendiente de validar', n: 2, r: 'Los valores aún no los confirma el asesor laboral.' },
      { t: 'Marcar como validado', n: 3, tag: 'BUTTON', r: 'Se pulsa cuando el asesor laboral confirmó los valores.' },
      { t: 'Editar', n: 4, tag: 'BUTTON', r: 'Cambia los valores del año; al cambiar uno, se pierde la validación.' },
    ] });
    await foto('sst-entidades', 'Entidades de seguridad social y clases de riesgo', { alto: 1100, antes: async () => { await nav.clicTexto('EPS (salud)'); await pausa(500); }, desplazar: 'Entidades', marcas: [
      { t: 'EPS (salud)', n: 1, tag: 'SUMMARY', r: 'Cada tipo de entidad se abre para ver sus entidades.' },
      { sel: 'input[placeholder="Nombre de la entidad"]', n: 2, r: 'Escribe el nombre y pulsa Agregar para sumar una EPS, un fondo, una ARL o una caja.' },
      { t: 'Desactivar', n: 3, tag: 'BUTTON', r: 'Una entidad no se borra: se desactiva y deja de ofrecerse.' },
    ] });
    await ir('/configuracion', 2000);
    await foto('config-sst', 'Configuración: seguridad y salud en el trabajo', { alto: 700, desplazar: 'Seguridad y salud en el trabajo', marcas: [
      { campo: 'Días de anticipación de las alertas', n: 1, r: 'Con cuántos días de aviso se marca como próxima una reposición, actividad o capacitación.' },
      { campo: 'Correo de avisos SST', n: 2, r: 'A dónde llega el resumen de EPP por reponer. Vacío: solo se ve en el panel.' },
    ] });

    // Rol de solo seguridad y salud: lo ve el contratista externo.
    const tCont = await token('Contratista');
    await conSesion(tCont);
    await ir('/sst', 2200);
    await foto('rol-contratista', 'Menú del rol Contratista SST', { conMenu: true, alto: 900 });
    await conSesion(tokenGerente);
  }),

  cap('operaciones', async () => {
    nav.aceptarDialogos = true;
    // 1) Registrar un abono real por transferencia y mostrar el resultado (solo la primera vez).
    if (!manifiesto['abono-registrado']) {
      await ir('/ventas');
      const ana = await enlaceDe('main a', 'Mz. B · Lote 1');
      await ir(ana + '/abonos/nuevo', 1500);
      await llenar('Valor recibido', '500000');
      await llenar('Medio de pago', 'Transferencia');
      await llenar('Cuenta donde entró el dinero', 'Bancolombia');
      await llenar('Referencia de la transacción', 'MAN-0001');
      await nav.clicTexto('Registrar abono y emitir recibo', 'button');
      await nav.esperarCarga(2500);
      await foto('abono-registrado', 'Abono registrado con su recibo', { alto: 900, marcas: [
        { t: 'Ver recibo', n: 1, r: 'Abre el recibo en PDF.' },
        { t: 'Avisar por WhatsApp', n: 2, r: 'Arma el mensaje para el cliente.' },
        { t: 'Enviar recibo por correo', n: 3, r: 'Manda el recibo al correo del cliente.' },
      ] });
    }
    // 2) Un abono en efectivo de hoy, para que el cierre de caja tenga números reales.
    await ir('/ventas');
    const ana2 = await enlaceDe('main a', 'Mz. B · Lote 1');
    await ir(ana2 + '/abonos/nuevo', 1500);
    await llenar('Valor recibido', '4000000');
    await nav.clicTexto('Registrar abono y emitir recibo', 'button');
    await nav.esperarCarga(2500);
    // 3) Cierre de caja: aprobar el pendiente, generar el del día, contarlo y cerrarlo.
    await ir('/caja', 1800);
    const pendiente = await enlaceDe('main a', 'CC-000003');
    await ir(pendiente, 1500);
    if ((await nav.texto()).includes('Aprobar cierre')) { await nav.clicTexto('Aprobar cierre', 'button'); await nav.esperarCarga(1200); }
    await ir('/caja', 1800);
    await nav.elegir('#tipo', 'Diario');
    await nav.clicTexto('Generar cierre', 'button');
    await nav.esperarCarga(2200);
    await foto('cierre-borrador', 'Cierre en borrador: conteo del efectivo', { alto: 1000, marcas: [
      { campo: 'Efectivo contado en la caja', n: 1, r: 'Cuenta el efectivo que hay en la caja y escribe el total.' },
      { t: 'Cerrar caja', n: 2, tag: 'BUTTON', r: 'Cierra el período y lo envía a aprobación.' },
      { t: 'Descartar borrador', n: 3, tag: 'BUTTON', r: 'Si te equivocaste, descarta el borrador: no se pierde ningún dato.' },
    ] });
    const textoCierre = await nav.texto();
    const mm = textoCierre.match(/Efectivo esperado\s+(−|-)?\$([\d.]+)/);
    const esperado = (mm ? (mm[1] ? -1 : 1) * Number(mm[2].replace(/\./g, '')) : 0);
    console.log('   efectivo esperado:', esperado);
    await nav.escribir('#contado', String(Math.max(0, esperado + 5000)));
    await pausa(600);
    await foto('cierre-diferencia', 'Cierre con diferencia entre lo contado y lo esperado', { alto: 1000, marcas: [
      { campo: 'Explica la diferencia', n: 1, r: 'Si el efectivo no cuadra, explica por qué antes de cerrar.' },
    ] });
    await nav.escribir('#explicacion', 'Sobrante de cinco mil pesos por vueltos mal dados (demostración)');
    await nav.clicTexto('Cerrar caja', 'button');
    await nav.esperarCarga(2000);
    await foto('cierre-cerrado', 'Cierre cerrado, pendiente de aprobación', { alto: 1000 });
  }),
];

// ---------------------------------------------------------------- ejecución
try {
  for (const c of capitulos) await c();
} finally {
  writeFileSync(manifiestoRuta, JSON.stringify(manifiesto, null, 2));
  await nav.cerrar();
  console.log('\nListo:', Object.keys(manifiesto).length, 'figuras en el manifiesto');
}
