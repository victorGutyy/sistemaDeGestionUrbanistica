#!/usr/bin/env bash
# Siembra los catálogos iniciales que llegan con una versión nueva (p. ej. entidades de seguridad social, clases de
# riesgo de la ARL y parámetros legales del año) SIN tocar a ningún usuario ni pedir contraseñas.
#
#   bash /opt/balder/fuente/deploy/produccion/sembrar-catalogos.sh
#
# Es la misma semilla de crear-gerente.sh, pero sin las variables SEED_ADMIN_*: con ellas vacías la semilla no crea ni
# modifica ningún usuario. Es seguro repetirlo: solo crea lo que falta y no pisa lo que el gerente ya haya editado.
# Úsalo después de desplegar una versión que traiga catálogos nuevos (la migración crea las tablas vacías).
set -euo pipefail

BASE="${BASE:-/opt/balder}"
CARPETA="${BASE}/fuente/deploy/produccion"

if [ ! -f "${BASE}/.env" ] || [ ! -d "${CARPETA}" ]; then
  echo "Primero hay que desplegar el sistema (desplegar.sh)." >&2
  exit 1
fi

cd "${CARPETA}"
docker compose --env-file "${BASE}/.env" run --rm migrar npm run db:seed
echo
echo "Listo. Los catálogos iniciales quedaron sembrados."
