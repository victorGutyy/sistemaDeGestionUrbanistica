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

## Levantar el backend

```bash
cd backend
npm install
cp .env.example .env   # completa DATABASE_URL, JWT_SECRET, etc. con tus valores locales
npx prisma migrate dev # crea las tablas en tu base de datos según prisma/schema.prisma
npm run start:dev
```

La API queda escuchando en `http://localhost:3000` (puerto configurable con `PORT` en `.env`).

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

- ✅ Estructura del monorepo, backend NestJS + Prisma, frontend React + Vite + Tailwind.
- ✅ Módulo de Proyectos y Lotes (CRUD básico).
- ✅ Módulo de Ventas y Financiación (plan de pagos con interés simple sobre saldo inicial).
- ✅ Layout base (login + navegación lateral: Proyectos, Cartera, Contabilidad, Nómina) y pantalla de Registrar venta.
- ✅ PostgreSQL real conectado (Docker) y probado de punta a punta: crear proyecto → lote → venta → plan de cuotas.
- ⏳ Pagos y Abonos, Cartera y Mora, Finanzas generales, Nómina, Dashboard — pendientes.
