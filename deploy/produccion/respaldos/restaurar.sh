#!/usr/bin/env bash
# Restauración desde las copias de seguridad cifradas de Backblaze B2.
#
#   bash restaurar.sh listar             muestra las copias que hay en la nube
#   bash restaurar.sh probar             PRUEBA SEGURA: restaura la última copia en una base temporal, la compara con la
#                                        base real y la borra. No toca nada de producción. Se hace una vez al mes.
#   bash restaurar.sh real [sello]       EMERGENCIA: reemplaza la base y los adjuntos de producción por una copia.
#                                        "sello" es la fecha de la copia (por ejemplo 20261101-020000); sin él, la última.
#
# Para reconstruir el servidor desde cero con estas copias, ver docs/despliegue.md ("Si el servidor se pierde").
# -E: que el manejo de errores (trap ERR) también valga dentro de las funciones; si no, un fallo en medio de una
# función termina el guion SIN avisar.
set -Eeuo pipefail

DIR="$(dirname "$(readlink -f "$0")")"
# shellcheck disable=SC1091
. "${DIR}/comun.sh"
cargar_avisos

PGUSER="$(leer_env POSTGRES_USER)"
PGDB="$(leer_env POSTGRES_DB)"
TABLAS=(Usuario Proyecto Lote Cliente Venta Abono)

contar() {
  # Cuenta filas de una tabla en una base; si la tabla no existe devuelve un guion en lugar de fallar.
  compose exec -T db psql -U "${PGUSER}" -d "$1" -Atc "SELECT count(*) FROM \"$2\"" 2> /dev/null || echo "-"
}

ultimo_de() {
  rclone lsf --files-only "${REMOTO}:$1" | sort | tail -n1
}

descargar() {
  local carpeta="$1" nombre="$2" destino="$3"
  registrar "Descargando y descifrando ${carpeta}/${nombre}"
  rclone copyto "${REMOTO}:${carpeta}/${nombre}" "${destino}" --retries 3 --quiet
}

modo_listar() {
  echo "== Bases de datos (db/)";  rclone lsf --format sp --files-only "${REMOTO}:db" | sort | sed 's/^/   /'
  echo "== Adjuntos (uploads/)";    rclone lsf --format sp --files-only "${REMOTO}:uploads" | sort | sed 's/^/   /'
  echo "== Secretos (env/)";        rclone lsf --format sp --files-only "${REMOTO}:env" | sort | sed 's/^/   /'
  echo "(formato: tamaño en bytes;nombre)"
}

modo_probar() {
  local temporal="${DESTINO_LOCAL}/prueba-restauracion"
  local ultimo
  mkdir -p "${temporal}"
  chmod 700 "${temporal}"
  fallo() {
    registrar "ERROR: la PRUEBA DE RESTAURACIÓN falló (línea $1)."
    compose exec -T db psql -U "${PGUSER}" -d postgres -c "DROP DATABASE IF EXISTS restauracion_prueba" > /dev/null 2>&1 || true
    avisar "${URL_PRUEBA_FALLO}" "La prueba de restauración falló en $(hostname) (línea $1). Revisar: journalctl -u balder-prueba-restauracion -n 50"
    exit 1
  }
  trap 'fallo $LINENO' ERR

  ultimo="$(ultimo_de db)"
  if [ -z "${ultimo}" ]; then
    registrar "No hay copias de la base de datos en la nube."
    false
  fi
  descargar db "${ultimo}" "${temporal}/${ultimo}"

  registrar "Restaurando en una base temporal (restauracion_prueba)"
  compose exec -T db psql -U "${PGUSER}" -d postgres -c "DROP DATABASE IF EXISTS restauracion_prueba" > /dev/null
  compose exec -T db psql -U "${PGUSER}" -d postgres -c "CREATE DATABASE restauracion_prueba" > /dev/null
  compose exec -T db pg_restore -U "${PGUSER}" -d restauracion_prueba --no-owner --no-privileges --exit-on-error < "${temporal}/${ultimo}"

  echo
  printf '   %-12s %12s %12s\n' "Tabla" "Copia" "Producción"
  local t copia actual
  for t in "${TABLAS[@]}"; do
    copia="$(contar restauracion_prueba "${t}")"
    actual="$(contar "${PGDB}" "${t}")"
    printf '   %-12s %12s %12s\n' "${t}" "${copia}" "${actual}"
  done
  echo

  local migraciones
  migraciones="$(contar restauracion_prueba _prisma_migrations)"
  compose exec -T db psql -U "${PGUSER}" -d postgres -c "DROP DATABASE restauracion_prueba" > /dev/null
  if [ "${migraciones}" = "-" ] || [ "${migraciones}" -lt 1 ]; then
    registrar "La copia se restauró pero no trae el historial de migraciones: algo no está bien."
    false
  fi
  # Se borra el archivo descargado (contiene datos de clientes) en cuanto termina la prueba.
  rm -f "${temporal}/${ultimo}"
  registrar "PRUEBA OK: la copia ${ultimo} se descifró y se restauró completa (${migraciones} migraciones). La base temporal ya se borró."
  avisar "${URL_PRUEBA_OK}" "Prueba OK: ${ultimo} restaurada completa (${migraciones} migraciones)"
}

