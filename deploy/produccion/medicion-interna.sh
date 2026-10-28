#!/bin/sh
# Lo que corre DENTRO del contenedor "migrar" durante la medición de rendimiento (lo lanza medir-rendimiento.sh).
# No usar a mano. Nunca toca la base de producción: trabaja en una base aparte (<nombre>_volumen) que crea y reinicia solo.
set -e

echo "== 1/4 Cargando la base de volumen: 10 proyectos, 1.000 lotes, 400 clientes, 800 ventas y unos 5.000 abonos"
echo "   (datos inventados, cargados con los servicios reales; puede tardar de 5 a 15 minutos)"
npm run demo:volumen -- --reiniciar

echo "== 2/4 Arrancando una API aparte sobre esa base (puerto 3002, solo dentro de este contenedor)"
npm run demo:api -- volumen > /tmp/api-volumen.log 2>&1 &
API=$!
LISTA=0
for intento in $(seq 1 60); do
  if node -e "fetch('http://127.0.0.1:3002/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    LISTA=1
    break
  fi
  sleep 2
done
if [ "$LISTA" != "1" ]; then
  echo "La API de volumen no arrancó. Últimas líneas de su registro:"
  tail -n 30 /tmp/api-volumen.log
  exit 1
fi

echo "== 3/4 Midiendo (RNF-REN-01 a 04)"
npm run demo:medir -- --url http://127.0.0.1:3002

echo "== 4/4 Listo. El detalle quedó en /opt/balder/medicion/volumen/medicion.json"
kill "$API" 2>/dev/null || true
