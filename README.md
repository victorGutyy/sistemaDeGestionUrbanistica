# Urbanix

Sistema de gestión para una empresa de urbanismo: compra de predios, subdivisión en lotes, ventas financiadas, cartera y mora, finanzas generales y nómina. Reemplaza el control manual que hoy se lleva en Excel.

## Arquitectura

Monorepo con dos aplicaciones independientes:

- **`backend/`** — API en NestJS + TypeScript, con Prisma sobre PostgreSQL.
- **`frontend/`** — Aplicación web en React + Vite + TypeScript, con Tailwind CSS.
- **`docs/`** — Documentación funcional y técnica del proyecto.

Es una aplicación web (no de escritorio): el backend corre como servicio y el frontend se sirve por navegador. Esto permite que, en el futuro, la app móvil de solo consulta del cliente final se conecte a la misma base de datos sin duplicar lógica.

## Requisitos

- Node.js 20 o superior
- PostgreSQL 15 o superior (local o en un contenedor)

## Requerimientos y reglas del proyecto

- Alcance completo (112 requerimientos funcionales y 32 no funcionales, por etapa): [`docs/requerimientos.md`](docs/requerimientos.md).
- Reglas de trabajo, convenciones y lo que está fuera del alcance: [`CLAUDE.md`](CLAUDE.md).

## Levantar el backend

```bash
cd backend
npm install
cp .env.example .env   # completa DATABASE_URL, JWT_SECRET, etc. con tus valores locales
npx prisma migrate dev # crea las tablas en tu base de datos según prisma/schema.prisma
npm run start:dev
```

La API queda escuchando en `http://localhost:3000` (puerto configurable con `PORT` en `.env`).

**Datos iniciales.** `npx prisma db seed` (desde `backend/`) carga la configuración inicial de la empresa desde `backend/prisma/semillas/empresa-balder.ts` (datos de la empresa, parámetros, categorías de gasto, medios de pago, comisiones y cuentas inactivas "POR CONFIGURAR"); es seguro repetirlo porque nunca pisa lo que el gerente ya editó en la app. Para cambiar de cliente se edita ese archivo y el gerente ajusta el resto desde Configuración.

**Primer usuario.** No hay registro público, así que la primera cuenta se siembra: completa `SEED_ADMIN_NOMBRE`, `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD` (mínimo 8 caracteres) en `backend/.env`, corre `npx prisma db seed` y luego borra esas tres líneas del `.env`. Esa cuenta queda con el rol Gerente; las demás se crean desde la sección Usuarios.

**Comprobar que todo está sano:**

```bash
cd backend && npm test && npm run lint && npx tsc --noEmit -p tsconfig.json
cd ../frontend && npm run lint && npx tsc -b --noEmit
```

## Levantar el frontend

```bash
cd frontend
npm install
npm run dev
```

La aplicación queda disponible en `http://localhost:5173`.

## Base de datos

Para desarrollo local usamos PostgreSQL en Docker (Docker Desktop ya instalado en esta máquina):

```bash
docker run --name sistema-urbanismo-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=sistema_urbanismo -p 5432:5432 -d postgres:16
docker update --restart unless-stopped sistema-urbanismo-db
```

El contenedor queda con reinicio automático, así que normalmente no hay que volver a crearlo — si por alguna razón no está corriendo, revísalo con `docker ps -a` y arráncalo con `docker start sistema-urbanismo-db`.

Con la base arriba, `backend/.env` ya apunta a ella (`postgresql://postgres:postgres@localhost:5432/sistema_urbanismo`). Para crear/actualizar las tablas:

```bash
cd backend
npx prisma migrate dev
```

## Estado actual

La base genérica Urbanix (v1.0) está completa y funcionando; ahora se adapta al primer cliente real según `docs/requerimientos.md`.

Ya existe en la base:
- ✅ Login con JWT, roles con permisos (Gerente, Administrador, Consulta; se pueden agregar más sin tocar el código), bloqueo tras intentos fallidos, cierre de sesión por inactividad, gestión de usuarios y alcance por proyecto (un usuario de Consulta puede limitarse a ciertos proyectos y no ve datos de los demás).
- ✅ Proyectos de lotes, remodelación y maquinaria; manzanas opcionales; lotes con ficha, estados (disponible, separado, vendido, escriturado, desistido) con historial de cambios de estado y de precio, área disponible y finalizar/reactivar proyectos.
- ✅ Ventas de contado y financiadas: cuota inicial como cuota 0 pagada con abonos, plan de cuotas en pesos enteros, parámetros del negocio desde Configuración, excepciones (cuota inicial baja o plazo largo) con aprobación del gerente, vendedor (asesor o referido), separación del lote con valor y fecha límite, documentos firmados de la venta y desistimiento (solo gerente).
- ✅ Abonos y recibos de caja: el abono se reparte solo entre las cuotas pendientes por fecha de vencimiento, con cuenta destino y referencia (no repetible por cuenta), soporte opcional validado por su contenido, recibo con consecutivo sin repetidos ni saltos (prefijo configurable, `H-` para recibos históricos), PDF a partir de una fotografía del recibo, anulación solo por el gerente (el recibo y el abono se conservan y el número no se reutiliza), búsqueda de recibos y registros inmutables en la base de datos.
- ✅ Cartera con semáforo e interés de mora (informativo).
- ✅ Ingresos y gastos manuales con consolidado de caja.
- ✅ Nómina básica.
- ✅ Panel general con exportación a PDF y Excel, y recordatorios de pago por correo.

