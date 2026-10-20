// Comprobación rápida de la demostración por HTTP: úsala antes de una presentación para confirmar que los escenarios
// siguen ahí y que los permisos hacen lo que deben (sobre todo el socio restringido a La Floresta).
//   1) npm run demo:preparar -- --reiniciar     2) npm run demo:api     3) npm run demo:comprobar
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const argumentos = process.argv.slice(2);
const A = (argumentos.includes('--url') ? argumentos[argumentos.indexOf('--url') + 1] : 'http://localhost:3001').replace(/\/$/, '');

const texto = readFileSync(join(process.cwd(), '.demo', 'demo', 'credenciales.txt'), 'utf8');
const credencial = (inicio) => {
  const linea = texto.split('\n').find((l) => l.startsWith(inicio));
  if (!linea) throw new Error(`No hay credenciales de "${inicio}" en backend/.demo/demo/credenciales.txt`);
  const [email, password] = linea.trim().split(/ +/).slice(-2);
  return { email, password };
};

const iniciarSesion = async (usuario) => {
  const r = await fetch(`${A}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(usuario) });
  if (!r.ok) throw new Error(`No se pudo iniciar sesión con ${usuario.email} (${r.status})`);
  return (await r.json()).accessToken;
};

const llamar = async (token, metodo, ruta, cuerpo) => {
  const r = await fetch(A + ruta, { method: metodo, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const bruto = await r.text();
  let datos = null;
  try { datos = JSON.parse(bruto); } catch { /* no es JSON */ }
  return { status: r.status, datos };
};

let fallas = 0;
const revisar = (ok, descripcion, detalle) => {
  console.log(`  ${ok ? '✔' : '✘'} ${descripcion}${ok || detalle === undefined ? '' : ` → ${JSON.stringify(detalle)}`}`);
  if (!ok) fallas += 1;
};
const prohibido = (r) => r.status === 403 || r.status === 404;

const gerente = await iniciarSesion(credencial('Gerente'));
const admin = await iniciarSesion(credencial('Administrador'));
const socio = await iniciarSesion(credencial('Socio'));

console.log('Gerente');
const proyectos = (await llamar(gerente, 'GET', '/proyectos')).datos;
revisar(proyectos.length === 3, 'Tres proyectos: lotes, remodelación y maquinaria', proyectos.map((p) => p.nombre));
const floresta = proyectos.find((p) => p.nombre === 'La Floresta');
const remodelacion = proyectos.find((p) => p.tipo === 'REMODELACION');
const maquinaria = proyectos.find((p) => p.tipo === 'MAQUINARIA');
const lotes = (await llamar(gerente, 'GET', `/lotes?proyectoId=${floresta.id}`)).datos;
revisar(lotes.length === 135, 'La Floresta tiene 135 lotes', lotes.length);

const cartera = (await llamar(gerente, 'GET', '/cartera')).datos;
const conteo = (color) => cartera.filter((c) => c.semaforo === color).length;
revisar(conteo('VERDE') > 0 && conteo('AMARILLO') > 0 && conteo('ROJO') > 0, `Cartera con verde (${conteo('VERDE')}), amarillo (${conteo('AMARILLO')}) y rojo (${conteo('ROJO')})`);
revisar(cartera.filter((c) => c.semaforo === 'ROJO').every((c) => Number(c.interesMora) > 0), 'Los clientes en rojo muestran interés de mora');

const ventas = (await llamar(gerente, 'GET', '/ventas')).datos;
const estados = [...new Set(ventas.map((v) => v.estado))];
revisar(ventas.some((v) => v.estado === 'PENDIENTE_APROBACION'), 'Hay una excepción pendiente de aprobación', estados);
revisar(ventas.some((v) => v.esExcepcion && v.estado === 'ACTIVA'), 'Hay una excepción ya autorizada');
revisar(ventas.some((v) => v.estado === 'DESISTIDA'), 'Hay una venta desistida', estados);

const recibos = (await llamar(gerente, 'GET', '/recibos')).datos;
revisar(recibos.length >= 55 && recibos.some((r) => r.recibo?.esHistorico), `Recibos de caja y históricos (${recibos.length})`);
revisar(JSON.stringify(recibos).includes('ANULADO'), 'Hay un abono anulado');

const cierres = (await llamar(gerente, 'GET', '/cierres-caja')).datos;
const porEstado = (e) => cierres.filter((c) => c.estado === e).length;
revisar(porEstado('APROBADO') === 2 && porEstado('CERRADO') === 1, 'Cierres de caja: 2 aprobados y 1 cerrado pendiente', cierres.map((c) => c.estado));
revisar(cierres.some((c) => c.explicacionDiferencia), 'Un cierre tiene diferencia explicada');

const comisiones = (await llamar(gerente, 'GET', '/comisiones')).datos;
revisar(comisiones.totales.PAGADA.cantidad === 2 && comisiones.totales.ANULADA.cantidad === 2 && comisiones.totales.PENDIENTE.cantidad >= 5, 'Comisiones: 2 pagadas, 2 anuladas y varias pendientes', comisiones.totales);

const equipos = (await llamar(gerente, 'GET', `/equipos?proyectoId=${maquinaria.id}&incluirBajas=true`)).datos;
revisar(Array.isArray(equipos) && equipos.length === 4, 'Maquinaria con 4 equipos (uno dado de baja)', Array.isArray(equipos) ? equipos.length : equipos);
const finanzasRemodelacion = await llamar(gerente, 'GET', `/finanzas/proyectos/${remodelacion.id}`);
revisar(finanzasRemodelacion.status === 200, 'Finanzas de la remodelación disponibles', finanzasRemodelacion.status);
revisar((await llamar(gerente, 'GET', '/auditoria')).status === 200, 'Auditoría disponible para el gerente');
revisar((await llamar(gerente, 'GET', '/exportacion/completa')).status === 200, 'Exportación completa disponible para el gerente');

console.log('Administrador');
revisar((await llamar(admin, 'GET', '/ventas')).status === 200, 'Ve las ventas');
const pendiente = ventas.find((v) => v.estado === 'PENDIENTE_APROBACION');
revisar(prohibido(await llamar(admin, 'POST', `/ventas/${pendiente.id}/aprobar`)), 'No puede autorizar la excepción (solo el gerente)');
revisar(prohibido(await llamar(admin, 'GET', '/auditoria')), 'No ve la auditoría');
const pendienteDeComision = comisiones.comisiones.find((c) => c.estado === 'PENDIENTE');
revisar((await llamar(admin, 'GET', '/comisiones')).status === 200, 'Ve las comisiones');
revisar(prohibido(await llamar(admin, 'POST', `/comisiones/${pendienteDeComision.id}/anular`, { motivo: 'No debería poder' })), 'No puede anular comisiones (solo el gerente)');
revisar(prohibido(await llamar(admin, 'GET', '/exportacion/completa')), 'No exporta todos los datos');

console.log('Socio (Consulta, solo La Floresta)');
const proyectosSocio = (await llamar(socio, 'GET', '/proyectos')).datos;
revisar(proyectosSocio.length === 1 && proyectosSocio[0].nombre === 'La Floresta', 'Solo ve La Floresta', proyectosSocio.map?.((p) => p.nombre));
revisar(prohibido(await llamar(socio, 'GET', `/proyectos/${maquinaria.id}`)), 'No puede abrir el proyecto de maquinaria por su id');
revisar(prohibido(await llamar(socio, 'GET', `/finanzas/proyectos/${remodelacion.id}`)), 'No ve las finanzas de la remodelación');
revisar((await llamar(socio, 'GET', `/finanzas/proyectos/${floresta.id}`)).status === 200, 'Sí ve las finanzas de La Floresta');
const ventasSocio = (await llamar(socio, 'GET', '/ventas')).datos;
revisar(Array.isArray(ventasSocio) && ventasSocio.length > 0 && ventasSocio.every((v) => ventas.find((x) => x.id === v.id)), 'Ve ventas, solo las de su proyecto', ventasSocio.length);
revisar(prohibido(await llamar(socio, 'POST', '/clientes', { nombre: 'X', documento: '1', tipoDocumento: 'CC' })), 'No puede crear clientes');
revisar(prohibido(await llamar(socio, 'GET', '/comisiones')), 'No ve las comisiones');
revisar(prohibido(await llamar(socio, 'GET', '/auditoria')), 'No ve la auditoría');
revisar(prohibido(await llamar(socio, 'GET', '/usuarios')), 'No ve los usuarios');
revisar(prohibido(await llamar(socio, 'GET', '/exportacion/completa')), 'No exporta todos los datos');

console.log(fallas === 0 ? '\n✔ La demostración está lista.' : `\n✘ ${fallas} comprobación(es) fallaron.`);
process.exit(fallas === 0 ? 0 : 1);
