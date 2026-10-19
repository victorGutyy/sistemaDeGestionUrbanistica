# Cobertura de la Etapa 1

Auditoría del paso 2.10a (18/10/2026), actualizada con los pasos 2.10b, 2.10c y 2.11 (19/10/2026): cada requerimiento de la Etapa 1 de `docs/requerimientos.md` contra lo que hay hoy en el código. Es una revisión de lectura (rutas, pantallas, esquema, pruebas); no cambia nada del sistema.

**Estados:** ✅ construido y verificado · 🟡 parcial (qué falta en la columna de evidencia) · ❌ falta · ⏸ pospuesto a propósito · ⏳ no depende del código (se mide o se hace al desplegar).

La Etapa 1 se acepta cuando están todos sus **Debe**. Los "Debería" y "Podría" se mueven primero si hay atraso.

## Resumen

| | Total | ✅ | 🟡 | ❌ | ⏸ |
|---|---|---|---|---|---|
| Debe | 75 | 75 | 0 | 0 | 0 |
| Debería | 12 | 10 | 1 | 1 | 0 |
| Podría | 1 | 0 | 0 | 0 | 1 |

Total: 88 requerimientos funcionales de la Etapa 1 (los de CC-01 y CC-02 asignados a esta etapa están incluidos). Están los 75 "Debe" de la Etapa 1: la etapa se puede aceptar (quedan algunos "Debería" y el "Podría").

## Lo que falta de la Etapa 1

Ningún "Debe". Solo quedan dos "Debería" y el "Podría":

| ID | Qué falta | Se resuelve en |
|---|---|---|
| RF-USR-08 (Debería) | Los roles son filas de una tabla con permisos de un catálogo, pero no hay pantalla ni endpoint para **crear roles nuevos** (hoy solo `GET /roles`). | por decidir |
| RF-CAR-06 (Debería) | Pago del interés de mora separado del abono. Depende de lo que confirme el cliente sobre cómo se cobra la mora. | fuera de la Etapa 1 mientras tanto |
**Podría:** RF-VEN-09 (varios compradores por venta) queda ⏸ para el final, como se acordó.

## Requerimientos funcionales

### Configuración (CFG)

| ID | Prio. | Estado | Evidencia |
|---|---|---|---|
| RF-CFG-01 | Debe | ✅ | `PUT /configuracion/empresa`, logo (`POST/DELETE /configuracion/logo`), pantalla Configuración. |
| RF-CFG-02 | Debe | ✅ | Tabla `ConfiguracionEmpresa`, `EmpresaContext`; recibos, PDF y correos la leen de la base. |
| RF-CFG-03 | Debe | ✅ | `PUT /configuracion/parametros` (cuota inicial, plazo máximo, tasa); `ventas/reglas-venta.ts` los usa. |
| RF-CFG-04 | Debe | ✅ | Tasa de mora y días de gracia en parámetros; `cartera/mora.ts`. |
| RF-CFG-05 | Debe | ✅ | `diasSemaforoAmarillo` en parámetros; `calcularSemaforo`. |
| RF-CFG-06 | Debe | ✅ | `POST/PATCH /configuracion/cuentas`; las cuentas se desactivan, no se borran. |
| RF-CFG-07 | Debe | ✅ | `PATCH /configuracion/medios-pago/:medio`; el servidor rechaza un medio deshabilitado. |
| RF-CFG-08 | Debe | ✅ | `POST/PATCH /configuracion/categorias-gasto`; las del sistema no se renombran. |
| RF-CFG-10 | Debería | ✅ | `textoLegalRecibo` en la empresa; aparece en el PDF del recibo. |
| RF-CFG-11 | Debe | ✅ | `POST/PATCH /configuracion/categorias-ingreso` (CC-01). |

### Usuarios (USR)