En adaptación (ver `docs/requerimientos.md`):
- ✅ Finanzas: egresos e ingresos con categoría (de gasto o de ingreso, administrables por el gerente), medio de pago y cuenta, tercero y número de factura, soporte adjunto o motivo de no tenerlo, anulación solo por el gerente (el movimiento se conserva y no suma), movimientos inmutables en la base de datos, finanzas por proyecto (ingresos, egresos, utilidad, vendido, recaudado y saldo por cobrar) y la devolución de un desistimiento registrada como egreso. El pago de nómina guarda medio y cuenta.
- ✅ Cierre de caja: diario, semanal o quincenal, con períodos consecutivos y sin huecos, totales por medio de pago y por cuenta, efectivo esperado contra contado con la diferencia explicada, flujo borrador → cerrado → aprobado o devuelto por el gerente, las anulaciones aparecen en el cierre del período en que se anularon, un día ya cerrado no admite registros nuevos y exportación a PDF.
- ✅ Auditoría (solo gerente): cada acción sobre ventas, abonos, recibos, egresos, cierres, nómina, lotes, proyectos, clientes, trabajadores, configuración y usuarios queda registrada en la misma transacción con quién, cuándo, qué, valor anterior y valor nuevo (sin contraseñas ni contenido de archivos); registros inmutables en la base y pantalla con filtros (fechas, usuario, tipo, acción, texto) que muestra los cambios campo por campo.
- ✅ Importador de Excel (solo gerente): plantilla descargable (proyectos, lotes, clientes, ventas, cuotas opcional y abonos), carga en modo de prueba que valida sin guardar y muestra errores por hoja y fila, confirmación explícita, guardado de todo o nada en una sola transacción, abonos históricos con recibos de la serie `H-`, el mismo archivo no se importa dos veces y reporte de conciliación de saldos (en pantalla y en Excel). La plantilla es un borrador: se ajusta en `backend/src/importacion/plantilla-definicion.ts` cuando llegue el Excel real de la empresa.
- ✅ Clientes: lista con búsqueda por nombre, documento o teléfono, registro de clientes con tipo de documento, ficha con sus ventas, saldo, cuotas vencidas, interés de mora y semáforo, edición auditada (el documento no se cambia), autorización de tratamiento de datos (Ley 1581 de 2012) con fecha y quién la registró, "Registrar abono" a tres pasos y estado de cuenta en PDF. El detalle de cada venta también muestra cuotas vencidas, saldo vencido y mora; todos usan el mismo cálculo de cartera.
- ✅ Exportación completa a Excel (solo gerente, desde Configuración): un libro con una hoja por tipo de dato (la lista sale del propio esquema, así que una tabla nueva entra sola), sin contraseñas ni archivos adjuntos; cada exportación queda en la auditoría.
- ✅ Maquinaria (CC-02): los proyectos de tipo Maquinaria llevan equipos (nombre, tipo, marca, modelo, año, placa o serie única y estado: activo, en mantenimiento o fuera de servicio) y tipos de equipo que administra el gerente. Un equipo nunca se borra (lo impide la base de datos): se da de baja con motivo, conserva todos sus movimientos y ya no recibe nuevos; el gerente puede reactivarlo. Cada ingreso o egreso de un proyecto de maquinaria se asigna a un equipo o se marca como general de la flota, lleva soporte o el motivo de no tenerlo, y el ingreso por alquiler registra cliente y período alquilado. Hay categorías de gasto propias de la maquinaria. La ficha del equipo muestra sus movimientos y totales; el reporte por rango de fechas y la comparación entre equipos son de la Etapa 2.
- ⏳ Etapa 1: datos de demostración de La Floresta (base separada) y cierre de la etapa. Los 75 requerimientos "Debe" ya están; la matriz requerimiento por requerimiento está en `docs/cobertura-etapa-1.md`.
- ⏳ Etapa 2: notificaciones (correo y WhatsApp), verificación de consignaciones, comisiones, panel y reportes ampliados, recuperación de contraseña.
- ⏳ Etapa 3: módulo de personal.

La interfaz ya es responsive desde 360 px, usa formato colombiano ($1.234.567, dd/mm/aaaa) y las descargas (exportaciones y comprobantes) envían la sesión. Otros pendientes conocidos están en la sección "Deuda técnica conocida" de `CLAUDE.md`.
