// Siembra la primera cuenta PROPIETARIO. No hay registro público: esta es
// la única forma de crear el primer usuario; el resto se crean desde la
// sección "Usuarios" de la app (solo visible para el propietario).
//
// Uso: completa SEED_ADMIN_NOMBRE/EMAIL/PASSWORD en .env y corre
// `npx prisma db seed`. Después borra esas tres variables del .env: ya
// quedó la cuenta creada en la base de datos, no hace falta dejarlas.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '../src/generated/prisma/client.js';

const nombre = process.env.SEED_ADMIN_NOMBRE;
const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;

if (!nombre || !email || !password) {
  console.error('Faltan SEED_ADMIN_NOMBRE, SEED_ADMIN_EMAIL o SEED_ADMIN_PASSWORD en .env');
  process.exit(1);
}

if (password.length < 8) {
  console.error('SEED_ADMIN_PASSWORD debe tener al menos 8 caracteres');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const passwordHash = await bcrypt.hash(password, 12);

const usuario = await prisma.usuario.upsert({
  where: { email },
  update: { nombre, passwordHash, rol: 'PROPIETARIO', estado: 'ACTIVO' },
  create: { nombre, email, passwordHash, rol: 'PROPIETARIO' },
  select: { id: true, nombre: true, email: true, rol: true },
});

console.log('Usuario propietario listo:', usuario);

await prisma.$disconnect();