| ID | Prio. | Estado | Evidencia |
|---|---|---|---|
| RF-USR-01 | Debe | ✅ | `POST /auth/login`; no existe ruta de registro; el primer gerente sale del seed. |
| RF-USR-02 | Debe | ✅ | `RolUsuario` con permisos del catálogo `auth/permisos.ts`; Gerente, Administrador y Consulta. |
| RF-USR-03 | Debe | ✅ | `UsuarioProyecto`; `auth/alcance.ts`; pruebas `alcance-servicios.spec.ts`. |
| RF-USR-04 | Debe | ✅ | `POST/PATCH /usuarios`, `PATCH /usuarios/:id/estado` (activar y desactivar, sin borrar). |
| RF-USR-05 | Debe | ✅ | `POST /usuarios/:id/password`. |
| RF-USR-07 | Debe | ✅ | `minutosInactividad` configurable; `AuthContext` cierra la sesión. |
| RF-USR-08 | Debería | 🟡 | Los roles ya viven en una tabla; falta la pantalla y el endpoint para crearlos y editarlos. |
| RF-USR-09 | Debe | ✅ | `usuarios.service.ts`: "No puedes cambiar el estado de tu propia cuenta". |

### Proyectos y lotes (PRY)

| ID | Prio. | Estado | Evidencia |
|---|---|---|---|
| RF-PRY-01 | Debe | ✅ | `POST /proyectos`; pantalla Registrar proyecto. |
| RF-PRY-02 | Debe | ✅ | `POST /proyectos/:id/manzanas`; las manzanas son opcionales. |
| RF-PRY-03 | Debe | ✅ | `POST /lotes`; pantalla Registrar lote. |
| RF-PRY-04 | Debe | ✅ | `proyectos/areas.ts`; el lote que excede el área pide confirmación (`confirmarExcesoArea`). |
| RF-PRY-05 | Debe | ✅ | `EstadoLote`; máquina de estados `lotes/estado-lote.ts`. |
| RF-PRY-06 | Debe | ✅ | `lotes/aplicar-accion.ts` es el único lugar que cambia el estado; deja historial y auditoría. |
| RF-PRY-07 | Debe | ✅ | `PATCH /lotes/:id` registra el precio anterior en `LoteHistorial`. |
| RF-PRY-08 | Debe | ✅ | `PATCH /proyectos/:id/estado`; un proyecto finalizado no admite lotes ni manzanas nuevas. |
| RF-PRY-09 | Debe | ✅ | `GET /lotes` con filtros de proyecto, manzana, estado y búsqueda. |
| RF-PRY-10 | Debería | ✅ | `POST /lotes/:id/escriturar` con datos de la escritura. |
| RF-PRY-11 | Debe | ✅ | `TipoProyecto.REMODELACION` (CC-01); sin manzanas ni lotes. |
| RF-PRY-12 | Debe | ✅ | `TipoProyecto.MAQUINARIA` (CC-02): su pantalla muestra los equipos en vez de lotes y manzanas. |

### Clientes (CLI)

| ID | Prio. | Estado | Evidencia |
|---|---|---|---|
| RF-CLI-01 | Debe | ✅ | `POST /clientes` y pantalla Nuevo cliente (`/clientes/nuevo`) con tipo de documento; también al crear el cliente dentro de la venta. |
| RF-CLI-02 | Debe | ✅ | `documento` único (base de datos y servicio). |
| RF-CLI-03 | Debe | ✅ | Menú Clientes (`/clientes`, búsqueda) y ficha (`/clientes/:id`): datos, resumen de cartera, ventas con cuotas y abonos, Registrar abono y estado de cuenta. |
| RF-CLI-04 | Debería | ✅ | Campos `autorizaDatos`, `fechaAutorizacion` y quién la registró; se da al crear, se registra o retira desde la ficha y queda en la auditoría. |

### Ventas (VEN)

