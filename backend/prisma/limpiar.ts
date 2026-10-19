// Deja una base de datos como una instalación nueva: borra TODOS los datos (también la configuración y los usuarios) y
// vuelve a correr la semilla. Es para el día en que se cargue el Excel real del cliente.
//
// Candados (ver src/common/limpieza-segura.ts): no corre en producción, solo contra una base local, exige escribir el
// nombre exacto de la base en CONFIRMO_LIMPIAR y un respaldo (pg_dump) de los últimos 30 minutos.
//
//   npm run db:limpiar -- --ensayo      → solo muestra qué se borraría (no cambia nada)
//   npm run db:limpiar                  → limpia (con los candados cumplidos)
//   npm run db:limpiar -- --archivos    → además vacía la carpeta uploads/ (soportes adjuntos)
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { validarLimpieza } from '../src/common/limpieza-segura.js';
import { PrismaClient } from '../src/generated/prisma/client.js';

const ensayo = process.argv.includes('--ensayo');
const conArchivos = process.argv.includes('--archivos');
const raiz = process.cwd();
const urlBase = process.env.DATABASE_URL;
if (!urlBase) throw new Error('Falta DATABASE_URL');

function listarRespaldos() {
  const carpeta = join(raiz, 'respaldos');
  try {
    return readdirSync(carpeta).map((nombre) => ({ nombre, modificadoEn: statSync(join(carpeta, nombre)).mtime }));
  } catch {
    return [];
  }
}

function archivosSubidos(): string[] {
  const carpeta = join(raiz, 'uploads');
  try {
    return readdirSync(carpeta).filter((nombre) => nombre !== '.gitkeep');
  } catch {
    return [];
  }
}

async function main() {
  let nombreBase = '';
  try {
    nombreBase = validarLimpieza({
      nodeEnv: process.env.NODE_ENV,
      databaseUrl: urlBase!,
      confirmacion: process.env.CONFIRMO_LIMPIAR,
      respaldos: listarRespaldos(),
      ahora: new Date(),
    }).nombreBase;
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    if (!ensayo) throw error;
    console.log(`⚠ En una limpieza real esto la detendría: ${mensaje}\n`);
    nombreBase = decodeURIComponent(new URL(urlBase!).pathname.replace(/^\//, ''));
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlBase }) });
  try {
    const tablas = (await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`).map((t) => t.tablename);

    console.log(`${ensayo ? 'ENSAYO — no se cambia nada. ' : ''}Base: ${nombreBase} (${tablas.length} tablas)`);
    let total = 0;
    for (const tabla of tablas) {
      const filas = Number((await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*) AS n FROM "${tabla}"`))[0].n);
      total += filas;
      if (filas > 0) console.log(`  ${tabla.padEnd(28)} ${filas} filas`);
    }
    console.log(`  Total: ${total} filas${conArchivos ? ` y ${archivosSubidos().length} archivo(s) en uploads/` : ''}`);

    const haySemilla = Boolean(process.env.SEED_ADMIN_NOMBRE && process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PASSWORD);
    if (!haySemilla) {
      const aviso = 'Sin SEED_ADMIN_NOMBRE, SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD en .env, después de limpiar no habría ningún usuario con quién entrar.';
      if (!ensayo) throw new Error(`${aviso} Agrégalas (temporalmente) y vuelve a correr.`);
      console.log(`⚠ ${aviso}`);
    }
    if (ensayo) {
      console.log('\nEnsayo terminado: la base quedó intacta.');
      return;
    }

    // TRUNCATE no dispara los candados que impiden borrar fila por fila (recibos, abonos, auditoría...): por eso los
    // candados de ESTE script son los de arriba.
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tablas.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
    console.log('✔ Todas las tablas quedaron vacías');
  } finally {
    await prisma.$disconnect();
  }

  console.log('▶ Sembrando de nuevo la configuración, los roles y el primer usuario');
  const semilla = spawnSync('node', [join('dist-scripts', 'prisma', 'seed.js')], { cwd: raiz, env: process.env, stdio: 'inherit', shell: process.platform === 'win32' });
  if (semilla.status !== 0) throw new Error('La semilla falló: la base quedó vacía; vuelve a correr `npm run db:seed` o restaura el respaldo');

  if (conArchivos) {
    for (const nombre of archivosSubidos()) rmSync(join(raiz, 'uploads', nombre), { recursive: true, force: true });
    console.log('✔ Carpeta uploads/ vaciada');
  }
  console.log('\n✔ Base limpia. Quita de backend/.env las variables SEED_ADMIN_* y CONFIRMO_LIMPIAR si las pusiste ahí.');
}

main().catch((error: unknown) => {
  console.error(`\n✘ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
