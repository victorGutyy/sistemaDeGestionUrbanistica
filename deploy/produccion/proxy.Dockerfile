# syntax=docker/dockerfile:1
# Imagen del servidor web: compila las pantallas (React) y las sirve con Caddy, que además hace de puerta de entrada
# a la API y consigue solo el certificado HTTPS. Se construye con la RAÍZ del proyecto como contexto.
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS pantallas
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# La API se llama por la misma dirección (sistema.<dominio>/api): así no hay CORS ni direcciones fijas en el código.
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

FROM caddy:2
COPY deploy/produccion/Caddyfile /etc/caddy/Caddyfile
COPY --from=pantallas /app/dist /srv