| ID | Prio. | Estado | Evidencia |
|---|---|---|---|
| RF-VEN-01 | Debe | ✅ | `POST /lotes/:id/separar` con valor y fecha límite; pantalla del lote. |
| RF-VEN-02 | Debe | ✅ | `POST /ventas`; pantalla Registrar venta. |
| RF-VEN-03 | Debe | ✅ | Cuota inicial en valor o porcentaje (`calcularCuotaInicial`). |
| RF-VEN-04 | Debe | ✅ | `ventas/plan-de-pagos.ts`: cuotas mensuales sin interés en pesos enteros. |
| RF-VEN-05 | Debe | ✅ | `evaluarExcepcion`; `POST /ventas/:id/aprobar` y `/rechazar` (solo gerente). |
| RF-VEN-06 | Debe | ✅ | `POST /ventas/:id/documentos` (PDF, PNG o JPG validados por su contenido). |
| RF-VEN-07 | Debe | ✅ | Tabla `Vendedor` (asesor o referido, con documento y teléfono). |
| RF-VEN-08 | Debe | ✅ | `POST /ventas/:id/desistir`; no toca abonos ni recibos. |
| RF-VEN-09 | Podría | ⏸ | Pospuesto al final. |
| RF-VEN-10 | Debe | ✅ | `GET /ventas/:id` y `VentaDetallePage` (cuotas, abonos, saldo y documentos). |

### Abonos y recibos (REC)

| ID | Prio. | Estado | Evidencia |
|---|---|---|---|
| RF-REC-01 | Debe | ✅ | `POST /abonos` con venta, valor, fecha, medio, cuenta, referencia y usuario. |
| RF-REC-02 | Debe | ✅ | Soporte adjunto validado por su contenido; se descarga solo con sesión y permiso. |
| RF-REC-03 | Debe | ✅ | `abonos/repartir-abono.ts`; pruebas `repartir-abono.spec.ts`. |
| RF-REC-04 | Debe | ✅ | Recibo `RC-` con consecutivo sin saltos; prueba de concurrencia `consecutivos.e2e-spec.ts`. |
| RF-REC-05 | Debe | ✅ | `abonos/recibo-contenido.ts` (incluye valor en letras); `generar-pdf-recibo.ts`. |
| RF-REC-06 | Debe | ✅ | Triggers de la base impiden editar o borrar recibos y abonos. |
| RF-REC-07 | Debe | ✅ | `POST /abonos/:id/anular` (solo gerente, con motivo); el recibo queda marcado ANULADO. |
| RF-REC-08 | Debe | ✅ | `anularAbonoEnTx` revierte las cuotas; el consecutivo no se reutiliza. |
| RF-REC-09 | Debe | ✅ | `GET /abonos/:id/recibo` (PDF) y búsqueda `GET /recibos`. |

### Cierre de caja (CAJ)

| ID | Prio. | Estado | Evidencia |
|---|---|---|---|
| RF-CAJ-01 | Debe | ✅ | `POST /cierres-caja` diario, semanal o quincenal (semana y quincena provisionales). |
| RF-CAJ-02 | Debe | ✅ | `cierres-caja/calcular-cierre.ts`: totales por medio de pago y por cuenta. |
| RF-CAJ-03 | Debe | ✅ | Efectivo esperado contra contado y diferencia. |
| RF-CAJ-04 | Debe | ✅ | Estados borrador, cerrado, aprobado o devuelto; `/cerrar`, `/aprobar`, `/devolver`. |
| RF-CAJ-05 | Debe | ✅ | `fecha-abierta.ts` bloquea registros en períodos cerrados; las anulaciones cuentan el día que se anulan. |
| RF-CAJ-06 | Debería | ✅ | `GET /cierres-caja/:id/pdf` (no visto renderizado). |

### Cartera (CAR)

| ID | Prio. | Estado | Evidencia |
|---|---|---|---|
| RF-CAR-01 | Debe | ✅ | `cartera/mora.ts` (`calcularSemaforo`); `CarteraPage`. |
| RF-CAR-02 | Debe | ✅ | Interés de mora solo sobre el saldo vencido, con tasa y días de gracia de la configuración. |
| RF-CAR-03 | Debe | ✅ | `estadoCuenta.cartera` en el detalle de la venta (cuotas vencidas, saldo vencido, mora, semáforo) y ficha del cliente; comparten `resumirCartera` con la cartera. |
| RF-CAR-04 | Debe | ✅ | `GET /cartera` y `/cartera/reporte` por proyecto y consolidado, con enlace a la venta. |
| RF-CAR-06 | Debería | ❌ | Depende de la confirmación del cliente sobre cómo se cobra la mora. |

