# Guía de despliegue

Cómo se publica el Sistema de gestión de urbanismo en un servidor propio (VPS de Hostinger) y cómo se mantiene. Está escrita para poder repetirse paso a paso, incluso por otra persona. Cada fase indica quién la ejecuta y cómo comprobar que quedó bien.

> **Reglas que no se rompen:** ninguna contraseña, llave privada ni clave de correo entra a este repositorio ni se pega en un chat. Las claves viven en el gestor de contraseñas de la persona responsable y, en el servidor, en archivos `.env` que nunca se suben a Git (`CLAUDE.md`, reglas de trabajo).

## Estado actual

| Fase | Qué | Estado |
|---|---|---|
| 0 | Dominio, servidor y DNS | **Hecho** (27/10/2026) |
| 1 | Proteger el servidor | **Hecho y comprobado** (27/10/2026): `deploy` entra con llave; `root` y la contraseña quedaron cerrados |
| 2 | Docker y prueba de HTTPS | **Hecho y comprobado** (27/10/2026): Docker instalado; certificado de Let's Encrypt obtenido y página de prueba con candado |
| 3 | Empaquetar y arrancar el sistema | **Hecho y en producción** (27/10/2026): `https://sistema.balderingenieria.com` responde, el gerente ingresa y la base está vacía |
| 4 | Copias de seguridad diarias y prueba de restauración | **Escrita y probada en local; falta configurarla en el servidor** (cuenta de Backblaze B2, ver 4.1) |
| 5 | Primer arranque: gerente, correo, datos y medición de rendimiento | Por escribir |

## Lo que ya existe (fase 0)

| Elemento | Valor |
|---|---|
| Dominio | `balderingenieria.com` (Hostinger, 36 meses, vence el 27/10/2029) |
| Plataforma administrativa | `sistema.balderingenieria.com` (registro DNS tipo A) |
| Página pública (a futuro) | `balderingenieria.com` y `www.` (hoy muestran la página de "en construcción" de Hostinger) |
| Servidor | VPS KVM 2 (2 vCPU, 8 GB, 100 GB) con Ubuntu 26.04 LTS |
| Dirección IP | `179.197.85.236` |
| Acceso | SSH con llave (`ed25519`) y frase de paso; sin Monarx ni administrador de Docker de Hostinger |

La IP y el nombre del servidor no son secretos (cualquiera puede consultar el DNS). Lo secreto es la llave privada, su frase de paso y la contraseña de `root`.

## Fase 1. Proteger el servidor

Se hace en **dos pasos** para que sea imposible quedarse fuera: primero se crea un usuario de trabajo y se comprueba que entra; solo después se cierra el acceso de `root` y por contraseña.

Los guiones están en [`deploy/servidor/`](../deploy/servidor/). Se ejecutan desde la raíz del proyecto en el computador de la persona responsable, con PowerShell.

### 1.1 Copiar el guion del paso 1 al servidor

```bash
cd "C:\proyectos de IA\sistema urbanismo"
```

```bash
scp deploy/servidor/01-preparar-servidor.sh root@179.197.85.236:/root/
```

Pide la frase de paso de la llave SSH.

### 1.2 Ejecutarlo en el servidor

```bash
ssh root@179.197.85.236
```

Ya dentro del servidor (el símbolo es `#`):

```bash
sed -i 's/\r$//' /root/01-preparar-servidor.sh
bash /root/01-preparar-servidor.sh
```

(El `sed` solo quita finales de línea de Windows por si hicieran falta; no daña nada.)

El guion, en unos minutos:

1. Comprueba que `root` tiene tu llave SSH (si no, se detiene: no podrías entrar después).
2. Actualiza el sistema e instala `ufw` (cortafuegos), `fail2ban` (bloqueo de intentos) y `unattended-upgrades` (actualizaciones de seguridad automáticas).
3. Pone la zona horaria `America/Bogota`.
4. Crea el usuario `deploy`, le copia tu llave y te pide por pantalla su contraseña, que sirve **solo para `sudo`**. Guárdala en tu gestor.
5. Deja el cortafuegos con solo los puertos 22, 80 y 443.
6. Configura el bloqueo automático de quien insista en adivinar claves (5 intentos en 10 minutos = 1 hora bloqueado).
7. Activa las actualizaciones de seguridad automáticas, **sin reiniciar solo** (los reinicios los decide una persona).
8. Aplica unos ajustes básicos de red.

