// Navegador sin ventana (Edge o Chrome) controlado por el protocolo de depuración (CDP), sin instalar nada.
// Lo usa capturar-manual.mjs para tomar las capturas del manual de usuario con la base de DEMOSTRACIÓN.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const RUTAS_NAVEGADOR = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

export class Navegador {
  static async abrir({ puerto = 9333 } = {}) {
    const exe = RUTAS_NAVEGADOR.find((r) => existsSync(r));
    if (!exe) throw new Error('No encontré Edge ni Chrome');
    // Si quedó un navegador anterior escuchando en el puerto, la sesión vieja se colaría en las capturas.
    try { await fetch(`http://127.0.0.1:${puerto}/json/version`); throw new Error(`Ya hay un navegador en el puerto ${puerto}: ciérralo antes de capturar`); } catch (e) { if (String(e.message).startsWith('Ya hay')) throw e; }
    const perfil = mkdtempSync(join(tmpdir(), 'manual-perfil-'));
    const proceso = spawn(exe, [
      '--headless=new', `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`,
      '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars',
      '--force-device-scale-factor=1', '--lang=es-CO', 'about:blank',
    ], { stdio: 'ignore' });
    let objetivo;
    for (let i = 0; i < 60 && !objetivo; i++) {
      await pausa(500);
      try {
        const lista = await (await fetch(`http://127.0.0.1:${puerto}/json/list`)).json();
        objetivo = lista.find((t) => t.type === 'page');
      } catch { /* aún arrancando */ }
    }
    if (!objetivo) { proceso.kill(); throw new Error('El navegador no arrancó'); }
    const nav = new Navegador(proceso, perfil, objetivo.webSocketDebuggerUrl);
    await nav.conectar();
    return nav;
  }

  constructor(proceso, perfil, url) {
    this.proceso = proceso; this.perfil = perfil; this.url = url; this.id = 0; this.pendientes = new Map();
    // Avisos emergentes (confirm/prompt/alert): se registran y se contestan solos para que la página no se quede esperando.
    this.dialogos = []; this.aceptarDialogos = false; this.respuestaDialogo = '';
  }