### Egresos, ingresos y finanzas (EGR)

| ID | Prio. | Estado | Evidencia |
|---|---|---|---|
| RF-EGR-01 | Debe | ✅ | `POST /finanzas/movimientos`. |
| RF-EGR-02 | Debe | ✅ | Soporte o motivo obligatorio (validado en servidor). |
| RF-EGR-03 | Debería | ✅ | Ingresos con categoría y proyecto. |
| RF-EGR-04 | Debe | ✅ | `POST /finanzas/movimientos/:id/anular` (solo gerente). |
| RF-EGR-05 | Debe | ✅ | `finanzas/proyecto-finanzas.ts`: utilidad por proyecto. |
| RF-EGR-06 | Debe | ✅ | Vendido, recaudado y saldo por cobrar por proyecto. |
| RF-EGR-07 | Debe | ✅ | `GET /finanzas/consolidado` por rango de fechas. |
| RF-EGR-08 | Debe | ✅ | `GET /finanzas/proyectos/:id` y `ProyectoFinanzasPage` (CC-01). |
| RF-EGR-09 | Debería | ✅ | Tercero (nombre y documento) y número de factura en cada movimiento. |

### Auditoría (AUD)

| ID | Prio. | Estado | Evidencia |
|---|---|---|---|
| RF-AUD-01 | Debe | ✅ | `registrarAuditoria` en cada escritura; `auditoria/cobertura.spec.ts` lo exige. |
| RF-AUD-02 | Debe | ✅ | `GET /auditoria` y pantalla con filtros (solo gerente). |
| RF-AUD-03 | Debe | ✅ | Trigger `RegistroAuditoria_inmutable`; prueba `auditoria.e2e-spec.ts`. |

### Migración desde Excel (MIG)

| ID | Prio. | Estado | Evidencia |
|---|---|---|---|
| RF-MIG-01 | Debe | ✅ | `GET /importacion/plantilla` (borrador: se ajusta al Excel real). |
| RF-MIG-02 | Debe | ✅ | `POST /importacion/validar` no guarda nada. |
| RF-MIG-03 | Debe | ✅ | `POST /importacion/confirmar` exige la huella y guarda todo o nada. |
| RF-MIG-04 | Debe | ✅ | Recibos de la serie `H-` marcados como históricos. |
| RF-MIG-05 | Debería | ✅ | Conciliación en pantalla y en Excel. |

### Reportes (REP) y maquinaria (MAQ)

| ID | Prio. | Estado | Evidencia |
|---|---|---|---|
| RF-REP-03 | Debe | ✅ | `GET /clientes/:id/estado-cuenta` (PDF multipágina) y botón en la ficha. |
| RF-MAQ-01 | Debe | ✅ | Tabla `Equipo` y módulo `equipos/`: nombre, tipo, marca, modelo, año, placa o serie (única) y estado; pantallas Nuevo equipo y ficha. |
| RF-MAQ-02 | Debería | ✅ | Tabla `TipoEquipo`; `POST/PATCH /configuracion/tipos-equipo` (solo gerente); sección "Tipos de equipo" en Configuración; se desactivan, no se borran. |
| RF-MAQ-03 | Debe | ✅ | `reglas-maquinaria.ts` y `crearMovimientoEnTx`: equipo o "general de la flota" y soporte o motivo (también en ingresos); CHECKs y trigger en la base. |
| RF-MAQ-04 | Debería | ✅ | El ingreso en maquinaria exige cliente (nombre y documento) y período alquilado (`periodoDesde` y `periodoHasta`). |
| RF-MAQ-06 | Debería | ✅ | `CategoriaGasto.soloMaquinaria`; la semilla trae combustible, mantenimiento, repuestos, operario y transporte del equipo; el gerente las administra. |
| RF-MAQ-07 | Debe | ✅ | Trigger que impide borrar equipos; baja con motivo (`POST /equipos/:id/baja`), conserva los movimientos y no recibe nuevos; el gerente reactiva. |