**No cierres esa ventana todavía.**

### 1.3 Comprobar que el usuario nuevo entra

Abre **otra** ventana de PowerShell:

```bash
ssh deploy@179.197.85.236
```

Pide la frase de paso de tu llave. Ya dentro:

```bash
sudo whoami
```

Debe responder `root` (te pide la contraseña de `deploy`). Si esto no funciona, **no sigas**: cuéntalo antes de ir al paso 2. Mientras tanto la sesión de `root` sigue abierta y nada se ha cerrado.

### 1.4 Copiar y ejecutar el paso 2

Desde la ventana de PowerShell **de tu computador** (no la del servidor):

```bash
scp deploy/servidor/02-cerrar-acceso-ssh.sh deploy/servidor/03-verificar-servidor.sh deploy@179.197.85.236:~/
```

En la ventana donde estás conectado como `deploy`:

```bash
sed -i 's/\r$//' ~/02-cerrar-acceso-ssh.sh ~/03-verificar-servidor.sh
sudo bash ~/02-cerrar-acceso-ssh.sh
```

El guion escribe la configuración segura de SSH, la valida antes de aplicarla, muestra los valores que quedan vigentes y la recarga **sin cortar las sesiones abiertas**. Queda así:

| Antes | Después |
|---|---|
| `root` puede entrar | `root` no puede entrar |
| Se puede entrar con contraseña | Solo con la llave SSH |
| Cualquier usuario | Solo `deploy` |
| 6 intentos por conexión | 3 intentos y 30 segundos para identificarse |

### 1.5 Comprobar desde otra ventana (importante)

En una ventana **nueva** de PowerShell, las dos pruebas:

```bash
ssh deploy@179.197.85.236
```

Debe entrar (con la frase de paso).

```bash
ssh root@179.197.85.236
```

Debe **fallar** con `Permission denied (publickey)`. Eso es lo correcto.

Si la primera falla, desde la ventana donde sigues conectado deshaz el cambio:

```bash
sudo rm /etc/ssh/sshd_config.d/00-balder.conf && sudo systemctl reload ssh
```

Si aun así te quedas sin acceso, el panel de Hostinger tiene una consola en el navegador para el servidor.

### 1.6 Verificar el resultado

```bash
sudo bash ~/03-verificar-servidor.sh
```

Muestra el estado del cortafuegos, de `fail2ban`, de SSH, los puertos abiertos, las actualizaciones y los recursos. No imprime secretos, así que se puede pegar completo para revisarlo.

### Qué NO hay que hacer

- No abrir más puertos "para probar". Cada puerto abierto es una puerta.
- No instalar paneles de control (cPanel, Webmin, etc.).
- No reutilizar la contraseña de `deploy` en ningún otro sitio.
- No subir al repositorio ningún archivo `.env` ni llave.

### Notas para el futuro

- **Cortafuegos del panel de Hostinger.** El VPS tiene además un cortafuegos en el panel. Si se activa, debe permitir los mismos tres puertos (22, 80 y 443); si no, el sitio no abre aunque `ufw` esté bien.
- **Docker y `ufw`.** Docker modifica el cortafuegos por su cuenta y puede dejar visible un puerto aunque `ufw` lo bloquee. Por eso la base de datos **nunca** se publica hacia afuera: solo se comunica por la red interna de Docker (fase 3).
- **Reinicios.** Las actualizaciones de seguridad se instalan solas, pero algunas (del kernel) piden reiniciar. `03-verificar-servidor.sh` lo avisa. Se reinicia en una hora tranquila con `sudo reboot`; el sistema vuelve solo.
- **Renovaciones.** Servidor: unos 27/10/2028 (el precio sube: decidir con tiempo). Dominio: 27/10/2029. Poner recordatorios dos meses antes.

## Fase 2. Docker y prueba de HTTPS

Objetivo: dejar instalado Docker y comprobar, con una página de prueba, que el nombre `sistema.balderingenieria.com` llega al servidor y que se obtiene el certificado HTTPS. Así, cuando se monte el sistema, ya se sabe que la base (DNS, puertos, certificado) funciona.

