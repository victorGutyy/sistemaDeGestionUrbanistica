#!/usr/bin/env bash
# PASO 1 de 2 — Prepara un servidor Ubuntu recién creado (Hostinger VPS).
#
# Qué hace:
#   - Actualiza el sistema e instala lo mínimo de seguridad (cortafuegos, bloqueo de intentos, actualizaciones automáticas).
#   - Crea un usuario sin privilegios de root para trabajar a diario y le copia tu llave SSH.
#   - Deja el cortafuegos con solo tres puertos abiertos: 22 (acceso), 80 y 443 (web).
#   - NO cierra todavía el acceso como root ni por contraseña (eso lo hace el paso 2, después de que compruebes
#     que el usuario nuevo entra bien). Así no hay forma de quedarte fuera del servidor.
#
# Se ejecuta como root, una sola vez (se puede repetir sin problema). Nada de lo que escribe es secreto:
# las contraseñas se piden por pantalla y no se guardan en ningún archivo.
set -euo pipefail

USUARIO="${USUARIO:-deploy}"
ZONA_HORARIA="${ZONA_HORARIA:-America/Bogota}"
PUERTO_SSH="${PUERTO_SSH:-22}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Ejecuta este guion como root: sudo bash $0" >&2
  exit 1
fi

echo "== 1/8 Comprobando que existe tu llave SSH en root"
if ! grep -qE '^(ssh-ed25519|ssh-rsa|ecdsa-sha2-[a-z0-9]+) ' /root/.ssh/authorized_keys 2>/dev/null; then
  echo "No encuentro ninguna llave SSH en /root/.ssh/authorized_keys." >&2
  echo "Sin ella el usuario nuevo no podría entrar. Agrégala desde el panel de Hostinger y vuelve a correr el guion." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

echo "== 2/8 Actualizando el sistema (puede tardar unos minutos)"
apt-get update -y
apt-get upgrade -y
apt-get install -y ufw fail2ban unattended-upgrades curl ca-certificates gnupg

echo "== 3/8 Zona horaria: ${ZONA_HORARIA}"
timedatectl set-timezone "${ZONA_HORARIA}"

echo "== 4/8 Usuario de trabajo: ${USUARIO}"
if ! id "${USUARIO}" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "${USUARIO}"
fi
usermod -aG sudo "${USUARIO}"
install -d -m 700 -o "${USUARIO}" -g "${USUARIO}" "/home/${USUARIO}/.ssh"
install -m 600 -o "${USUARIO}" -g "${USUARIO}" /root/.ssh/authorized_keys "/home/${USUARIO}/.ssh/authorized_keys"

# El usuario entra con la llave, pero sudo le pide una contraseña: se define aquí, por pantalla.
if passwd -S "${USUARIO}" | awk '{print $2}' | grep -qE '^(L|NP)$'; then
  echo
  echo "Elige la contraseña de ${USUARIO}. Sirve solo para usar sudo (no para entrar al servidor)."
  echo "Hazla larga y guárdala en tu gestor de contraseñas. Mientras la escribes no se ve nada."
  passwd "${USUARIO}"
fi

echo "== 5/8 Cortafuegos (ufw): solo 22, 80 y 443"
ufw default deny incoming
ufw default allow outgoing
ufw allow "${PUERTO_SSH}/tcp" comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable

echo "== 6/8 Bloqueo automático de quien insista en adivinar claves (fail2ban)"
cat > /etc/fail2ban/jail.d/balder.local <<EOF
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
port    = ${PUERTO_SSH}
backend = systemd
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban

echo "== 7/8 Actualizaciones de seguridad automáticas"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
cat > /etc/apt/apt.conf.d/52balder-unattended <<'EOF'
// El servidor NO se reinicia solo: los reinicios los decide una persona (ver docs/despliegue.md).
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF
systemctl enable --now unattended-upgrades

echo "== 8/8 Ajustes básicos de red"
cat > /etc/sysctl.d/99-balder.conf <<'EOF'
net.ipv4.tcp_syncookies = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
EOF
sysctl --system >/dev/null

cat <<EOF

================================================================
 LISTO el paso 1. Todavía NO cierres esta ventana.

 Ahora, desde OTRA ventana de PowerShell en tu computador, entra con el usuario nuevo:

     ssh ${USUARIO}@<IP-del-servidor>

 Te pide la frase de paso de tu llave. Ya adentro, comprueba que sudo funciona:

     sudo whoami        (debe responder: root)

 Cuando eso funcione, copia el guion del paso 2 y ejecútalo ahí mismo, con el usuario nuevo
 (las instrucciones están en docs/despliegue.md).
================================================================
EOF
