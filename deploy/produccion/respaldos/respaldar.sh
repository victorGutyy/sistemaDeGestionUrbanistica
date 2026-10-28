#!/usr/bin/env bash
# Copia de seguridad: la hace el temporizador cada noche a las 2:00 a. m. (hora de Bogotá), o a mano:
#
#   bash /opt/balder/fuente/deploy/produccion/respaldos/respaldar.sh
#
# Qué guarda (RNF-DIS-02):
#   - db-<fecha>.dump         toda la base de datos (formato comprimido de PostgreSQL)
#   - uploads-<fecha>.tar.gz  los adjuntos (soportes de pago y documentos firmados)
#   - env-<fecha>             el archivo de secretos, para poder reconstruir el servidor
# Todo viaja CIFRADO desde el servidor (rclone crypt): en Backblaze solo hay datos ilegibles.
# Antes de subir, cada archivo se comprueba (que se pueda leer y esté completo); después de subir, se compara el
# tamaño en la nube con el local. Si algo falla, el guion termina con error y, si hay URL de aviso, avisa.
# Se conservan 3 días de copias en el propio servidor (restauración rápida); el resto vive en la nube, donde una
# regla de ciclo de vida de Backblaze borra lo de más de 30 días. Estos guiones NUNCA borran nada en la nube.
# -E: que el manejo de errores (trap ERR) también valga dentro de las funciones; si no, un fallo en medio de una
# función termina el guion SIN avisar.
set -Eeuo pipefail

DIR="$(dirname "$(readlink -f "$0")")"
# shellcheck disable=SC1091
. "${DIR}/comun.sh"
cargar_avisos

DIAS_LOCALES="${DIAS_LOCALES:-3}"

mkdir -p "${DESTINO_LOCAL}"
chmod 700 "${DESTINO_LOCAL}"

# Una sola copia a la vez.
exec 9>"${DESTINO_LOCAL}/.bloqueo"
if ! flock -n 9; then
  registrar "Ya hay una copia en curso; no se inicia otra."
  exit 0
fi

fallo() {
  registrar "ERROR: la copia de seguridad FALLÓ (línea $1). Revisa: journalctl -u balder-respaldo -n 50"
  avisar "${URL_AVISO_FALLO}"
  exit 1
}
trap 'fallo $LINENO' ERR

SELLO="$(date +%Y%m%d-%H%M%S)"
PGUSER="$(leer_env POSTGRES_USER)"
PGDB="$(leer_env POSTGRES_DB)"
DB="${DESTINO_LOCAL}/db-${SELLO}.dump"
UP="${DESTINO_LOCAL}/uploads-${SELLO}.tar.gz"

registrar "1/5 Volcando la base de datos"
compose exec -T db pg_dump -U "${PGUSER}" -d "${PGDB}" -Fc --no-owner > "${DB}.parcial"
# Comprueba que el archivo se puede leer entero (si el volcado quedó cortado, esto falla).
compose exec -T db pg_restore -l < "${DB}.parcial" > /dev/null
if [ "$(stat -c %s "${DB}.parcial")" -lt 1024 ]; then
  registrar "El volcado de la base es sospechosamente pequeño."
  false
fi
mv "${DB}.parcial" "${DB}"

registrar "2/5 Copiando los adjuntos"
compose exec -T api tar -czf - -C /app uploads > "${UP}.parcial"
tar -tzf "${UP}.parcial" > /dev/null
mv "${UP}.parcial" "${UP}"

subir() {
  local archivo="$1" carpeta="$2" nombre="$3" esperado remoto
  rclone copyto "${archivo}" "${REMOTO}:${carpeta}/${nombre}" --retries 3 --low-level-retries 5 --quiet
  esperado="$(stat -c %s "${archivo}")"
  remoto="$(tamano_remoto "${carpeta}" "${nombre}")"
  if [ "${remoto}" != "${esperado}" ]; then
    registrar "El archivo ${nombre} quedó incompleto en la nube (local ${esperado} bytes, nube ${remoto:-ninguno})."
    return 1
  fi
}

registrar "3/5 Subiendo la base de datos (cifrada)"
subir "${DB}" db "$(basename "${DB}")"
registrar "4/5 Subiendo los adjuntos (cifrados)"
subir "${UP}" uploads "$(basename "${UP}")"
registrar "5/5 Subiendo el archivo de secretos (cifrado)"
subir "${BASE}/.env" env "env-${SELLO}"

# Limpieza de las copias locales viejas.
find "${DESTINO_LOCAL}" -maxdepth 1 -type f \( -name 'db-*' -o -name 'uploads-*' \) -mtime +"${DIAS_LOCALES}" -delete

registrar "OK: copia ${SELLO} completa (base $(stat -c %s "${DB}") bytes, adjuntos $(stat -c %s "${UP}") bytes)."
avisar "${URL_AVISO_OK}"
