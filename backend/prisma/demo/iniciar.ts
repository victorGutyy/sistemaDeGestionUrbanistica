// Arranca la API apuntando a la base de demostración o a la de volumen (nunca a la de desarrollo):
//   npm run demo:api            → puerto 3001, base sistema_urbanismo_demo
//   npm run demo:api -- volumen → puerto 3002, base sistema_urbanismo_volumen
import { parseModo } from '../../src/common/bases-demo.js';
import { aislarProceso, baseDeEntorno } from './entorno.js';

const modo = parseModo(process.argv[2] ?? 'demo');
const base = baseDeEntorno(modo);
aislarProceso(modo, base);
// Estas APIs son herramientas locales (no están en internet) y la medición de rendimiento abre 10 y 30 sesiones a la vez desde la
// misma IP: el límite por IP de las rutas públicas las bloquearía. Se puede volver a activar con LIMITE_POR_IP=activado.
process.env.LIMITE_POR_IP ??= 'desactivado';
process.env.PORT = modo === 'demo' ? '3001' : '3002';
process.env.FRONTEND_URL = modo === 'demo' ? 'http://localhost:5174' : 'http://localhost:5175';
console.log(`API de ${modo} → base ${base.nombre}, puerto ${process.env.PORT} (correo desactivado)`);
await import('../../src/main.js');
