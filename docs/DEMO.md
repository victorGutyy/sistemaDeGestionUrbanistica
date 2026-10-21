# Demostración y datos de prueba

Este documento explica cómo preparar, usar y limpiar las bases de **demostración** y de **volumen**, y cómo dejar la base de desarrollo lista para cargar el Excel real del cliente.

> Todo lo que cargan estos scripts es **inventado** (nombres, documentos, teléfonos, cuentas y correos `@ejemplo.test`). Nunca se usan datos de personas reales (Ley 1581 de 2012).

## Tres bases, cada una en su sitio

| Base | Para qué | Cómo se llama | Quién la toca |
|---|---|---|---|
| Desarrollo | El trabajo diario de programación | `sistema_urbanismo` (la de `DATABASE_URL`) | Los servidores normales (`backend` en el puerto 3000) |
| Demostración | Mostrar el sistema al cliente | `sistema_urbanismo_demo` | `demo:preparar`, `demo:api` (puerto 3001) |
| Volumen | Medir el rendimiento (RNF-REN-01..04) | `sistema_urbanismo_volumen` | `demo:volumen`, `demo:api -- volumen` (puerto 3002) |

Los nombres de las bases derivadas **se calculan a partir de `DATABASE_URL`** agregando el sufijo (`_demo`, `_volumen`). Por eso ningún script de demostración puede escribir por error en la base de desarrollo, y `--reiniciar` solo funciona con bases que terminan en esos sufijos.

Cada base derivada tiene además su propia carpeta de archivos y credenciales en `backend/.demo/<demo|volumen>/` (fuera de Git). La API de demostración **tiene el correo apagado**: aunque pase el cron de las 8:00, no sale ningún recordatorio.

## Preparar la demostración

Desde `backend/`:

```bash
npm run demo:preparar
```

Crea la base `sistema_urbanismo_demo`, aplica las migraciones, siembra la configuración y los roles, y carga los datos **con los servicios reales del sistema** (por eso los recibos, la auditoría, los saldos y los cierres salen igual que en el uso diario). Al final corre una verificación de coherencia. Si la base ya existe, el script se detiene; para rehacerla:

```bash
npm run demo:preparar -- --reiniciar
```

Las fechas son **relativas al día en que se prepara**, así que siempre hay clientes al día, por vencer y en mora. Conviene repetir `--reiniciar` el mismo día de la presentación.

Las contraseñas (aleatorias) quedan en `backend/.demo/demo/credenciales.txt`:

| Usuario | Rol | Qué ve |
|---|---|---|
| `gerente.demo@ejemplo.test` | Gerente | Todo, con control total |
| `admin.demo@ejemplo.test` | Administrador | La operación diaria de todos los proyectos |
| `socio.demo@ejemplo.test` | Consulta | Solo lectura y **solo La Floresta** (el caso del socio) |

### Arrancar la demostración

Dos terminales (o `preview_start` con `demo-api` y `demo-frontend`):

```bash
# backend/
npm run demo:api
# frontend/
npm run dev:demo
```

Abrir <http://localhost:5174>.

## Qué contiene la demostración

**La Floresta** (proyecto de lotes): 9 manzanas (A–I) de 15 lotes, 135 en total, y 15 clientes inventados. Escenarios para recorrer:

| Escenario | Dónde mirarlo |
|---|---|
| 3 ventas **de contado** (con transferencia y consignación) | Ventas A1–A3 |
| 6 ventas **financiadas al día** (cuota inicial del 30 %, 12 cuotas sin interés de financiación); un cliente con dos compras | B1–B6 |
| 2 clientes en **amarillo** (próxima cuota en 3 y 4 días) | Cartera, C1–C2 |
| 2 clientes en **rojo** (cuotas vencidas; uno con abono parcial) y su **interés de mora** | Cartera, C3–C4 |
| 1 venta **pagada por completo** con recibos históricos `H-` y lote **escriturado** | D1 |
| 1 **excepción autorizada** por el gerente (plazo de 18 cuotas) y 1 **pendiente de aprobación** (cuota inicial del 10 %) | D2, D3 |
| 1 **desistimiento** con devolución parcial (queda como egreso) | D4 |
| 2 lotes **separados** | E1, E2 |
| 1 **abono anulado** (el recibo queda con la marca ANULADO) | Venta B1 |
| 15 egresos y 2 ingresos propios del proyecto | Finanzas |
| **Comisiones**: las ventas con vendedor generan la suya; 2 ya pagadas (con su egreso en Finanzas), 1 anulada a mano y 1 anulada junto con un desistimiento; el resto pendientes | Comisiones |

Además:

- **Remodelación Casa Demo** (CC-01): anticipo del cliente y tres egresos, con su utilidad.
- **Maquinaria Demo** (CC-02): 4 equipos (uno en mantenimiento y uno dado de baja), alquileres con cliente y período, combustible, mantenimiento, repuestos, operario y un gasto de flota; utilidad por equipo.
- **Nómina**: 6 trabajadores y 8 pagos con recibo de nómina.
- **Cierres de caja**: dos aprobados (uno con diferencia explicada), uno cerrado pendiente de aprobación del gerente.
- **Auditoría**: cientos de registros (quién, cuándo, valor anterior y nuevo).

Valores de ejemplo que **no son del cliente**: la tasa de mora (2 %), las dos cuentas de recaudo (`000-000000-01`/`-02`) y el logo. El cliente aún debe confirmarlos (ver CLAUDE.md, "Pendiente de confirmar").

## Guion sugerido (15 minutos)

