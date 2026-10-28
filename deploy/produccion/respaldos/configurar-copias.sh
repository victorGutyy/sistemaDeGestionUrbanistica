#!/usr/bin/env bash
# Deja listas las copias de seguridad cifradas hacia Backblaze B2. Se ejecuta UNA vez, en el servidor, como deploy:
#
#   bash /opt/balder/fuente/deploy/produccion/respaldos/configurar-copias.sh
#
# Antes debes tener (ver docs/despliegue.md, fase 4): una cuenta de Backblaze B2, un bucket PRIVADO y una "llave de
# aplicación" limitada a ese bucket. El nombre del bucket y la llave se escriben aquí por pantalla;
# nunca por un chat.
#
# Qué hace:
#   1. Instala rclone (la herramienta que sube las copias).
#   2. Guarda la conexión a B2 en /opt/balder/rclone.conf (solo lo lee este usuario).
#   3. Genera DOS contraseñas de cifrado al azar y te las muestra UNA vez: guárdalas en tu gestor. Sin ellas las copias
#      no se pueden abrir, ni siquiera por quien las tenga en la nube.
#   4. Comprueba que se puede subir, leer y descifrar un archivo de prueba.
#   5. Instala los dos temporizadores: copia diaria (2:00 a. m.) y prueba de restauración mensual.
#   6. Hace la primera copia completa.
set -euo pipefail

DIR="$(dirname "$(readlink -f "$0")")"
# shellcheck disable=SC1091
. "${DIR}/comun.sh"

if [ ! -f "${BASE}/.env" ] || [ ! -d "${CARPETA}" ]; then
  echo "Primero hay que desplegar el sistema (desplegar.sh)." >&2
  exit 1
fi
if ! docker ps > /dev/null 2>&1; then
  echo "Docker no responde para este usuario." >&2
  exit 1
fi

echo "== 1/6 Instalando rclone"
if ! command -v rclone > /dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y rclone
fi
rclone version | head -n1

echo "== 2/6 Conexión a Backblaze B2"
if [ -f "${RCLONE_CONFIG}" ] && grep -q '^\[copias\]' "${RCLONE_CONFIG}"; then
  echo "Ya existe una configuración de copias en ${RCLONE_CONFIG}." >&2
  echo "NO se sobrescribe: si se generaran contraseñas nuevas, las copias anteriores quedarían ilegibles." >&2
  echo "Si de verdad quieres empezar de cero, mueve ese archivo a otro nombre y vuelve a correr el guion." >&2
  exit 1
fi

read -r -p "Nombre del bucket de Backblaze (por ejemplo balder-copias-xxxx): " BUCKET
read -r -p "keyID de la llave de aplicación: " KEYID
read -r -s -p "applicationKey (no se ve al pegarla): " APPKEY
echo
if [ -z "${BUCKET}" ] || [ -z "${KEYID}" ] || [ -z "${APPKEY}" ]; then
  echo "Faltan datos. No se configuró nada." >&2
  exit 1
fi

echo "== 3/6 Generando las contraseñas de cifrado"
CLAVE1="$(openssl rand -base64 36 | tr -d '\n')"
CLAVE2="$(openssl rand -base64 36 | tr -d '\n')"
OBSCURA1="$(rclone obscure "${CLAVE1}")"
OBSCURA2="$(rclone obscure "${CLAVE2}")"

umask 077
cat > "${RCLONE_CONFIG}" << EOF
[b2]
type = b2
account = ${KEYID}
key = ${APPKEY}

[${REMOTO}]
type = crypt
remote = b2:${BUCKET}/balder
filename_encryption = standard
directory_name_encryption = true
password = ${OBSCURA1}
password2 = ${OBSCURA2}
EOF
chmod 600 "${RCLONE_CONFIG}"

cat << EOF

================================================================
 GUARDA ESTAS DOS CONTRASEÑAS AHORA en una nota segura de tu gestor
 (título sugerido: "Balder - cifrado de copias de seguridad").
 Se muestran UNA sola vez. Sin ellas, las copias no se pueden abrir.

   password : ${CLAVE1}
   password2: ${CLAVE2}

 Además guarda: el nombre del bucket y el keyID. (La applicationKey ya no se vuelve a ver en Backblaze.)
================================================================
EOF
read -r -p "Cuando las hayas guardado escribe GUARDADO para continuar: " RESPUESTA
if [ "${RESPUESTA}" != "GUARDADO" ]; then
  echo "No se continúa. La configuración quedó escrita en ${RCLONE_CONFIG}; si no guardaste las contraseñas, bórralo y empieza de nuevo." >&2
  exit 1
fi
unset CLAVE1 CLAVE2 OBSCURA1 OBSCURA2 APPKEY RESPUESTA

echo "== 4/6 Comprobando la conexión: subir, leer y descifrar un archivo de prueba"
PRUEBA="Prueba de conexión $(date '+%Y-%m-%d %H:%M:%S')"
echo "${PRUEBA}" | rclone rcat "${REMOTO}:prueba/conexion-$(date +%Y%m%d-%H%M%S).txt"
LEIDO="$(rclone cat "${REMOTO}:prueba/$(rclone lsf --files-only "${REMOTO}:prueba" | sort | tail -n1)")"
if [ "${LEIDO}" != "${PRUEBA}" ]; then
  echo "El archivo de prueba no volvió igual. Revisa el bucket y la llave." >&2
  exit 1
fi
echo "   OK: se subió cifrado y se descifró bien."

echo "== 5/6 Instalando los temporizadores (copia diaria y prueba mensual)"
if [ ! -f "${BASE}/copias.env" ]; then
  cat > "${BASE}/copias.env" << 'EOF'
# Avisos opcionales (por ejemplo de healthchecks.io): se llama a la dirección cuando algo sale bien o falla.
# Déjalos vacíos si no los usas. Estas direcciones son semisecretas: no las compartas.
# Copia diaria:
URL_AVISO_OK=""
URL_AVISO_FALLO=""
# Prueba mensual de restauración (otro chequeo distinto):
URL_PRUEBA_OK=""
URL_PRUEBA_FALLO=""
EOF
  chmod 600 "${BASE}/copias.env"
fi
for unidad in balder-respaldo.service balder-respaldo.timer balder-prueba-restauracion.service balder-prueba-restauracion.timer; do
  sudo install -m 644 "${DIR}/${unidad}" "/etc/systemd/system/${unidad}"
done
sudo systemctl daemon-reload
sudo systemctl enable --now balder-respaldo.timer balder-prueba-restauracion.timer
systemctl list-timers 'balder-*' --no-pager

echo "== 6/6 Primera copia completa"
bash "${DIR}/respaldar.sh"

cat << EOF

================================================================
 Listo. Desde esta noche la copia se hace sola a las 2:00 a. m.

 Siguiente paso OBLIGATORIO, en la consola de Backblaze: poner la regla que borra las copias de más de 30 días
 (ver docs/despliegue.md, fase 4). Sin esa regla, las copias se acumularían para siempre.

 Y ahora prueba que la copia sirve:   bash ${DIR}/restaurar.sh probar
================================================================
EOF