  conectar() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = async () => {
        await this.enviar('Page.enable'); await this.enviar('Runtime.enable');
        resolve();
      };
      this.ws.onerror = (e) => reject(new Error('WebSocket: ' + (e.message ?? 'error')));
      this.ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.method === 'Page.javascriptDialogOpening') {
          this.dialogos.push({ tipo: m.params.type, mensaje: m.params.message });
          this.enviar('Page.handleJavaScriptDialog', { accept: this.aceptarDialogos, promptText: this.respuestaDialogo }).catch(() => {});
          return;
        }
        if (m.id && this.pendientes.has(m.id)) {
          const { ok, fallo } = this.pendientes.get(m.id); this.pendientes.delete(m.id);
          m.error ? fallo(new Error(m.error.message)) : ok(m.result);
        }
      };
    });
  }

  enviar(metodo, params = {}) {
    return new Promise((ok, fallo) => {
      const id = ++this.id; this.pendientes.set(id, { ok, fallo });
      this.ws.send(JSON.stringify({ id, method: metodo, params }));
    });
  }

  async tamano(ancho, alto, movil = false, dpr = 2) {
    await this.enviar('Emulation.setDeviceMetricsOverride', { width: ancho, height: alto, deviceScaleFactor: dpr, mobile: movil });
    if (movil) await this.enviar('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36' });
  }

  async evaluar(expresion) {
    const r = await this.enviar('Runtime.evaluate', { expression: expresion, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'error al evaluar');
    return r.result.value;
  }

  async ir(url, espera = 1400) {
    await this.enviar('Page.navigate', { url });
    await pausa(600);
    for (let i = 0; i < 40; i++) {
      if ((await this.evaluar('document.readyState')) === 'complete') break;
      await pausa(250);
    }
    await this.esperarCarga(espera);
  }

  // Espera a que desaparezcan los textos de "Cargando" y a que la pantalla se estabilice.
  async esperarCarga(extra = 800) {
    for (let i = 0; i < 40; i++) {
      const cargando = await this.evaluar(`/Cargando|Calculando|Generando/i.test(document.body?.innerText ?? '')`);
      if (!cargando) break;
      await pausa(250);
    }
    await pausa(extra);
  }

  async sesion(origen, token) {
    await this.ir(origen + '/login', 600);
    await this.evaluar(`localStorage.setItem('sistemaUrbanismo.token', ${JSON.stringify(token)}); true`);
  }

  async cerrarSesion(origen) {
    await this.ir(origen + '/login', 300);
    await this.evaluar(`localStorage.clear(); sessionStorage.clear(); true`);
  }

  // Hace clic en el primer elemento visible cuyo texto (o aria-label) contenga el texto dado.
  async clicTexto(texto, selector = 'button, a, [role=button], label, summary, [role=tab]') {
    const ok = await this.evaluar(`(() => {
      const t = ${JSON.stringify(texto.toLowerCase())};
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((e) => {
        const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0;
      });
      const el = els.find((e) => ((e.innerText || e.getAttribute('aria-label') || '').trim().toLowerCase()).includes(t));
      if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true;
    })()`);
    if (!ok) throw new Error('No encontré para hacer clic: ' + texto);
    await pausa(700);
  }

  async clic(selector) {
    const ok = await this.evaluar(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return false; e.scrollIntoView({ block: 'center' }); e.click(); return true; })()`);
    if (!ok) throw new Error('No encontré: ' + selector);
    await pausa(500);
  }

  // Escribe en un campo como lo haría una persona (compatible con los campos de React).
  async escribir(selector, texto) {
    const ok = await this.evaluar(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return false; e.scrollIntoView({ block: 'center' }); e.focus(); if (e.select) e.select(); return true; })()`);
    if (!ok) throw new Error('No encontré el campo: ' + selector);
    await this.enviar('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2 }).catch(() => {});
    await this.enviar('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2 }).catch(() => {});
    await this.enviar('Input.insertText', { text: texto });
    await pausa(250);
  }

  // Elige una opción de un <select> por su texto visible.
  async elegir(selector, textoOpcion) {
    const ok = await this.evaluar(`(() => {
      const s = document.querySelector(${JSON.stringify(selector)}); if (!s) return false;
      const o = [...s.options].find((x) => x.text.toLowerCase().includes(${JSON.stringify(textoOpcion.toLowerCase())})); if (!o) return false;
      const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      set.call(s, o.value); s.dispatchEvent(new Event('change', { bubbles: true })); return true;
    })()`);
    if (!ok) throw new Error(`No pude elegir "${textoOpcion}" en ${selector}`);
    await pausa(500);
  }

  async desplazar(y) {
    await this.evaluar(`(() => { const m = document.querySelector('main') ?? document.scrollingElement; (m.scrollTo ? m : window).scrollTo(0, ${y}); return true; })()`);
    await pausa(300);
  }

  async texto() { return this.evaluar('document.body.innerText'); }

  async capturar(archivo, clip) {
    mkdirSync(dirname(archivo), { recursive: true });
    // El recorte se expresa respecto de la página, no de lo que se ve: hay que sumar cuánto se desplazó.
    let corte;
    if (clip) {
      const { cssVisualViewport: v } = await this.enviar('Page.getLayoutMetrics');
      corte = { x: clip.x + v.pageX, y: clip.y + v.pageY, width: clip.width, height: clip.height, scale: 1 };
    }
    const r = await this.enviar('Page.captureScreenshot', { format: 'png', ...(corte ? { clip: corte } : {}) });
    writeFileSync(archivo, Buffer.from(r.data, 'base64'));
  }

  async cerrar() {
    try { this.ws.close(); } catch { /* ya cerrado */ }
    // En Windows kill() solo cierra el lanzador: hay que cerrar también los procesos hijos.
    // Se cierran todos los procesos de ESTE navegador (los que usan su perfil temporal) y ninguno más.
    try {
      spawnSync('powershell', ['-NoProfile', '-Command',
        `Get-CimInstance Win32_Process -Filter "Name='msedge.exe' or Name='chrome.exe'" | Where-Object { $_.CommandLine.Contains('${this.perfil.replace(/'/g, "''")}') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`], { stdio: 'ignore' });
    } catch { /* ya cerrado */ }
    await pausa(1500);
    try { rmSync(this.perfil, { recursive: true, force: true }); } catch { /* el navegador aún lo usa */ }
  }
}
