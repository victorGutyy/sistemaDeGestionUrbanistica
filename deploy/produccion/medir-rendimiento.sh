#!/usr/bin/env bash
# Mide el rendimiento del sistema EN ESTE SERVIDOR con el volumen que pide el documento de requerimientos (RNF-REN-01 a 04).
#
#   bash medir-rendimiento.sh              lanza la medición en segundo plano y vuelve (sigue aunque se corte tu conexión)
#   bash medir-rendimiento.sh ver          muestra cómo va (el final del registro)
#   bash medir-rendimiento.sh limpiar      borra la base de volumen cuando termines (queda limpio el servidor)
#
# Cómo funciona: en un contenedor desechable crea una base APARTE (<base>_volumen), la llena con datos inventados, arranca
# una API aparte sobre ella y la mide desde adentro del servidor. NO toca la base de producción ni los adjuntos reales, y la
# API real sigue atendiendo como siempre (la medición le quita algo de CPU mientras dura: hazla con el sistema sin uso).
# Los datos son siempre iguales (semilla fija), así que el resultado es comparable con docs/rendimiento.md.
set -Eeuo pipefail

BASE="${BASE:-/opt/balder}"
CARPETA="${CARPETA:-${BASE}/fuente/deploy/produccion}"
SALIDA="${BASE}/medicion"
REGISTRO="${SALIDA}/medicion.log"

compose() {
  docker compose --env-file "${BASE}/.env" -f "${CARPETA}/docker-compose.yml" "$@"
}
leer_env() {
  grep -E "^$1=" "${BASE}/.env" | head -n1 | cut -d= -f2-
}

lanzar() {
  if [ -f "${SALIDA}/.pid" ] && kill -0 "$(cat "${SALIDA}/.pid")" 2> /dev/null; then
    echo "Ya hay una medición en curso. Mira cómo va con:  bash $0 ver"
    exit 1
  fi
  local libre_kb
  libre_kb="$(df -k --output=avail / 2> /dev/null | tail -n1 | tr -d ' ' || echo 0)"
  if [ "${libre_kb:-0}" -gt 0 ] && [ "${libre_kb}" -lt 3000000 ]; then
    echo "Queda poco disco libre (menos de 3 GB). No se lanza la medición." >&2
    exit 1
  fi
  mkdir -p "${SALIDA}"
  : > "${REGISTRO}"
  echo "Lanzando la medición en segundo plano. Tarda de 10 a 25 minutos."
  # JWT_SECRET: la API de medición necesita uno, pero NO es el de producción (solo existe dentro de este contenedor).
  nohup docker compose --env-file "${BASE}/.env" -f "${CARPETA}/docker-compose.yml" run --rm -T \
    -e JWT_SECRET="medicion-temporal-no-es-el-real" \
    -v "${CARPETA}/medicion-interna.sh:/medicion-interna.sh:ro" \
    -v "${SALIDA}:/app/.demo" \
    migrar sh /medicion-interna.sh > "${REGISTRO}" 2>&1 &
  echo $! > "${SALIDA}/.pid"
  echo "Para ver cómo va:  bash $0 ver"
}

ver() {
  if [ ! -f "${REGISTRO}" ]; then
    echo "Todavía no se ha lanzado ninguna medición."
    exit 0
  fi
  if [ -f "${SALIDA}/.pid" ] && kill -0 "$(cat "${SALIDA}/.pid")" 2> /dev/null; then
    echo "-- EN CURSO --"
  else
    echo "-- TERMINADA (o detenida) --"
  fi
  tail -n 60 "${REGISTRO}"
}

limpiar() {
  local base
  base="$(leer_env POSTGRES_DB)_volumen"
  echo "Borrando la base temporal ${base} (la de producción no se toca)"
  compose exec -T db psql -U "$(leer_env POSTGRES_USER)" -d postgres -c "DROP DATABASE IF EXISTS \"${base}\" WITH (FORCE)"
  echo "Listo."
}

case "${1:-iniciar}" in
  iniciar) lanzar ;;
  ver) ver ;;
  limpiar) limpiar ;;
  *) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
