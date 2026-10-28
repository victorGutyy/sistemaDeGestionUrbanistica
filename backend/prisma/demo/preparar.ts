// Prepara una base de demostración o de volumen, separada de la de desarrollo:
//   npm run demo:preparar            → sistema_urbanismo_demo (La Floresta con escenarios de ejemplo)
//   npm run demo:volumen             → sistema_urbanismo_volumen (carga grande para medir el rendimiento)
// Con --reiniciar elimina y recrea la base derivada (jamás la de desarrollo).
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { exigirBaseDerivadaParaReiniciar, parseModo } from '../../src/common/bases-demo.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { aislarProceso, baseDeEntorno, carpetaDe } from './entorno.js';

const argumentos = process.argv.slice(2);
const valorDe = (nombre: string) => {
  const i = argumentos.indexOf(nombre);
  return i >= 0 ? argumentos[i + 1] : undefined;
};

const modo = parseModo(valorDe('--base'));
const reiniciar = argumentos.includes('--reiniciar');
const base = baseDeEntorno(modo);
const raizBackend = process.cwd();

const claveAleatoria = () => randomBytes(9).toString('base64url');
const EMAIL = { gerente: 'gerente.demo@ejemplo.test', admin: 'admin.demo@ejemplo.test', socio: 'socio.demo@ejemplo.test', contratista: 'contratista.demo@ejemplo.test' };

function ejecutar(descripcion: string, comando: string, args: string[], env: NodeJS.ProcessEnv) {
  console.log(`▶ ${descripcion}`);
  const resultado = spawnSync(comando, args, { cwd: raizBackend, env, stdio: 'inherit', shell: process.platform === 'win32' });
  if (resultado.status !== 0) throw new Error(`Falló: ${descripcion}`);
}

async function crearBase(): Promise<void> {
  exigirBaseDerivadaParaReiniciar(base.nombre);
  const mantenimiento = new PrismaClient({ adapter: new PrismaPg({ connectionString: base.urlMantenimiento }) });
  try {
    const existe = (await mantenimiento.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM pg_database WHERE datname = ${base.nombre}`)[0].n > 0n;
    if (existe && !reiniciar) {
      throw new Error(`La base ${base.nombre} ya existe. Usa --reiniciar para eliminarla y recrearla (solo afecta a esta base).`);
    }
    // El nombre ya se validó (minúsculas, números y guion bajo): es seguro ponerlo entre comillas.
    if (existe) await mantenimiento.$executeRawUnsafe(`DROP DATABASE "${base.nombre}" WITH (FORCE)`);
    await mantenimiento.$executeRawUnsafe(`CREATE DATABASE "${base.nombre}"`);
    console.log(`✔ Base ${base.nombre} creada${existe ? ' de nuevo' : ''}`);
  } finally {
    await mantenimiento.$disconnect();
  }
}

async function main() {
  console.log(`Preparando la base "${base.nombre}" (la de desarrollo, "${base.nombreOriginal}", no se toca)`);
  await crearBase();

  const claves = { gerente: claveAleatoria(), admin: claveAleatoria(), socio: claveAleatoria(), contratista: claveAleatoria() };
  const entornoHijo = {
    ...process.env,
    DATABASE_URL: base.url,
    SEED_ADMIN_NOMBRE: 'Gerente de demostración',
    SEED_ADMIN_EMAIL: EMAIL.gerente,
    SEED_ADMIN_PASSWORD: claves.gerente,
  };
  ejecutar('Aplicando las migraciones', 'npx', ['prisma', 'migrate', 'deploy', '--config', 'prisma7.config.ts'], entornoHijo);
  ejecutar('Sembrando configuración, roles y el usuario gerente', 'node', [join('dist-scripts', 'prisma', 'seed.js')], entornoHijo);

  aislarProceso(modo, base);
  const { abrirContexto, actorDe } = await import('./contexto.js');
  const ctx = await abrirContexto();
  try {
    const gerente = await actorDe(ctx.prisma, EMAIL.gerente);
    const rolAdmin = await ctx.prisma.rolUsuario.findUniqueOrThrow({ where: { clave: 'ADMINISTRADOR' } });
    await ctx.usuarios.crear(
      { nombre: 'Administrador de demostración', email: EMAIL.admin, password: claves.admin, rolId: rolAdmin.id, todosLosProyectos: true, proyectoIds: [] },
      gerente,
    );
    const admin = await actorDe(ctx.prisma, EMAIL.admin);

    console.log(`▶ Cargando los datos (${modo})`);
    if (modo === 'demo') {
      const { cargarDemo } = await import('./datos-demo.js');
      await cargarDemo(ctx, { gerente, admin, emailSocio: EMAIL.socio, passwordSocio: claves.socio });
      const { cargarSst } = await import('./datos-sst.js');
      await cargarSst(ctx, { gerente, admin, emailContratista: EMAIL.contratista, passwordContratista: claves.contratista });
    } else {
      const { cargarVolumen } = await import('./datos-volumen.js');
      await cargarVolumen(ctx, { gerente, admin });
    }

    console.log('▶ Verificando la coherencia');
    const { verificar } = await import('./verificar.js');
    const fallas = await verificar(ctx, EMAIL.gerente, { semaforos: modo === 'demo' });
    if (fallas > 0) throw new Error(`La verificación encontró ${fallas} problema(s)`);
  } finally {
    await ctx.app.close();
  }

  const carpeta = carpetaDe(modo);
  mkdirSync(carpeta, { recursive: true });
  const lineas = [
    `Base: ${base.nombre}`,
    `Gerente:        ${EMAIL.gerente}  ${claves.gerente}`,
    `Administrador:  ${EMAIL.admin}  ${claves.admin}`,
    ...(modo === 'demo' ? [`Socio (Consulta, solo La Floresta): ${EMAIL.socio}  ${claves.socio}`, `Contratista SST: ${EMAIL.contratista}  ${claves.contratista}`] : []),
    '',
  ];
  writeFileSync(join(carpeta, 'credenciales.txt'), lineas.join('\n'), 'utf8');
  console.log(`\n✔ Listo. Las contraseñas (inventadas y válidas solo para esta base) quedaron en backend/.demo/${modo}/credenciales.txt`);
}

main().catch((error: unknown) => {
  console.error(`\n✘ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
