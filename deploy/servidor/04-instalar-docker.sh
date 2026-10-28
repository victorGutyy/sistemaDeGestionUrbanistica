#!/usr/bin/env bash
# Instala Docker Engine desde el repositorio OFICIAL de Docker (no el paquete docker.io de Ubuntu, que va más atrás).
#
# Se ejecuta con el usuario de trabajo:   sudo bash 04-instalar-docker.sh
#
# Qué hace:
#   - Quita los paquetes de Docker que traiga Ubuntu y puedan chocar con el oficial.
#   - Agrega la llave y el repositorio oficiales de Docker, e instala Docker Engine y Docker Compose.
#   - Limita el tamaño de los registros de los contenedores (sin esto, con los meses pueden llenar el disco).
#   - Agrega al usuario de trabajo al grupo docker (así no hace falta sudo para cada comando de Docker).
#   - Comprueba que funciona descargando y corriendo un contenedor de prueba.
set -euo pipefail

USUARIO="${USUARIO:-deploy}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Usa sudo: sudo bash $0" >&2
  exit 1
fi

. /etc/os-release
CODENAME="${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}"
if [ "${ID}" != "ubuntu" ] || [ -z "${CODENAME}" ]; then
  echo "Este guion es para Ubuntu. Sistema detectado: ${PRETTY_NAME}" >&2
  exit 1
fi

echo "== 1/6 Comprobando que Docker publica paquetes para ${PRETTY_NAME} (${CODENAME})"
if ! curl -fsI "https://download.docker.com/linux/ubuntu/dists/${CODENAME}/Release" >/dev/null; then
  echo "Docker todavía no publica paquetes para '${CODENAME}'. No se instala nada." >&2
  echo "Avísame con este mensaje: hay que usar otra versión de Ubuntu o esperar al repositorio." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

echo "== 2/6 Quitando paquetes que podrían chocar con el oficial (si existen)"
for paquete in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do
  apt-get remove -y "${paquete}" >/dev/null 2>&1 || true
done

echo "== 3/6 Agregando el repositorio oficial de Docker"
apt-get update -y
apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
apt-get update -y

echo "== 4/6 Instalando Docker Engine y Docker Compose"
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "== 5/6 Configuración: registros limitados y arranque automático"
install -d -m 755 /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "live-restore": true
}
EOF
systemctl enable docker
systemctl restart docker
usermod -aG docker "${USUARIO}"

echo "== 6/6 Prueba: correr un contenedor de verificación"
docker run --rm hello-world | sed -n '1,4p'

echo
docker --version
docker compose version

cat <<EOF

================================================================
 Docker quedó instalado.

 IMPORTANTE: el grupo docker solo se aplica en una sesión NUEVA. Sal de esta ventana con "exit"
 y vuelve a entrar:   ssh ${USUARIO}@<IP-del-servidor>
 Luego comprueba que funciona sin sudo:   docker ps
================================================================
EOF
