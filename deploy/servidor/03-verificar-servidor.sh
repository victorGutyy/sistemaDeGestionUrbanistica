#!/usr/bin/env bash
# Muestra el estado de seguridad y de recursos del servidor, sin tocar nada.
# No imprime contraseñas, llaves ni datos de clientes: se puede pegar el resultado completo en el chat o en un ticket.
#
#   sudo bash 03-verificar-servidor.sh
set -uo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Usa sudo: sudo bash $0" >&2
  exit 1
fi

titulo() { printf '\n=== %s ===\n' "$1"; }

titulo "Sistema"
. /etc/os-release && echo "${PRETTY_NAME}"
uname -r
timedatectl | grep -E 'Time zone|System clock synchronized'
uptime -p

titulo "Memoria y disco"
free -h | sed -n '1,2p'
df -h / | tail -n 1

titulo "Cortafuegos (ufw)"
ufw status verbose

titulo "Bloqueo de intentos (fail2ban, cárcel sshd)"
fail2ban-client status sshd 2>/dev/null || echo "fail2ban no responde"

titulo "SSH: valores aplicados"
sshd -T | grep -E '^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication|pubkeyauthentication|allowusers|maxauthtries) '

titulo "Puertos que escuchan desde fuera"
ss -tlnH | awk '{print $4}' | grep -vE '^(127\.|\[::1\]|::1)' | sort -u

titulo "Actualizaciones"
echo -n "Pendientes de instalar: "
apt-get -s upgrade 2>/dev/null | grep -c '^Inst' || true
systemctl is-enabled unattended-upgrades 2>/dev/null | sed 's/^/Actualizaciones automáticas: /'
[ -f /var/run/reboot-required ] && echo "REINICIO PENDIENTE (hay actualizaciones que lo piden)" || echo "No hay reinicio pendiente"

titulo "Usuarios con acceso por llave"
for h in /root /home/*; do
  [ -f "$h/.ssh/authorized_keys" ] && echo "$(basename "$h"): $(grep -cE '^(ssh-|ecdsa-)' "$h/.ssh/authorized_keys") llave(s)"
done

titulo "Copias de seguridad (si ya están configuradas)"
if systemctl list-unit-files 'balder-respaldo.timer' --no-legend 2>/dev/null | grep -q balder; then
  systemctl list-timers 'balder-*' --no-pager 2>/dev/null | sed -n '1,4p'
  echo "-- última copia diaria:"
  journalctl -u balder-respaldo -n 2 --no-pager -o cat 2>/dev/null | cut -c1-160
  echo "-- última prueba de restauración:"
  journalctl -u balder-prueba-restauracion -n 1 --no-pager -o cat 2>/dev/null | cut -c1-160
else
  echo "Aún no están configuradas (ver docs/despliegue.md, fase 4)"
fi

titulo "Docker (si ya está instalado)"
command -v docker >/dev/null 2>&1 && docker --version || echo "Docker aún no está instalado"
