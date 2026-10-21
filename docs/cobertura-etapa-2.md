# Cobertura de la Etapa 2

Auditoría del 21/10/2026, hecha después de los pasos 3.1 (comisiones), 3.2 (reportes y panel), 4.1 (notificaciones), 4.2 (verificación de consignaciones) y 5.1 (recuperación de contraseña): cada requerimiento de la Etapa 2 de `docs/requerimientos.md` contra lo que hay hoy en el código. Es una revisión de lectura (rutas, pantallas, esquema, pruebas); no cambia nada del sistema.

**Estados:** ✅ construido y verificado · 🟡 parcial (qué falta en la columna de evidencia) · ❌ falta · ⏸ pospuesto a propósito · ⏳ el código está, pero el efecto real depende de algo externo (aquí, la cuenta de correo de la empresa).

Una etapa se acepta cuando están todos sus **Debe**. Los "Debería" y "Podría" se mueven primero si hay atraso.

## Resumen

| | Total | ✅ | 🟡 | ❌ | ⏸ |
|---|---|---|---|---|---|
| Debe | 19 | 19 | 0 | 0 | 0 |
| Debería | 7 | 7 | 0 | 0 | 0 |
| Podría | 0 | 0 | 0 | 0 | 0 |

Total: 26 requerimientos funcionales de la Etapa 2 (los 24 del reparto original más RF-REP-11 y RF-MAQ-05, que aportaron CC-01 y CC-02).

**La Etapa 2 está completa en código:** los 19 "Debe" y los 7 "Debería" están construidos, con pruebas y verificados en vivo. La auditoría encontró un "Debe" parcial (RF-NOT-01) que se cerró el mismo día (ver abajo). Lo que queda no es código: la cuenta de correo del cliente y la medición de rendimiento de lo nuevo.

## Lo que se encontró y se cerró

| ID | Hallazgo | Estado |
|---|---|---|
| RF-NOT-01 (Debe) | El recibo se enviaba por correo al registrar un abono desde la pantalla de abonos, pero **no** cuando la cuota inicial se recibía al registrar la venta (esa venta crea su abono con `crearAbonoEnTx` directamente). | ✅ Cerrado el 21/10/2026: `VentasService.crear` pide el envío del recibo del abono inicial después de confirmar la venta (`VentasModule` importa `NotificacionesModule`), sin hacer esperar a quien registra y sin romper la venta si el correo falla. Probado en `ventas.service.spec.ts` y en vivo con un servidor de correo de prueba (recibo con su PDF adjunto). |

## Observaciones que no impiden aceptar la etapa

1. **Todo lo que envía correo depende de la cuenta SMTP de Balder** (RF-NOT-01, 02, 03 y RF-USR-06). El código está y está probado de punta a punta contra un servidor SMTP de prueba local (`npm run correo:sumidero`); sin la cuenta real los avisos quedan registrados como "omitidos: correo de la empresa no configurado". Está en los pendientes con el cliente.
2. **Rendimiento (RNF-REN) sin repetir para lo nuevo.** La última medición de `docs/rendimiento.md` cubre los reportes de recaudo, cartera por edades, egresos, inventario y flujo de caja. Todavía no se midieron el informe del proyecto, maquinaria por equipo, el reporte de comisiones, el panel con sus consultas nuevas, `Por verificar` ni el historial de notificaciones. Se repite con `npm run demo:medir` sobre la base de volumen.
3. **RF-REP-11 (flujo de caja) usa definiciones provisionales** de semana (lunes a domingo) y quincena (1 al 15 y 16 al fin de mes), pendientes de confirmar con el cliente (`backend/src/cierres-caja/periodo.ts`). Es una pregunta abierta, no una falta.
4. **RF-REP-01:** el rango de fechas filtra lo que se mueve en el tiempo (recaudado, egresos y utilidad). La cartera y los lotes por estado son la foto de hoy, como corresponde.
5. **Límites conocidos de la etapa** (no son requerimientos de la Etapa 2): no se puede cambiar el vendedor de una venta ya registrada ni generar la comisión si se le agrega un vendedor después; el PDF del reporte de comisiones sale por el motor de reportes, no como un documento aparte; RF-CAR-06 (pagar el interés de mora por separado) sigue en espera de lo que confirme el cliente y es de la Etapa 1.

## Requerimientos funcionales

### Configuración

| ID | Prioridad | Estado | Evidencia |
|---|---|---|---|
| RF-CFG-09 | Debe | ✅ | `PUT /configuracion/comisiones/:tipo` (solo gerente), sección "Comisiones" de la pantalla de Configuración, valor por tipo de vendedor guardado en `ComisionTipoVendedor` (la semilla trae $1.000.000 y $500.000 como valores iniciales editables); auditoría `CONFIGURACION_COMISION`; prueba en `configuracion.service.spec.ts`. |