Desde ahora se entra siempre como `deploy`, con la llave (el acceso de `root` está cerrado).

### 2.1 Copiar los archivos al servidor

Desde PowerShell, en la raíz del proyecto:

```bash
cd "C:\proyectos de IA\sistema urbanismo"
```

```bash
scp deploy/servidor/04-instalar-docker.sh deploy@179.197.85.236:~/
```

```bash
scp -r deploy/pruebas/https deploy@179.197.85.236:~/prueba-https
```

### 2.2 Instalar Docker

```bash
ssh deploy@179.197.85.236
```

Ya dentro del servidor:

```bash
sed -i 's/\r$//' ~/04-instalar-docker.sh
sudo bash ~/04-instalar-docker.sh
```

El guion comprueba primero que Docker publique paquetes para esta versión de Ubuntu (si no, se detiene sin instalar nada), agrega el repositorio oficial, instala Docker Engine y Docker Compose, limita el tamaño de los registros de los contenedores y corre un contenedor de verificación (`hello-world`).

Al terminar, **cierra la sesión y vuelve a entrar** para que el grupo `docker` se aplique:

```bash
exit
```

```bash
ssh deploy@179.197.85.236
```

```bash
docker ps
```

Debe responder una tabla vacía (sin error de permisos).

### 2.3 Levantar la página de prueba con HTTPS

```bash
cd ~/prueba-https
sed -i 's/\r$//' Caddyfile docker-compose.yml
docker compose up -d
```

Docker descarga Caddy (el servidor web) y lo deja corriendo. Para ver que consiguió el certificado:

```bash
docker compose logs caddy
```

