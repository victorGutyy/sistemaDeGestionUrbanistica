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

## Demostración, volumen y limpieza

Tres bases separadas: la de desarrollo (`sistema_urbanismo`), la de demostración (`sistema_urbanismo_demo`) y la de volumen (`sistema_urbanismo_volumen`). Las dos últimas se derivan del nombre de `DATABASE_URL`, así que ningún script de demostración toca la de desarrollo.

```bash
cd backend
npm run demo:preparar -- --reiniciar   # crea y carga la demostración (La Floresta)
npm run demo:api                       # API de la demostración en el puerto 3001
cd ../frontend && npm run dev:demo     # pantallas en http://localhost:5174
```

Las contraseñas de la demostración (inventadas) quedan en `backend/.demo/demo/credenciales.txt`. Todo está explicado en `docs/DEMO.md`: escenarios, guion de presentación, base de volumen (`npm run demo:volumen`, `npm run demo:medir`) y `npm run db:limpiar`, que deja la base de desarrollo como instalación nueva con candados (base local, nombre escrito a mano y respaldo de los últimos 30 minutos).

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
- ✅ Demostración y rendimiento (paso 2.11): una base de demostración de La Floresta con escenarios para recorrer (contado, al día, por vencer, en mora, venta liquidada con recibos históricos, excepciones, desistimiento, separaciones, abono anulado, remodelación, maquinaria, nómina y cierres), una base de volumen con 1.000 lotes y más de 5.000 abonos para medir el rendimiento (RNF-REN-01 a 04 cumplen; ver `docs/rendimiento.md`) y la limpieza protegida de la base de desarrollo para cargar el Excel real. Cómo usarlas: `docs/DEMO.md`.
- ⏳ Etapa 1, lo que falta para cerrarla: la plantilla de importación con el Excel real, el despliegue (HTTPS, almacenamiento S3, copias de seguridad), el manual y la capacitación. Los 75 requerimientos "Debe" ya están; la matriz requerimiento por requerimiento está en `docs/cobertura-etapa-1.md`.
- ✅ Etapa 2, comisiones (RF-COM-01 a 04, RF-REP-08 y parte de RF-REP-02): cada venta con vendedor genera sola su comisión, con el valor fijo de su tipo vigente en ese momento (nace cuando la venta queda activa; una excepción la genera al aprobarse y una rechazada no tiene). Se paga desde la pantalla Comisiones o desde la venta: el pago crea el egreso en la categoría Comisiones del proyecto, con soporte o motivo, en la misma transacción, y respeta el cierre de caja; dos pagos simultáneos no duplican el egreso. Se anula con motivo (solo el gerente; una pagada anula también su egreso, que no se puede anular por separado desde Finanzas). Al desistir una venta, el gerente decide si anula en el mismo acto la comisión pendiente, y si ya estaba pagada se le avisa. El listado filtra por vendedor, estado, proyecto y fechas (de la venta o del pago), muestra totales por estado y se exporta a Excel; el panel general muestra las comisiones por pagar. La base impide borrar una comisión, cambiar su valor, venta o vendedor, y reabrir una anulada.
- ✅ Etapa 2, motor de reportes (paso 3.2a, RF-REP-04 a 07, RF-REP-11, RF-CAR-05 y parte de RF-REP-10): un modelo común de reporte (secciones con columnas y filas) que se ve en pantalla, se baja en PDF o en Excel y respeta el alcance por proyecto; reportes de recaudo (por medio de pago, cuenta y usuario, con el recibo de cada abono), cartera por edades de mora (por vencer, 1–30, 31–60, 61–90 y más de 90 días, con interés), egresos por categoría y proyecto (incluida la nómina), inventario de lotes por estado y flujo de caja por día, semana, quincena o mes con saldo acumulado. Cuadran con el consolidado de caja y la cartera (pruebas contra la base real) y el PDF más pesado tarda menos de 2 s con 5.000 abonos. Permiso nuevo `reportes.ver`.
- ✅ Etapa 2, pantalla de Reportes (paso 3.2b): menú **Reportes** (para quien tiene `reportes.ver`) con la lista de reportes, filtros que cambian según el reporte (fechas, proyecto, medio de pago, cuenta, usuario, categoría, estado del lote, agrupación), vista previa en tablas (las primeras 500 filas del detalle; las tablas se deslizan dentro de su recuadro y la página nunca se desborda en el celular) y botones para descargar el PDF o el Excel con los mismos filtros.
- ✅ Etapa 2, informes y panel (paso 3.2c): **informe del proyecto para el socio** (RF-REP-09; ventas y cobros, ingresos/egresos/utilidad, egresos por categoría, cartera por edad y lotes de un solo proyecto; el socio solo puede pedir el suyo), **maquinaria: utilidad por equipo** (RF-MAQ-05, con la flota como fila aparte), **reporte de comisiones** en pantalla, PDF y Excel (RF-REP-08/10) y mejoras del panel general (RF-REP-01/02): filtro por proyecto, utilidad del período, cartera al día / por vencer en los próximos días / vencida, lotes por estado y cierres de caja por aprobar.
- ✅ Etapa 2, notificaciones (paso 4.1a, backend): módulo `backend/src/notificaciones/`. **Recibo en PDF por correo** al registrar un abono (RF-NOT-01; sin hacer esperar a quien registra, apagable en Configuración, con reenvío manual), **recordatorios de cuota** rehechos sobre el historial (RF-NOT-02 y 05: cada cuota se reclama con una escritura atómica antes de enviar, un fallo no frena a los demás clientes y se reintenta), **avisos de mora** periódicos (RF-NOT-03: un correo por venta con sus cuotas vencidas y el total, cada N días configurables, respetando los días de gracia, sin interés de mora mientras RF-CAR-06 no se defina), **mensaje y enlace de WhatsApp** listos para abrir (RF-NOT-04: celular colombiano normalizado a 57…, texto de recibo, recordatorio o mora; el sistema no envía nada) e **historial de avisos** inmutable (RF-NOT-06: tipo, canal, estado enviada/fallida/omitida/enlace abierto, destinatario, quién y cuándo). Migración `20261021100000_notificaciones`. Dos parámetros nuevos en Configuración: días entre avisos de mora y envío automático del recibo.
- ✅ Etapa 2, notificaciones (paso 4.1b, frontend): menú **Notificaciones** (para quien tiene `notificaciones.ver`) con el historial filtrable por aviso, canal, resultado y fechas, contadores por resultado y paginación; los filtros viven en la dirección de la página, así que la ficha del cliente y el detalle de la venta enlazan a su propio historial. **Botones de WhatsApp** (abren el mensaje listo en una ventana que se abre en el mismo clic, para que el navegador no la bloquee) en el abono recién registrado, la lista de abonos de la venta, Cartera (mora o recordatorio según la venta) y la ficha del cliente; botón **Enviar recibo por correo**; sección "Avisos enviados" en la ficha del cliente y en la venta; aviso en la ficha de que sin autorización de datos (Ley 1581) los avisos siguen saliendo; parámetros de avisos en Configuración. El rol Consulta no ve nada de esto.
- ⏳ Etapa 2, lo que falta: alerta de consignaciones por verificar (RF-NOT-07, depende de RF-REC-10), verificación de consignaciones (RF-REC-10) y recuperación de contraseña.
- ⏳ Etapa 3: módulo de personal.

La interfaz ya es responsive desde 360 px, usa formato colombiano ($1.234.567, dd/mm/aaaa) y las descargas (exportaciones y comprobantes) envían la sesión. Otros pendientes conocidos están en la sección "Deuda técnica conocida" de `CLAUDE.md`.