### Usuarios

| ID | Prioridad | Estado | Evidencia |
|---|---|---|---|
| RF-USR-06 | Debería | ✅ ⏳ | `POST /auth/recuperar` y `POST /auth/restablecer` (públicas), tabla `RecuperacionPassword` con solo la huella del token y trigger de uso único, tope por hora y vigencia configurables, pantallas `/recuperar` y `/restablecer`; `recuperacion.service.spec.ts` y `test/recuperacion.e2e-spec.ts` (12 pruebas); verificado en vivo (25/25) y en el navegador. El correo real depende de la cuenta SMTP. |

### Recibos y cartera

| ID | Prioridad | Estado | Evidencia |
|---|---|---|---|
| RF-REC-10 | Debería | ✅ | Estado de verificación en `Abono` (por verificar / verificado / no requiere) según la configuración de cada medio de pago, trigger que solo admite pasar a verificado, `GET /abonos/por-verificar`, `POST /abonos/verificar` y `/abonos/:id/verificar` (permiso `abonos.verificar`, auditoría `ABONO_VERIFICAR`), pantalla `Por verificar`, etiquetas en la venta y Recibos; `verificacion.service.spec.ts`, `test/verificacion.e2e-spec.ts` (14 pruebas); verificado en vivo (36/36) y en el navegador. |
| RF-CAR-05 | Debería | ✅ | Reporte `cartera-edades` con los tramos 1–30, 31–60, 61–90 y más de 90 días (`reportes/constructores/cartera-edades.ts`, función `tramoDeMora`), en pantalla, PDF y Excel; `constructores.spec.ts` y e2e de reportes cuadrando con la cartera real. |

### Notificaciones

| ID | Prioridad | Estado | Evidencia |
|---|---|---|---|
| RF-NOT-01 | Debe | ✅ ⏳ | Recibo en PDF por correo al registrar un abono desde la pantalla de abonos **y** al recibir la cuota inicial al registrar la venta (`NotificacionesService.enviarReciboAlRegistrar`, apagable en Configuración, reenvío manual); verificado de punta a punta contra un servidor SMTP de prueba (correo con su PDF adjunto y las respuestas dirigidas al correo de contacto de la empresa). El correo real depende de la cuenta SMTP de Balder. |
| RF-NOT-02 | Debe | ✅ ⏳ | `RecordatoriosService.enviarRecordatoriosPendientes`, cron diario 8:00 hora de Bogotá, con los días de aviso configurables (`diasAntesRecordatorio`) y botón manual en el panel; cobra solo el saldo de la cuota (descuenta abonos parciales); `recordatorios.service.spec.ts` y e2e. |
| RF-NOT-03 | Debe | ✅ ⏳ | `enviarAvisosMora`, cron a las 8:05, un correo por venta con sus cuotas vencidas y el total, cada `diasEntreAvisosMora` días (configurable), respetando los días de gracia; `aviso-mora.ts` y pruebas. No incluye el interés de mora hasta definir RF-CAR-06. |
| RF-NOT-04 | Debe | ✅ | `POST /notificaciones/whatsapp` arma el mensaje y el enlace `wa.me` (celular colombiano normalizado) para recibo, recordatorio o mora; botones en el abono recién registrado, la venta, Cartera y la ficha del cliente; `telefono.ts`, `mensajes.ts` y sus pruebas. El sistema no envía nada (alcance acordado). |
| RF-NOT-05 | Debe | ✅ | Reclamo atómico de la cuota antes de enviar (`updateMany` con la condición) y un índice único parcial en la base: una cuota no puede tener dos recordatorios por correo enviados; probado en `test/notificaciones.e2e-spec.ts`. |
| RF-NOT-06 | Debería | ✅ | Tabla `Notificacion` inmutable (tipo, canal, estado, destinatario, quién, cuándo, detalle del error), `GET /notificaciones` con filtros y alcance por proyecto, pantalla Notificaciones y sección "Avisos enviados" en el cliente y la venta. |
| RF-NOT-07 | Debería | ✅ | Tarjeta "Pagos por verificar contra el extracto" en el panel con cantidad, valor y antigüedad del más antiguo, en rojo desde `diasAlertaVerificacion`; `dashboard.service.spec.ts`. |

### Comisiones