Busca líneas que digan `certificate obtained successfully`. Si dicen `error`, revisa: que `nslookup sistema.balderingenieria.com` devuelva la IP del servidor, que el cortafuegos del panel de Hostinger (si está activo) permita los puertos 80 y 443, y que no pasen más de unos minutos entre intentos (Let's Encrypt limita los reintentos).

### 2.4 Comprobar en el navegador

Abre `https://sistema.balderingenieria.com`. Debe mostrar la página **"Servidor listo"** con el **candado** de conexión segura.

### 2.5 Apagar la prueba

La prueba es desechable. Cuando el candado aparezca:

```bash
cd ~/prueba-https
docker compose down
```

## Fase 3. Empaquetar y arrancar el sistema

El sistema corre en cuatro contenedores que hablan por una red interna de Docker:

| Contenedor | Qué hace | ¿Expuesto a internet? |
|---|---|---|
| `proxy` | Caddy: sirve las pantallas, reenvía `/api/*` a la API, consigue y renueva el certificado HTTPS | **Sí** (80 y 443) |
| `api` | La API de NestJS, con las tareas programadas (recordatorios de las 8:00) | No |
| `db` | PostgreSQL 16, con sus datos en un volumen | No |
| `migrar` | Aplica las migraciones de la base al arrancar y se apaga; la API no arranca sin que termine bien | No |

Los datos (base de datos, adjuntos, certificados) viven en **volúmenes de Docker**: actualizar el sistema no los toca.

**Esta fase ya se probó en un computador** antes de tocar el servidor: las imágenes se construyen, las 24 migraciones se aplican, la API queda sana, HTTPS y la redirección de HTTP funcionan, las pantallas cargan (también al recargar rutas como `/ventas`), las rutas piden sesión, se inicia sesión con el gerente sembrado, se genera un PDF y no hay errores en los registros.

Los archivos están en [`deploy/produccion/`](../deploy/produccion/) y en [`backend/Dockerfile`](../backend/Dockerfile).

### 3.0 Requisito: todo lo que se va a publicar debe estar en un commit

El paquete se arma con `git archive HEAD`, que solo incluye lo que ya está confirmado en Git. Antes de empaquetar, revisa en PowerShell que no queden cambios pendientes en `backend`, `frontend` y `deploy`:

```bash
cd "C:\proyectos de IA\sistema urbanismo"
```

```bash
git status --short backend frontend deploy
```

No debe mostrar nada (ignora `backend/package-lock.json` si solo es el aviso de saltos de línea).

### 3.1 Armar el paquete (en tu computador)

```bash
git archive --format=tar.gz --output=balder-fuente.tar.gz HEAD backend frontend deploy
```

Crea `balder-fuente.tar.gz` en la raíz del proyecto (Git lo ignora). Contiene el código, sin contraseñas ni datos.

### 3.2 Copiarlo al servidor

```bash
scp balder-fuente.tar.gz deploy@179.197.85.236:~/
```

### 3.3 Desplegar (en el servidor)

```bash
ssh deploy@179.197.85.236
```

Ya dentro:

```bash
tar -xzf ~/balder-fuente.tar.gz deploy/produccion/desplegar.sh deploy/produccion/crear-gerente.sh
sed -i 's/
$//' ~/deploy/produccion/desplegar.sh ~/deploy/produccion/crear-gerente.sh
bash ~/deploy/produccion/desplegar.sh ~/balder-fuente.tar.gz
```

La **primera vez tarda entre 5 y 15 minutos** (descarga y compila todo). El guion:

1. Crea `/opt/balder` y el archivo `.env` con contraseñas generadas **al azar en el servidor**. Nadie las ve: no se muestran ni viajan por ningún chat.
2. Reemplaza el código por el del paquete, dejando el anterior en `fuente.anterior`.
3. Construye las imágenes, aplica las migraciones y arranca todo.
4. Comprueba por HTTPS que `https://sistema.balderingenieria.com/api/salud` responde. Si no responde, te muestra el estado y los últimos registros, y cómo volver al código anterior.

### 3.4 Crear al gerente

```bash
bash /opt/balder/fuente/deploy/produccion/crear-gerente.sh
```

Pide nombre, correo y contraseña (no se ve al escribirla). No hay registro público en el sistema: esta es la única forma de crear el primer usuario. Crea también la configuración inicial (roles, categorías, medios de pago). Es seguro repetirlo.

### 3.5 Entrar al sistema

Abre `https://sistema.balderingenieria.com` e ingresa con ese correo y contraseña.

### 3.6 Activar el correo de avisos (después)

Los avisos a los clientes salen por la cuenta de Gmail del proyecto con su **contraseña de aplicación**. Esa clave se escribe **solo en el servidor**, nunca en un chat:

```bash
nano /opt/balder/.env
```

Completa `SMTP_USER`, `SMTP_PASS` y `SMTP_FROM`. Guarda con `Ctrl + O`, Enter, y sal con `Ctrl + X`. Para que la API tome los valores:

```bash
cd /opt/balder/fuente/deploy/produccion && docker compose --env-file /opt/balder/.env up -d api
```

Luego, en **Configuración → Correo de avisos → Enviar correo de prueba**, comprueba que llega.

### Cómo se actualiza el sistema después

1. En tu computador: `git archive ...` (paso 3.1) y `scp` (3.2).
2. En el servidor: `bash /opt/balder/fuente/deploy/produccion/desplegar.sh ~/balder-fuente.tar.gz`.

El guion no toca el `.env` ni los datos.

### Comandos útiles en el servidor

Todos se escriben dentro de la carpeta de la aplicación:

```bash
cd /opt/balder/fuente/deploy/produccion
```

| Qué | Comando |
|---|---|
| Ver si todo está sano | `docker compose --env-file /opt/balder/.env ps` |
| Ver los registros de la API en vivo | `docker compose --env-file /opt/balder/.env logs -f api` |
| Reiniciar solo la API | `docker compose --env-file /opt/balder/.env restart api` |
| Ver los registros del servidor web | `docker compose --env-file /opt/balder/.env logs --tail 50 proxy` |

> **Nunca uses `docker compose down -v` en el servidor.** El `-v` borra los volúmenes: la base de datos y los adjuntos desaparecerían. Para apagar sin riesgo: `docker compose --env-file /opt/balder/.env down` (sin `-v`).

### Qué NO hacer todavía

- **No cargues datos reales** (el Excel de la empresa) hasta terminar la fase 4. Sin copias de seguridad diarias fuera del servidor, un daño en el servidor perdería todo.
- No abras otros puertos ni publiques la base de datos.

## Fase 4. Copias de seguridad

Requisito RNF-DIS-02: copia automática **diaria** de la base de datos y de los adjuntos, conservada **al menos 30 días**, con **prueba de restauración**. Se guardan **fuera del servidor**, en Backblaze B2, y **cifradas antes de salir**: en Backblaze solo hay datos ilegibles (los datos de los clientes están protegidos por la Ley 1581 de 2012).

| Qué | Cómo |
|---|---|
| Cuándo | Cada noche a las 2:00 a. m. (hora de Bogotá), con un temporizador del sistema (systemd) |
| Qué se copia | La base de datos completa, los adjuntos (`uploads`) y el archivo de secretos (`.env`) |
| Cifrado | `rclone crypt`: contenido y nombres de archivo cifrados con **dos contraseñas** que se generan al configurar y que se guardan en el gestor de contraseñas |
| Verificación | Antes de subir se comprueba que cada archivo se pueda leer entero; después se compara su tamaño en la nube con el local |
| Retención | En el servidor, 3 días (restauración rápida). En la nube, 30 días: la regla de ciclo de vida de Backblaze borra lo más viejo. Estos guiones nunca borran nada en la nube |
| Prueba | Cada día 1 del mes, 3:30 a. m., se restaura la última copia en una base temporal, se compara con la real y se borra |

Los guiones están en [`deploy/produccion/respaldos/`](../deploy/produccion/respaldos/). **Se probaron en un computador** con el sistema completo en Docker y un destino cifrado local: la copia se hace y se verifica, la nube solo ve archivos ilegibles, la prueba de restauración funciona, y la restauración real devolvió una base alterada y un adjunto vaciado a su estado original. También se probó que un fallo de subida termina con error y dispara el aviso (esa prueba encontró y corrigió un defecto: el aviso no se ejecutaba si el fallo ocurría dentro de una función).

### 4.1 Crear la cuenta y el bucket en Backblaze (en el navegador, por la persona responsable)

1. Crea una cuenta en Backblaze (producto **B2 Cloud Storage**) con el correo del proyecto y activa la **verificación en dos pasos**. Guarda los códigos de recuperación en el gestor.
2. Si Backblaze pide una tarjeta, es solo por si algún día se superan los 10 GB gratis. En **Caps & Alerts** pon un tope de gasto bajo para evitar sorpresas.
3. **Buckets → Create a Bucket**:
   - Nombre: `balder-copias-` seguido de letras y números al azar (debe ser único en todo Backblaze).
   - Archivos: **Private**.
   - Cifrado de Backblaze (SSE-B2): déjalo activado (es adicional; el cifrado fuerte ya lo hace `rclone`).
   - **Object Lock** (bloqueo de objetos): actívalo si la consola lo ofrece al crear el bucket, y define una retención por defecto de **30 días**. Así, aunque alguien robara el servidor y la llave de aplicación, no podría borrar las copias recientes. Si no aparece o no queda claro, sigue sin él y anota la limitación.
4. En el bucket, **Lifecycle Settings → custom**: deja el prefijo vacío, **Days Till Hide = 31** y **Days Till Delete = 1**. Es la regla que borra lo de más de 30 días; sin ella las copias se acumulan para siempre.
5. **Application Keys → Add a New Application Key**:
   - Nombre: `balder-servidor`.
   - Acceso: **solo a ese bucket**.
   - Tipo: **Read and Write**.
   - Al crearla, Backblaze muestra el **keyID** y la **applicationKey UNA sola vez**: cópialos a una nota segura del gestor. La applicationKey se escribirá solo en el servidor, nunca en un chat.

### 4.2 Subir los guiones al servidor

Los guiones nuevos viajan en el paquete de código, como en la fase 3. Con todo confirmado en Git, en PowerShell, en la raíz del proyecto:

```bash
git archive --format=tar.gz --output=balder-fuente.tar.gz HEAD backend frontend deploy
```

```bash
scp balder-fuente.tar.gz deploy@179.197.85.236:~/
```

En el servidor:

```bash
bash /opt/balder/fuente/deploy/produccion/desplegar.sh ~/balder-fuente.tar.gz
```

(Actualiza el código; no toca el `.env` ni los datos.)

### 4.3 Configurar las copias (en el servidor, una sola vez)

```bash
bash /opt/balder/fuente/deploy/produccion/respaldos/configurar-copias.sh
```

El guion pide el nombre del bucket, el keyID y la applicationKey (no se ve al pegarla). Después:

1. Instala `rclone`.
2. Genera **dos contraseñas de cifrado al azar y te las muestra una sola vez**. **Guárdalas en una nota segura del gestor** ("Balder - cifrado de copias") y escribe `GUARDADO`. Sin esas dos contraseñas, nadie, ni siquiera tú, puede abrir las copias.
3. Prueba subir, leer y descifrar un archivo.
4. Instala los dos temporizadores (copia diaria y prueba mensual).
5. Hace la **primera copia completa**.

Si ya existe una configuración, el guion se niega a sobrescribirla: generar contraseñas nuevas dejaría ilegibles las copias anteriores.

### 4.4 Probar que la copia sirve (obligatorio antes de cargar datos reales)

```bash
bash /opt/balder/fuente/deploy/produccion/respaldos/restaurar.sh probar
```

Descarga la última copia, la descifra, la restaura en una base temporal (`restauracion_prueba`), muestra una tabla con las filas de la copia contra las de producción, y borra la base temporal. Debe terminar con **`PRUEBA OK`**. No toca nada de producción.

### 4.5 Comprobar el estado cuando quieras

```bash
bash /opt/balder/fuente/deploy/produccion/respaldos/restaurar.sh listar
```

Muestra las copias que hay en la nube (tamaño y nombre). El informe `03-verificar-servidor.sh` también muestra la hora de la próxima copia, el resultado de la última y el de la última prueba.

### 4.6 Avisos (recomendado)

Si una copia falla una noche y nadie lo ve, se descubre cuando ya hace falta. Para recibir un aviso, crea un chequeo gratuito en [healthchecks.io](https://healthchecks.io) (o un servicio equivalente), pon sus dos direcciones (la de "OK" y la de "fallo") en `/opt/balder/copias.env`, y configúralo para que avise por correo si no llega el "OK" a tiempo. El guion llama a una u otra al terminar. Sin avisos, alguien debe mirar `03-verificar-servidor.sh` cada semana.

### Si el servidor se pierde (recuperación total)

1. Ten a mano, del gestor de contraseñas: las **dos contraseñas de cifrado**, el **nombre del bucket**, el **keyID** y la **applicationKey** (si se perdió, se crea otra en Backblaze).
2. Crea un servidor nuevo y repite las fases 1 y 2 (protegerlo e instalar Docker).
3. En el servidor nuevo: `sudo apt-get install -y rclone`, y crea `/opt/balder/rclone.conf` (permisos 600) con las mismas secciones `[b2]` y `[copias]` que se muestran al configurar (las contraseñas se ofuscan con `rclone obscure`).
4. Recupera el archivo de secretos: `rclone copyto copias:env/env-<el más reciente> /opt/balder/.env && chmod 600 /opt/balder/.env` (`rclone lsf copias:env` lista los disponibles).
5. Despliega (`desplegar.sh`, fase 3). Como ya existe el `.env`, no se generan contraseñas nuevas.
6. Trae los datos: `bash /opt/balder/fuente/deploy/produccion/respaldos/restaurar.sh real`. Pide escribir `RESTAURAR` y trae la última copia (o una anterior: `restaurar.sh real 20261101-020000`).
7. Apunta el DNS al servidor nuevo si cambió la IP, y comprueba entrando con un usuario conocido y revisando un recibo.

### Qué NO está en las copias (y por qué no hace falta)

El código vive en Git; las imágenes se reconstruyen con `desplegar.sh`; los certificados HTTPS los vuelve a pedir Caddy solo.

## Fase 5. Primer arranque con datos reales (por escribir)

**Primer arranque con datos reales:** cargar los datos con el importador, probar el correo y repetir la medición de rendimiento en este servidor (RNF-REN-01 a 04). Pendientes de endurecimiento: límite de peticiones por IP en el inicio de sesión (requiere agregar `@nestjs/throttler`) y una política de seguridad de contenido (CSP) probada con las descargas de PDF.
