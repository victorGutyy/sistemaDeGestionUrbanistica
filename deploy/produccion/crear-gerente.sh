#!/usr/bin/env bash
# Crea el primer usuario con rol GERENTE y siembra la configuración inicial (roles, categorías, medios de pago...).
# No hay registro público en el sistema: esta es la única forma de crear el primer usuario.
#
#   bash /opt/balder/fuente/deploy/produccion/crear-gerente.sh
#
# La contraseña se escribe por pantalla (no se ve), se pasa al contenedor por variable de entorno y NO se guarda en
# ningún archivo. Es seguro repetirlo: no pisa lo que el gerente ya haya editado en la app.
set -euo pipefail

BASE="${BASE:-/opt/balder}"
CARPETA="${BASE}/fuente/deploy/produccion"

if [ ! -f "${BASE}/.env" ] || [ ! -d "${CARPETA}" ]; then
  echo "Primero hay que desplegar el sistema (desplegar.sh)." >&2
  exit 1
fi

read -r -p "Nombre completo del gerente: " NOMBRE
read -r -p "Correo del gerente (con él ingresará): " CORREO
read -r -s -p "Contraseña (mínimo 8 caracteres, no se ve al escribirla): " CLAVE; echo
read -r -s -p "Repite la contraseña: " CLAVE2; echo

if [ "${CLAVE}" != "${CLAVE2}" ]; then
  echo "Las contraseñas no coinciden. No se creó nada." >&2
  exit 1
fi
if [ "${#CLAVE}" -lt 8 ]; then
  echo "La contraseña debe tener al menos 8 caracteres. No se creó nada." >&2
  exit 1
fi
if [ -z "${NOMBRE}" ] || [ -z "${CORREO}" ]; then
  echo "Faltan el nombre o el correo. No se creó nada." >&2
  exit 1
fi

export SEED_ADMIN_NOMBRE="${NOMBRE}" SEED_ADMIN_EMAIL="${CORREO}" SEED_ADMIN_PASSWORD="${CLAVE}"
cd "${CARPETA}"
# Los -e sin valor toman el valor del entorno de esta sesión: así la contraseña no aparece en la lista de procesos.
docker compose --env-file "${BASE}/.env" run --rm \
  -e SEED_ADMIN_NOMBRE -e SEED_ADMIN_EMAIL -e SEED_ADMIN_PASSWORD \
  migrar npm run db:seed

unset SEED_ADMIN_NOMBRE SEED_ADMIN_EMAIL SEED_ADMIN_PASSWORD CLAVE CLAVE2
echo
echo "Listo. Ya puedes ingresar con ese correo en https://$(grep -E '^DOMINIO=' "${BASE}/.env" | cut -d= -f2-)"
