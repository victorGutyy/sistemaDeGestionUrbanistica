#!/usr/bin/env bash
# Funciones y valores compartidos por los guiones de copias de seguridad. No se ejecuta solo: lo cargan los demás.

BASE="${BASE:-/opt/balder}"
CARPETA="${BASE}/fuente/deploy/produccion"
DESTINO_LOCAL="${BASE}/respaldos"
# Nombre del "remoto" de rclone que cifra todo antes de subirlo a Backblaze B2 (ver configurar-copias.sh).
REMOTO="${REMOTO:-copias}"
export RCLONE_CONFIG="${RCLONE_CONFIG:-${BASE}/rclone.conf}"

registrar() {
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

# Lee un valor del .env de producción sin cargarlo como script (una clave con espacios o comillas no lo rompe).
leer_env() {
  grep -E "^$1=" "${BASE}/.env" | head -n1 | cut -d= -f2-
}

compose() {
  docker compose --env-file "${BASE}/.env" -f "${CARPETA}/docker-compose.yml" "$@"
}

# Avisos opcionales (por ejemplo healthchecks.io), en /opt/balder/copias.env:
#   URL_AVISO_OK / URL_AVISO_FALLO      la copia diaria
#   URL_PRUEBA_OK / URL_PRUEBA_FALLO    la prueba mensual de restauración (otro chequeo, para no confundirlas)
cargar_avisos() {
  URL_AVISO_OK=""
  URL_AVISO_FALLO=""
  URL_PRUEBA_OK=""
  URL_PRUEBA_FALLO=""
  if [ -f "${BASE}/copias.env" ]; then
    # shellcheck disable=SC1091
    . "${BASE}/copias.env"
  fi
}

# avisar <dirección> [mensaje]: llama a la dirección; con mensaje, lo envía en el cuerpo (healthchecks.io lo guarda y
# lo muestra en la alerta). Si el aviso mismo falla no se rompe nada: es un extra, no parte de la copia.
avisar() {
  if [ -n "${1:-}" ]; then
    curl -fsS -m 15 --retry 2 --data-raw "${2:-}" "$1" > /dev/null 2>&1 || true
  fi
}

# Los archivos del remoto cifrado se listan con el nombre ya descifrado; lsf devuelve "tamaño;nombre".
tamano_remoto() {
  local carpeta="$1" nombre="$2"
  rclone lsf --format sp --files-only "${REMOTO}:${carpeta}" 2>/dev/null | awk -F';' -v n="${nombre}" '$2 == n { print $1; exit }'
}
