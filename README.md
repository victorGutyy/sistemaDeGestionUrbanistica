# Sistema Urbanismo

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

Si no tienes PostgreSQL instalado localmente, la forma más rápida de levantar uno para desarrollo es con Docker:

```bash
docker run --name sistema-urbanismo-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=sistema_urbanismo -p 5432:5432 -d postgres:16
```

Y luego usar esa misma base en `DATABASE_URL` dentro de `backend/.env`.

## Estado actual

- ✅ Estructura del monorepo, backend NestJS + Prisma, frontend React + Vite + Tailwind.
- ✅ Modelo de datos `Proyecto` / `Lote` (módulo de Proyectos y Lotes).
- ✅ Layout base (login + navegación lateral: Proyectos, Cartera, Contabilidad, Nómina).
- ⏳ Ventas y Financiación, Pagos y Abonos, Cartera y Mora, Finanzas generales, Nómina, Dashboard — pendientes.
