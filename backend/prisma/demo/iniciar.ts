// Arranca la API apuntando a la base de demostración o a la de volumen (nunca a la de desarrollo):
//   npm run demo:api            → puerto 3001, base sistema_urbanismo_demo
//   npm run demo:api -- volumen → puerto 3002, base sistema_urbanismo_volumen
import { parseModo } from '../../src/common/bases-demo.js';
import { aislarProceso, baseDeEntorno } from './entorno.js';

const modo = parseModo(process.argv[2] ?? 'demo');
const base = baseDeEntorno(modo);
aislarProceso(modo, base);
process.env.PORT = modo === 'demo' ? '3001' : '3002';
process.env.FRONTEND_URL = modo === 'demo' ? 'http://localhost:5174' : 'http://localhost:5175';
console.log(`API de ${modo} → base ${base.nombre}, puerto ${process.env.PORT} (correo desactivado)`);
await import('../../src/main.js');