1. **Gerente**: Tablero → cartera por semáforo → ficha de un cliente en rojo → estado de cuenta en PDF.
2. **Administrador**: registrar un abono (desde un celular, a 375 px) → recibo en PDF → verlo en el cierre de caja.
3. **Ventas**: excepción pendiente (D3) → el gerente la autoriza.
4. **Comisiones**: lista con totales, pagar una pendiente (crea el egreso) y anularla como gerente; el administrador no ve el botón Anular.
5. **Reportes**: elegir *Cartera por edades de mora*, verlo en pantalla y bajarlo en PDF; luego *Flujo de caja* agrupado por mes y *Recaudo* filtrado por medio de pago. Para el socio: *Informe del proyecto* de La Floresta (PDF); y *Maquinaria: utilidad por equipo* para mostrar qué equipo deja más. En el **Panel general** elegir el proyecto La Floresta y mostrar cartera por vencer, lotes por estado y cierres por aprobar. **Correos de verdad (sin enviar nada afuera)**: en una terminal `npm run correo:sumidero` (servidor SMTP de prueba local que guarda los correos en `backend/.demo/correos-recibidos/`) y, en otra, la API con `DEMO_SMTP_LOCAL=127.0.0.1:2525 npm run demo:api` (en PowerShell: `$env:DEMO_SMTP_LOCAL="127.0.0.1:2525"; npm run demo:api`); en Configuración se ve "Correo de avisos" configurado y el botón "Enviar correo de prueba" funciona. **Recuperación de contraseña**: en el ingreso, "¿Olvidaste tu contraseña?", escribir el correo del socio; como la demo no tiene correo, el enlace aparece en la consola donde corre `demo:api` ("Enlace de recuperación de …"); abrirlo, elegir la clave nueva e ingresar con ella (al volver a preparar la demo las claves se regeneran). **Verificación de pagos**: en el Panel la tarjeta roja "Pagos por verificar" (6, el más antiguo con 6 días); abrir **Por verificar**, elegir un par de pagos, escribir la nota del movimiento del extracto y confirmar; en la venta se ve la etiqueta "Verificado" con su fecha y nota. **Notificaciones**: en Configuración marcar "Enviar el recibo en PDF al correo" (la demo no tiene correo, así que los avisos quedan como *omitida: correo de la empresa no configurado*), registrar un abono y usar "Avisar por WhatsApp" (abre el mensaje listo) y "Enviar recibo por correo"; en el Panel pulsar "Enviar recordatorios de pago" y abrir el menú **Notificaciones** para ver el historial, filtrarlo por resultado y entrar desde la ficha de un cliente o de una venta.
6. **Finanzas**: egresos de La Floresta, finanzas de la remodelación y utilidad por equipo de la maquinaria.
7. **Socio (Consulta)**: entra y solo ve La Floresta; no puede crear ni anular nada.
8. **Auditoría** (gerente): el abono anulado, con quién y por qué.
9. **Configuración → Exportar todo a Excel**: la empresa se lleva todos sus datos cuando quiera.

## Volumen y rendimiento

```bash
npm run demo:volumen              # 10 proyectos, 1.000 lotes, 400 clientes, 800 ventas, ~5.000 abonos
npm run demo:api -- volumen       # otra terminal
npm run demo:medir                # imprime la medición y guarda backend/.demo/volumen/medicion.json
```

Los resultados y cómo leerlos están en [rendimiento.md](rendimiento.md).

## Limpiar la base de desarrollo (cargar el Excel real)

Cuando llegue el Excel real del cliente y la plantilla de importación esté ajustada (`backend/src/importacion/plantilla-definicion.ts`), la base de desarrollo se deja como una instalación nueva con `db:limpiar`. **Borra todo** (incluida la configuración y los usuarios) y vuelve a sembrar, por eso tiene candados:

1. No corre con `NODE_ENV=production` ni contra un servidor que no sea local.
2. Hay que escribir el nombre exacto de la base en la variable `CONFIRMO_LIMPIAR`.
3. Debe existir un respaldo `pg_dump` de **esa** base, de los últimos 30 minutos, en `backend/respaldos/` con `<base>_pre_limpieza` en el nombre.
4. Deben estar `SEED_ADMIN_NOMBRE/EMAIL/PASSWORD` en `.env` (si no, la base quedaría sin ningún usuario para entrar).

Pasos (Git Bash, desde `backend/`; el usuario de `pg_dump` es el de su `DATABASE_URL`):

```bash
# 1. Ensayo en seco: muestra qué se borraría y qué candado falta. No cambia nada.
npm run db:limpiar -- --ensayo

# 2. Respaldo (la redirección ">" de PowerShell 5 guarda en UTF-16 y rompe el archivo: usa Git Bash)
docker exec sistema-urbanismo-db pg_dump -U USUARIO sistema_urbanismo > respaldos/sistema_urbanismo_$(date +%Y%m%d)_pre_limpieza.sql

# 3. Limpieza real (con --archivos también se vacía uploads/, los soportes de los datos de prueba)
CONFIRMO_LIMPIAR=sistema_urbanismo npm run db:limpiar
```

Después: entrar con el gerente de `SEED_ADMIN_*`, **quitar esas variables del `.env`**, ajustar la configuración de la empresa (logo, cuentas reales, tasa de mora) e importar el Excel desde Configuración → Importar. Para volver atrás: restaurar el respaldo.

## Si algo sale mal

- *"La base … ya existe"*: usa `-- --reiniciar`.
- *"…no es una base de demostración o de volumen"*: `--reiniciar` nunca toca la base de desarrollo; es el candado funcionando.
- *Cambié el esquema (nueva migración)*: `npm run demo:preparar -- --reiniciar` la reconstruye con la migración nueva.
