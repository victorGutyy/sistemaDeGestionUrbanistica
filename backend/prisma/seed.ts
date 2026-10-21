// Siembra los datos iniciales. Es seguro correrlo varias veces: nunca pisa lo
// que el gerente ya editó en la app (solo crea lo que falta).
//
// 1) Configuración inicial de la empresa (prisma/semillas/empresa-balder.ts):
//    datos de la empresa, parámetros, cuentas, categorías, medios de pago y
//    comisiones.
// 2) Roles del sistema (Gerente, Administrador, Consulta) con sus permisos.
// 3) Recibos históricos (serie H-) para los abonos que todavía no tienen recibo.
// 4) Primera cuenta con rol GERENTE, solo si
//    están SEED_ADMIN_NOMBRE/EMAIL/PASSWORD en .env. No hay registro público:
//    esta es la única forma de crear el primer usuario; el resto se crean
//    desde la sección "Usuarios" de la app. Después de correrlo borra esas
//    tres variables del .env.
//
// Uso: `npx prisma db seed`
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { emitirRecibosHistoricosFaltantes } from '../src/abonos/recibos-historicos.js';
import { CLAVE_GERENTE, ROLES_SISTEMA } from '../src/auth/permisos.js';
import { MEDIOS_ACTIVOS_POR_DEFECTO } from '../src/configuracion/configuracion.service.js';
import { Prisma, PrismaClient } from '../src/generated/prisma/client.js';
import { MedioPago } from '../src/generated/prisma/enums.js';
import { CATEGORIAS_GASTO, CATEGORIAS_INGRESO, COMISIONES, CUENTAS, EMPRESA, PARAMETROS, TIPOS_EQUIPO } from './semillas/empresa-balder.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function sembrarConfiguracion() {
  // update vacío: si la fila ya existe (el gerente la editó) no se toca.
  await prisma.configuracionEmpresa.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      ...EMPRESA,
      ...PARAMETROS,
      porcentajeCuotaInicial: new Prisma.Decimal(PARAMETROS.porcentajeCuotaInicial),
      tasaFinanciacionMensual: new Prisma.Decimal(PARAMETROS.tasaFinanciacionMensual),
      tasaMoraMensual: PARAMETROS.tasaMoraMensual === null ? null : new Prisma.Decimal(PARAMETROS.tasaMoraMensual),
    },
  });

  for (const cuenta of CUENTAS) {
    await prisma.cuentaBancaria.upsert({
      where: { banco_numero: { banco: cuenta.banco, numero: cuenta.numero } },
      update: {},
      create: { ...cuenta, activa: false },
    });
  }

  for (const categoria of CATEGORIAS_GASTO) {
    await prisma.categoriaGasto.upsert({ where: { nombre: categoria.nombre }, update: {}, create: categoria });
  }

  for (const categoria of CATEGORIAS_INGRESO) {
    await prisma.categoriaIngreso.upsert({ where: { nombre: categoria.nombre }, update: {}, create: categoria });
  }

  for (const nombre of TIPOS_EQUIPO) {
    await prisma.tipoEquipo.upsert({ where: { nombre }, update: {}, create: { nombre } });
  }

  await prisma.medioPagoConfig.createMany({
    // El efectivo no se verifica contra el extracto (se cuadra en el cierre de caja); los demás medios sí (RF-REC-10).
    data: Object.values(MedioPago).map((medio) => ({ medio, activo: MEDIOS_ACTIVOS_POR_DEFECTO[medio], requiereVerificacion: medio !== MedioPago.EFECTIVO })),
    skipDuplicates: true,
  });

  await prisma.comisionTipoVendedor.createMany({
    data: COMISIONES.map((c) => ({ tipo: c.tipo, valor: new Prisma.Decimal(c.valor) })),
    skipDuplicates: true,
  });

  console.log('Configuración inicial lista (empresa, parámetros, cuentas, categorías de gasto e ingreso, tipos de equipo, medios de pago, comisiones).');
}

async function sembrarRoles() {
  for (const rol of ROLES_SISTEMA) {
    const datos = { ...rol, esSistema: true };
    await prisma.rolUsuario.upsert({ where: { clave: rol.clave }, update: datos, create: datos });
  }
  console.log('Roles del sistema listos.');
}

async function sembrarRecibosHistoricos() {
  const emitidos = await emitirRecibosHistoricosFaltantes(prisma);
  console.log(`Recibos históricos emitidos: ${emitidos}.`);
}

async function sembrarUsuarioInicial() {
  const nombre = process.env.SEED_ADMIN_NOMBRE;
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!nombre && !email && !password) {
    console.log('Sin SEED_ADMIN_*: no se crea ni se modifica ningún usuario.');
    return;
  }
  if (!nombre || !email || !password) {
    throw new Error('Faltan SEED_ADMIN_NOMBRE, SEED_ADMIN_EMAIL o SEED_ADMIN_PASSWORD en .env');
  }
  if (password.length < 8) {
    throw new Error('SEED_ADMIN_PASSWORD debe tener al menos 8 caracteres');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const usuario = await prisma.usuario.upsert({
    where: { email },
    update: { nombre, passwordHash, rol: { connect: { clave: CLAVE_GERENTE } }, estado: 'ACTIVO', intentosFallidos: 0, bloqueadoHasta: null },
    create: { nombre, email, passwordHash, rol: { connect: { clave: CLAVE_GERENTE } } },
    select: { id: true, nombre: true, email: true, rol: { select: { clave: true } } },
  });
  console.log('Usuario gerente listo:', usuario);
}

try {
  await sembrarConfiguracion();
  await sembrarRoles();
  await sembrarRecibosHistoricos();
  await sembrarUsuarioInicial();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
