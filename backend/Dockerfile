# syntax=docker/dockerfile:1
# Imagen de producción de la API (NestJS + Prisma). Tres productos a partir de un solo archivo:
#   --target api     la API que corre todos los días: solo lo necesario para ejecutar (sin herramientas de desarrollo).
#   --target migrar  las herramientas de base de datos: aplicar migraciones y crear el primer gerente. Se usa y se apaga.
#
# Las capas están ordenadas para que Docker reutilice lo que no cambió: las dependencias solo se reinstalan si cambia
# package-lock.json, no en cada cambio de código.
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS base
WORKDIR /app

# ---- Dependencias (todas, para compilar). bcrypt trae código nativo: si no hay binario listo, se compila aquí.
FROM base AS deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# ---- Compilación: cliente de Prisma, API (dist/) y guiones de datos (dist-scripts/).
FROM deps AS build
COPY . .
# "generate" no se conecta a la base, pero la configuración de Prisma pide una URL: se le da una de mentira.
RUN DATABASE_URL="postgresql://generar:generar@localhost:5432/generar" npx prisma generate --config prisma7.config.ts \
 && npm run build \
 && npx tsc -p tsconfig.json --outDir dist-scripts

# ---- Solo las dependencias de producción (sin NestJS CLI, TypeScript, Prisma CLI, pruebas...).
FROM deps AS prod-deps
RUN npm prune --omit=dev

# ---- Herramientas de base de datos: migraciones y semilla. Lleva todo, porque necesita la CLI de Prisma.
FROM base AS migrar
ENV NODE_ENV=production
COPY --from=build /app /app
CMD ["npx", "prisma", "migrate", "deploy", "--config", "prisma7.config.ts"]

# ---- La API.
FROM base AS api
ENV NODE_ENV=production \
    TZ=America/Bogota \
    PORT=3000
RUN apt-get update \
 && apt-get install -y --no-install-recommends tzdata ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /app/uploads \
 && chown -R node:node /app
COPY --chown=node:node package.json package-lock.json ./
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
# No corre como administrador: si alguien lograra ejecutar algo dentro de la API, no sería root.
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main"]