modo_real() {
  local sello="${1:-}" db up temporal
  if [ -z "${sello}" ]; then
    db="$(ultimo_de db)"
    sello="${db#db-}"
    sello="${sello%.dump}"
  fi
  db="db-${sello}.dump"
  up="uploads-${sello}.tar.gz"
  temporal="${DESTINO_LOCAL}/restauracion-real"
  mkdir -p "${temporal}"
  chmod 700 "${temporal}"

  echo "================================================================"
  echo " RESTAURACIÓN REAL"
  echo " Se va a REEMPLAZAR la base de datos y los adjuntos de producción"
  echo " por los de la copia: ${sello}"
  echo " Mientras dure, el sistema quedará fuera de servicio."
  echo " Antes de reemplazar se guarda una copia de seguridad de lo actual."
  echo "================================================================"
  read -r -p "Para continuar escribe RESTAURAR (en mayúsculas): " respuesta
  if [ "${respuesta}" != "RESTAURAR" ]; then
    echo "Cancelado. No se tocó nada."
    exit 1
  fi

  fallo_real() {
    registrar "ERROR: la restauración real se INTERRUMPIÓ (línea $1). El sistema puede haber quedado detenido."
    registrar "Lo que había antes se guardó en ${DESTINO_LOCAL}/antes-de-restaurar-*.dump (si el error ocurrió después de ese paso)."
    registrar "No repitas a ciegas: lee los mensajes de arriba y pide ayuda."
    exit 1
  }
  trap 'fallo_real $LINENO' ERR

  descargar db "${db}" "${temporal}/${db}"
  descargar uploads "${up}" "${temporal}/${up}"

  registrar "Guardando una copia de lo actual por si hay que volver atrás"
  mkdir -p "${DESTINO_LOCAL}"
  compose exec -T db pg_dump -U "${PGUSER}" -d "${PGDB}" -Fc --no-owner > "${DESTINO_LOCAL}/antes-de-restaurar-$(date +%Y%m%d-%H%M%S).dump"

  registrar "Deteniendo el servidor web y la API"
  compose stop proxy api

  registrar "Reemplazando la base de datos"
  compose exec -T db psql -U "${PGUSER}" -d postgres -c "DROP DATABASE IF EXISTS \"${PGDB}\" WITH (FORCE)" > /dev/null
  compose exec -T db psql -U "${PGUSER}" -d postgres -c "CREATE DATABASE \"${PGDB}\"" > /dev/null
  compose exec -T db pg_restore -U "${PGUSER}" -d "${PGDB}" --no-owner --no-privileges --exit-on-error < "${temporal}/${db}"

  registrar "Restaurando los adjuntos (se agregan a los que ya haya; no se borra nada)"
  compose run --rm --no-deps -T api tar -xzf - -C /app < "${temporal}/${up}"

  registrar "Arrancando de nuevo"
  compose up -d api proxy
  rm -f "${temporal}/${db}" "${temporal}/${up}"
  registrar "Listo. Comprueba entrando a https://$(leer_env DOMINIO) y revisa un recibo y un cliente conocidos."
  registrar "La copia de lo que había antes quedó en ${DESTINO_LOCAL}/antes-de-restaurar-*.dump"
}

case "${1:-}" in
  listar) modo_listar ;;
  probar) modo_probar ;;
  real) shift; modo_real "$@" ;;
  *)
    sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
