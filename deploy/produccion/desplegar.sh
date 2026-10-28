#!/usr/bin/env bash
# Publica o actualiza el sistema en el servidor a partir de un paquete con el código (balder-fuente.tar.gz).
#
#   bash desplegar.sh ~/balder-fuente.tar.gz
#
# Sirve para la primera instalación y para cada actualización:
#   - La primera vez crea /opt/balder y el archivo .env con contraseñas generadas AL AZAR en el propio servidor
#     (nunca se muestran, nunca viajan por ningún chat ni se suben a Git).
#   - Reemplaza el código por el del paquete, dejando el anterior en /opt/balder/fuente.anterior por si hay que volver atrás.
#   - Construye las imágenes, aplica las migraciones de la base y arranca todo.
#   - Comprueba que el sistema responde por HTTPS antes de decir que terminó.
# Los datos (base de datos, adjuntos, certificados) viven en volúmenes de Docker: una actualización NO los toca.
set -euo pipefail

PAQUETE="${1:?Uso: bash desplegar.sh <ruta-al-paquete.tar.gz>}"
BASE="${BASE:-/opt/balder}"

if [ ! -f "${PAQUETE}" ]; then
  echo "No encuentro el paquete: ${PAQUETE}" >&2
  exit 1
fi
if ! docker ps >/dev/null 2>&1; then
  echo "Docker no responde para este usuario. ¿Cerraste la sesión y volviste a entrar después de instalarlo?" >&2
  exit 1
fi

echo "== 1/6 Carpeta de trabajo: ${BASE}"
if [ ! -d "${BASE}" ]; then
  sudo mkdir -p "${BASE}"
  sudo chown "$(id -un):$(id -gn)" "${BASE}"
fi

echo "== 2/6 Desempaquetando el código"
rm -rf "${BASE}/fuente.nueva"
mkdir -p "${BASE}/fuente.nueva"
tar -xzf "${PAQUETE}" -C "${BASE}/fuente.nueva"
for obligatorio in backend/Dockerfile deploy/produccion/docker-compose.yml deploy/produccion/.env.example; do
  if [ ! -f "${BASE}/fuente.nueva/${obligatorio}" ]; then
    echo "El paquete no trae ${obligatorio}. Hay que armarlo de nuevo (ver docs/despliegue.md)." >&2
    rm -rf "${BASE}/fuente.nueva"
    exit 1
  fi
done

echo "== 3/6 Archivo de secretos (.env)"
if [ ! -f "${BASE}/.env" ]; then
  cp "${BASE}/fuente.nueva/deploy/produccion/.env.example" "${BASE}/.env"
  sed -i "s/__SE_GENERA_SOLA__/$(openssl rand -hex 24)/" "${BASE}/.env"
  sed -i "s/__SE_GENERA_SOLO__/$(openssl rand -hex 48)/" "${BASE}/.env"
  chmod 600 "${BASE}/.env"
  echo "   Creado con contraseñas nuevas. Para activar el correo de avisos edítalo después:  nano ${BASE}/.env"
else
  echo "   Ya existe: no se toca."
fi

echo "== 4/6 Cambiando el código (el anterior queda en fuente.anterior)"
rm -rf "${BASE}/fuente.anterior"
if [ -d "${BASE}/fuente" ]; then
  mv "${BASE}/fuente" "${BASE}/fuente.anterior"
fi
mv "${BASE}/fuente.nueva" "${BASE}/fuente"

echo "== 5/6 Construyendo y arrancando (la primera vez tarda varios minutos)"
cd "${BASE}/fuente/deploy/produccion"
docker compose --env-file "${BASE}/.env" up -d --build

echo "== 6/6 Comprobando que responde"
DOMINIO="$(grep -E '^DOMINIO=' "${BASE}/.env" | cut -d= -f2-)"
for intento in $(seq 1 30); do
  if curl -fsS "https://${DOMINIO}/api/salud" >/dev/null 2>&1; then
    echo "   OK: https://${DOMINIO}/api/salud responde."
    docker compose --env-file "${BASE}/.env" ps
    docker image prune -f >/dev/null
    echo
    echo "Listo. Si es la primera vez, falta crear al gerente:  bash ${BASE}/fuente/deploy/produccion/crear-gerente.sh"
    exit 0
  fi
  sleep 4
done

echo "   NO responde todavía. Estado de los contenedores y últimos registros:" >&2
docker compose --env-file "${BASE}/.env" ps >&2
docker compose --env-file "${BASE}/.env" logs --tail 30 api proxy >&2
echo >&2
echo "Para volver al código anterior:  mv ${BASE}/fuente ${BASE}/fuente.fallida && mv ${BASE}/fuente.anterior ${BASE}/fuente && cd ${BASE}/fuente/deploy/produccion && docker compose --env-file ${BASE}/.env up -d --build" >&2
exit 1
