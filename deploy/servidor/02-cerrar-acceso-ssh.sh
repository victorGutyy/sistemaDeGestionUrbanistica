#!/usr/bin/env bash
# PASO 2 de 2 — Cierra la puerta de atrás: nadie entra como root ni con contraseña, solo con tu llave SSH.
#
# Requisitos (el guion los comprueba):
#   - Ya corriste el paso 1.
#   - Estás conectado como el usuario de trabajo (deploy), NO como root, y usas: sudo bash 02-cerrar-acceso-ssh.sh
#
# Para no quedarte fuera del servidor:
#   - Valida la configuración antes de aplicarla.
#   - Se aplica con "reload", que no corta las sesiones que ya están abiertas.
#   - Después TÚ compruebas desde otra ventana que sigues entrando, antes de cerrar la actual.
set -euo pipefail

USUARIO="${USUARIO:-deploy}"
ARCHIVO="/etc/ssh/sshd_config.d/00-balder.conf"

if [ "$(id -u)" -ne 0 ]; then
  echo "Usa sudo: sudo bash $0" >&2
  exit 1
fi
if [ "${SUDO_USER:-}" != "${USUARIO}" ]; then
  echo "Este guion debe correrse con sudo desde una sesión del usuario '${USUARIO}' (no como root)." >&2
  echo "Así te aseguras de que el usuario nuevo SÍ puede entrar antes de cerrar el acceso de root." >&2
  exit 1
fi
if ! grep -qE '^(ssh-ed25519|ssh-rsa|ecdsa-sha2-[a-z0-9]+) ' "/home/${USUARIO}/.ssh/authorized_keys" 2>/dev/null; then
  echo "El usuario ${USUARIO} no tiene llave SSH. No se puede cerrar el acceso. Vuelve al paso 1." >&2
  exit 1
fi

echo "== Escribiendo la configuración segura de SSH en ${ARCHIVO}"
# El nombre empieza con 00 a propósito: SSH usa el PRIMER valor que encuentra, y otros archivos
# (por ejemplo los del proveedor) podrían activar la contraseña si se leyeran antes.
cat > "${ARCHIVO}" <<EOF
# Configuración de SSH del proyecto (generada por 02-cerrar-acceso-ssh.sh)
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AuthenticationMethods publickey
AllowUsers ${USUARIO}
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
ClientAliveInterval 300
ClientAliveCountMax 2
EOF
chmod 644 "${ARCHIVO}"

echo "== Validando la configuración"
if ! sshd -t; then
  echo "La configuración tiene errores. La deshago y no cambio nada." >&2
  rm -f "${ARCHIVO}"
  exit 1
fi

echo "== Valores que SSH aplicará de verdad:"
sshd -T | grep -E '^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication|pubkeyauthentication|allowusers) '

systemctl reload ssh

cat <<EOF

================================================================
 Aplicado. NO cierres esta ventana todavía.

 Desde OTRA ventana de PowerShell comprueba dos cosas:

   1) Que el usuario nuevo SIGUE entrando:        ssh ${USUARIO}@<IP-del-servidor>
   2) Que root YA NO puede entrar (debe fallar):  ssh root@<IP-del-servidor>
      (verás: "Permission denied (publickey)")

 Si la comprobación 1 falla, vuelve atrás desde ESTA ventana con:

   sudo rm ${ARCHIVO} && sudo systemctl reload ssh

 Si te quedas sin acceso, el panel de Hostinger tiene una consola en el navegador para el servidor.
================================================================
EOF