| ID | Prioridad | Estado | Evidencia |
|---|---|---|---|
| RF-COM-01 | Debe | ✅ | `generarComisionEnTx`: una comisión por venta con vendedor, con el valor de su tipo congelado, al activarse la venta o aprobarse la excepción; si el valor configurado es $0 no se genera; `reglas-comision.spec.ts` y `test/comisiones.e2e-spec.ts`. |
| RF-COM-02 | Debe | ✅ | Estados pendiente, pagada (fecha, medio, cuenta, referencia y soporte o motivo) y anulada (con motivo), con trigger de inmutabilidad y restricciones de coherencia; pantalla Comisiones con pagar y anular. |
| RF-COM-03 | Debe | ✅ | `pagarComisionEnTx` crea el egreso en la categoría de sistema Comisiones, con el proyecto de la venta; al anular una comisión pagada se anula también su egreso; Finanzas impide anular ese egreso por separado. |
| RF-COM-04 | Debería | ✅ | En el formulario de desistimiento, si la comisión está pendiente se ofrece anularla junto con el desistimiento, y si ya se pagó se avisa que no se toca y cómo recuperarla; `ventas.service.ts` (`anularComision`). |

### Panel y reportes

| ID | Prioridad | Estado | Evidencia |
|---|---|---|---|
| RF-REP-01 | Debe | ✅ | Panel con filtro por rango de fechas y proyecto: recaudado, egresos, utilidad del período, cartera al día / por vencer en los próximos días / vencida, interés de mora y lotes por estado; exporta a PDF y Excel; `dashboard.service.spec.ts`, `cartera.service.spec.ts`. |
| RF-REP-02 | Debería | ✅ | Sección "Pendientes" del panel: comisiones por pagar, cierres de caja por aprobar y pagos por verificar (cada una solo para quien tiene el permiso correspondiente). |
| RF-REP-04 | Debe | ✅ | Reporte `recaudo` por fechas, proyecto, medio de pago, cuenta y usuario, con resumen por medio, cuenta, usuario y verificación bancaria, y detalle con el recibo de cada abono. |
| RF-REP-05 | Debe | ✅ | Reporte `cartera-edades` (ver RF-CAR-05). |
| RF-REP-06 | Debe | ✅ | Reporte `egresos` por categoría y por proyecto (con filtro de categoría), cruzado, incluyendo nómina y comisiones. |
| RF-REP-07 | Debe | ✅ | Reporte `inventario-lotes` por estado con cantidades y valor de lista, con detalle lote por lote al elegir un estado. |
| RF-REP-08 | Debe | ✅ | Reporte `comisiones` por estado, por vendedor y detalle, con filtros de vendedor, estado, proyecto y fechas (de la venta o del pago). |
| RF-REP-09 | Debe | ✅ | Reporte `informe-proyecto` de un solo proyecto (ventas y cobros, ingresos/egresos/utilidad, egresos por categoría, cartera por edad y lotes); el socio (Consulta limitado a un proyecto) solo puede pedir el suyo (404 con otro); verificado en vivo. |
| RF-REP-10 | Debe | ✅ | Los 8 reportes, el panel y el listado de comisiones se descargan en PDF y en Excel (`GET /reportes/:clave/exportar?formato=pdf\|excel`, `/dashboard/exportar`, `/comisiones/exportar`); los PDF se vieron renderizados; `generadores.spec.ts`. |
| RF-REP-11 | Debe | ✅ | Reporte `flujo-caja` por día, semana, quincena o mes, de toda la empresa o de un proyecto, con ingresos, egresos y saldo acumulado, en PDF y Excel; cuadra con el consolidado (e2e). La semana y la quincena son definiciones provisionales. |

### Maquinaria

| ID | Prioridad | Estado | Evidencia |
|---|---|---|---|
| RF-MAQ-05 | Debe | ✅ | Reporte `maquinaria-equipos`: ingresos, egresos y utilidad por equipo en un solo listado comparable, con los gastos de la flota en una fila aparte, por rango de fechas, en PDF y Excel; `constructores-informes.spec.ts` y verificado en vivo contra los datos de la demostración. |

## Cómo se verificó

- **Pruebas automáticas hoy:** 921 unitarias y 217 e2e (contra Postgres real) pasan; tsc y lint limpios en backend y frontend.
- **Verificación en vivo** contra la base de demostración, paso por paso: comisiones (44/44), reportes y panel (26/26), notificaciones (31/31), verificación (36/36) y recuperación de contraseña (25/25), además de las pantallas vistas en el navegador a 360 px.
- **Lo que no se puede verificar sin el cliente:** el envío real de correos (cuenta SMTP) y las definiciones de semana y quincena.

## Siguiente paso sugerido

1. Configurar la cuenta de correo del cliente (se recomienda una cuenta exclusiva para el sistema, a nombre de la empresa) y comprobarla con **Configuración → Correo de avisos → Enviar correo de prueba**.
2. Repetir la medición de rendimiento con los reportes y pantallas nuevos.
3. Con eso la Etapa 2 se puede aceptar.