## Requerimientos no funcionales

| ID | Estado | Evidencia o pendiente |
|---|---|---|
| RNF-SEG-01 | ⏳ | HTTPS al desplegar. |
| RNF-SEG-02 | ✅ | bcrypt con mínimo 8 caracteres. |
| RNF-SEG-03 | ✅ | `@Permiso` en cada ruta; una ruta sin declarar se rechaza; prueba `app.e2e-spec.ts`. |
| RNF-SEG-04 | ✅ | Alcance por proyecto en servicios; `alcance-servicios.spec.ts`. |
| RNF-SEG-05 | ✅ | Soportes y documentos solo con sesión y permiso. |
| RNF-SEG-06 | ✅ | Bloqueo temporal tras intentos fallidos (`auth.service.ts`). |
| RNF-SEG-07 | 🟡 | `.env` fuera del repositorio; falta la revisión final del repositorio al cierre. |
| RNF-INT-01 | ✅ | `consecutivos.e2e-spec.ts` (50 transacciones simultáneas). |
| RNF-INT-02 | ✅ | `Decimal` en todo el dinero. |
| RNF-INT-03 | ✅ | No hay borrado de información de negocio; todo se anula, desactiva o finaliza. |
| RNF-INT-04 | ✅ | Transacciones en abonos, ventas, cierres e importación; pruebas de reversión. |
| RNF-INT-05 | ✅ | Pruebas de plan de cuotas, abonos, anulación, mora, cierre e importación. |
| RNF-REN-01 | ✅ | Con 10 proyectos, 1.000 lotes y 5.439 abonos, todas las pantallas de consulta responden con p95 de 556 ms o menos (límite 2 s). Ver `docs/rendimiento.md`. |
| RNF-REN-02 | ✅ | Buscar un cliente, abrir su ficha y bajar el estado de cuenta en PDF: 88 ms (límite 1 min). |
| RNF-REN-03 | ✅ | Tablero en PDF/Excel: menos de 0,4 s; exportación completa a Excel: 3 s (límite 10 s). |
| RNF-REN-04 | ✅ | 10 usuarios simultáneos: 0 errores y p95 de 452 ms con pausas de uso real (1,7 s sin pausas, prueba de esfuerzo). Con 30 sin pausas hay degradación (p95 5 s) pero sin errores. |
| RNF-DIS-01 a 03 | ⏳ | Al desplegar (monitoreo, copias diarias y simulacro de restauración). |
| RNF-USA-01 | ✅ | Español de Colombia, `$1.234.567` y dd/mm/aaaa. |
| RNF-USA-02 | ✅ | Clientes, ficha del cliente y Registrar abono: tres pasos (pantalla `ClienteDetallePage`). |
| RNF-USA-03 | ✅ | Mensajes de servidor y formularios en español. |
| RNF-USA-04 y 05 | ⏳ | Capacitación y manual de usuario con capturas. |
| RNF-COM-01 | ⏳ | Prueba en Chrome, Edge y Firefox. |
| RNF-COM-02 | 🟡 | Verificado a 375 px en el navegador; falta una prueba en un Android real. |
| RNF-COM-03 | 🟡 | Los PDF (recibo y cierre) se verificaron por contenido, no renderizados. |
| RNF-MAN-01 | ✅ | Empresa y reglas con números configurables. |
| RNF-MAN-02 | 🟡 | README explica cómo levantar; falta documentación de despliegue. |
| RNF-MAN-03 | 🟡 | Almacenamiento abstraído (`StorageService`) con implementación local; falta la de S3. |
| RNF-LEG-01 | 🟡 | Ya se registra la autorización de datos por cliente (RF-CLI-04); falta la política de tratamiento de datos visible para el cliente. |
| RNF-LEG-02 | ✅ | `GET /exportacion/completa` (solo gerente): un libro de Excel con una hoja por tabla, sin contraseñas; botón en Configuración. Los adjuntos no van en el libro. Los servicios en la nube se contratan al desplegar. |
