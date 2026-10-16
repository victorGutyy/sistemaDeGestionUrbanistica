# Urbanix

Sistema de gestión para una empresa de urbanismo: compra de predios, subdivisión en lotes, ventas financiadas, cartera y mora, finanzas generales y nómina. Reemplaza el control manual que hoy se lleva en Excel.

## Arquitectura

Monorepo con dos aplicaciones independientes:

- **`backend/`** — API en NestJS + TypeScript, con Prisma sobre PostgreSQL.
- **`frontend/`** — Aplicación web en React + Vite + TypeScript, con Tailwind CSS.
- **`docs/`** — Documentación funcional y técnica del proyecto.

Es una aplicación web (no de escritorio): el backend corre como servicio y el frontend se sirve por navegador. Esto permite que, en el futuro, la app móvil de solo consulta del cliente final se conecte a la misma base de datos sin duplicar lógica.

## Requisitos

- Node.js 20 o superior
- PostgreSQL 15 o superior (local o en un contenedor)

## Requerimientos y reglas del proyecto

- Alcance completo (112 requerimientos funcionales y 32 no funcionales, por etapa): [`docs/requerimientos.md`](docs/requerimientos.md).
- Reglas de trabajo, convenciones y lo que está fuera del alcance: [`CLAUDE.md`](CLAUDE.md).

## Levantar el backend

```bash
cd backend
npm install
cp .env.example .env   # completa DATABASE_URL, JWT_SECRET, etc. con tus valores locales
npx prisma migrate dev # crea las tablas en tu base de datos según prisma/schema.prisma
npm run start:dev
```

La API queda escuchando en `http://localhost:3000` (puerto configurable con `PORT` en `.env`).

**Datos iniciales.** `npx prisma db seed` (desde `backend/`) carga la configuración inicial de la empresa desde `backend/prisma/semillas/empresa-balder.ts` (datos de la empresa, parámetros, categorías de gasto, medios de pago, comisiones y cuentas inactivas "POR CONFIGURAR"); es seguro repetirlo porque nunca pisa lo que el gerente ya editó en la app. Para cambiar de cliente se edita ese archivo y el gerente ajusta el resto desde Configuración.

**Primer usuario.** No hay registro público, así que la primera cuenta se siembra: completa `SEED_ADMIN_NOMBRE`, `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD` (mínimo 8 caracteres) en `backend/.env`, corre `npx prisma db seed` y luego borra esas tres líneas del `.env`. Esa cuenta queda con el rol Gerente; las demás se crean desde la sección Usuarios.

**Comprobar que todo está sano:**

```bash
cd backend && npm test && npm run lint && npx tsc --noEmit -p tsconfig.json
cd ../frontend && npm run lint && npx tsc -b --noEmit
```

## Levantar el frontend

```bash
cd frontend
npm install
npm run dev
```

La aplicación queda disponible en `http://localhost:5173`.

## Base de datos

Para desarrollo local usamos PostgreSQL en Docker (Docker Desktop ya instalado en esta máquina):

```bash
docker run --name sistema-urbanismo-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=sistema_urbanismo -p 5432:5432 -d postgres:16
docker update --restart unless-stopped sistema-urbanismo-db
```

El contenedor queda con reinicio automático, así que normalmente no hay que volver a crearlo — si por alguna razón no está corriendo, revísalo con `docker ps -a` y arráncalo con `docker start sistema-urbanismo-db`.

Con la base arriba, `backend/.env` ya apunta a ella (`postgresql://postgres:postgres@localhost:5432/sistema_urbanismo`). Para crear/actualizar las tablas:

```bash
cd backend
npx prisma migrate dev
```

## Estado actual

La base genérica Urbanix (v1.0) está completa y funcionando; ahora se adapta al primer cliente real según `docs/requerimientos.md`.

Ya existe en la base:
- ✅ Login con JWT, roles con permisos (Gerente, Administrador, Consulta; se pueden agregar más sin tocar el código), bloqueo tras intentos fallidos, cierre de sesión por inactividad y gestión de usuarios.
- ✅ Proyectos y lotes con área disponible, y finalizar/reactivar proyectos.
- ✅ Ventas de contado y financiadas con plan de cuotas.
- ✅ Abonos con comprobante adjunto y estado de las cuotas.
- ✅ Cartera con semáforo e interés de mora (informativo).
- ✅ Ingresos y gastos manuales con consolidado de caja.
- ✅ Nómina básica.
- ✅ Panel general con exportación a PDF y Excel, y recordatorios de pago por correo.

En adaptación (ver `docs/requerimientos.md`):
- ⏳ Etapa 1: configuración de empresa, roles (GERENTE) con alcance por proyecto, manzanas y estados de lote, ventas con excepciones, recibo de caja con consecutivo y anulación, cierre de caja, egresos por categoría, auditoría e importador de Excel.
- ⏳ Etapa 2: notificaciones (correo y WhatsApp), verificación de consignaciones, comisiones, panel y reportes ampliados, recuperación de contraseña.
- ⏳ Etapa 3: módulo de personal.

La interfaz ya es responsive desde 360 px, usa formato colombiano ($1.234.567, dd/mm/aaaa) y las descargas (exportaciones y comprobantes) envían la sesión. Otros pendientes conocidos están en la sección "Deuda técnica conocida" de `CLAUDE.md`.
