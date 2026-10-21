// Servidor SMTP de PRUEBA, solo local: recibe los correos que manda el sistema y los guarda en backend/.demo/correos-recibidos/
// (carpeta ignorada por Git). No reenvía nada a ningún lado y escucha solo en 127.0.0.1.
// Uso: npm run correo:sumidero   (puerto 2525; otro puerto: npm run correo:sumidero -- 2626)
// Para que la API de demostración le mande los correos: DEMO_SMTP_LOCAL=127.0.0.1:2525 npm run demo:api
import net from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PUERTO = Number(process.argv[2] ?? 2525);
const CARPETA = join(import.meta.dirname, '..', '.demo', 'correos-recibidos');
mkdirSync(CARPETA, { recursive: true });
let consecutivo = 0;

function decodificarPalabras(texto) {
  return texto.replace(/=\?UTF-8\?([BQ])\?([^?]*)\?=/gi, (_m, tipo, cuerpo) =>
    tipo.toUpperCase() === 'B'
      ? Buffer.from(cuerpo, 'base64').toString('utf8')
      : Buffer.from(cuerpo.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (_x, h) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8'),
  );
}

function resumir(crudo, destinatarios) {
  const [cabeceras] = crudo.split('\r\n\r\n');
  const desplegadas = cabeceras.replace(/\r\n[ \t]+/g, ' ');
  const cab = (nombre) => decodificarPalabras(new RegExp(`^${nombre}:\\s*(.*)$`, 'im').exec(desplegadas)?.[1] ?? '');
  const adjuntos = [...crudo.matchAll(/filename="?([^"\r\n;]+)"?/gi)].map((m) => m[1]);
  return { de: cab('From'), para: cab('To'), responderA: cab('Reply-To'), asunto: cab('Subject'), adjuntos, destinatarios };
}

net
  .createServer((socket) => {
    let modo = 'cmd';
    let buffer = '';
    let remitente = '';
    let destinatarios = [];
    let authPaso = null;
    socket.write('220 sumidero ESMTP\r\n');

    const responder = (linea) => {
      if (authPaso === 'usuario') { authPaso = 'clave'; return socket.write('334 UGFzc3dvcmQ6\r\n'); }
      if (authPaso === 'clave') { authPaso = null; return socket.write('235 2.7.0 ok\r\n'); }
      const orden = linea.slice(0, 4).toUpperCase();
      if (orden === 'EHLO') return socket.write('250-sumidero\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n');
      if (orden === 'HELO') return socket.write('250 sumidero\r\n');
      if (linea.toUpperCase().startsWith('AUTH PLAIN')) return socket.write('235 2.7.0 ok\r\n');
      if (linea.toUpperCase().startsWith('AUTH LOGIN')) { authPaso = 'usuario'; return socket.write('334 VXNlcm5hbWU6\r\n'); }
      if (orden === 'MAIL') { remitente = linea; destinatarios = []; return socket.write('250 ok\r\n'); }
      if (orden === 'RCPT') { destinatarios.push(/<([^>]*)>/.exec(linea)?.[1] ?? linea); return socket.write('250 ok\r\n'); }
      if (orden === 'DATA') { modo = 'data'; return socket.write('354 adelante\r\n'); }
      if (orden === 'RSET' || orden === 'NOOP') return socket.write('250 ok\r\n');
      if (orden === 'QUIT') { socket.write('221 adiós\r\n'); return socket.end(); }
      return socket.write('250 ok\r\n');
    };

    const procesar = () => {
      for (;;) {
        if (modo === 'data') {
          const fin = buffer.indexOf('\r\n.\r\n');
          if (fin < 0) return;
          const crudo = buffer.slice(0, fin).replace(/\r\n\.\./g, '\r\n.');
          buffer = buffer.slice(fin + 5);
          modo = 'cmd';
          consecutivo += 1;
          const archivo = join(CARPETA, `${String(consecutivo).padStart(3, '0')}.eml`);
          writeFileSync(archivo, crudo, 'latin1');
          const resumen = resumir(crudo, destinatarios);
          console.log(`[correo ${consecutivo}] ${JSON.stringify(resumen)}`);
          socket.write('250 2.0.0 recibido\r\n');
          continue;
        }
        const i = buffer.indexOf('\r\n');
        if (i < 0) return;
        const linea = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        responder(linea);
      }
    };
    socket.on('data', (trozo) => {
      buffer += trozo.toString('latin1');
      procesar();
    });
    socket.on('error', () => undefined);
  })
  .listen(PUERTO, '127.0.0.1', () => console.log(`Sumidero SMTP escuchando en 127.0.0.1:${PUERTO}`));
