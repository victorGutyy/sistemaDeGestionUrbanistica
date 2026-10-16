# Especificación de requerimientos — Sistema de gestión Balder Ingeniería

15 oct 2026 · Víctor Gutierrez

## Introducción

Este documento reúne 112 requerimientos funcionales y 32 no funcionales del sistema de gestión para Balder Ingeniería y Mantenimiento SAS. Es la base para el desarrollo, las pruebas de aceptación y el control de cambios del alcance.

Fuentes: formulario de levantamiento (14 de octubre de 2026), entrevista y acta de reunión (14 de octubre de 2026), propuesta formal y base existente Urbanix (manual v1.0).

Reparto por etapa (verificado): Etapa 1 = 77 requerimientos funcionales (68 "Debe"), Etapa 2 = 24, Etapa 3 = 11.

Los cambios de alcance posteriores a esta versión se registran en la sección **Control de cambios** (al final). Los cambios CC-01 (11 requerimientos) y CC-02 (8 requerimientos) agregan 19 requerimientos funcionales sin alterar los 112 originales.

## Convenciones

| Elemento | Significado |
|---|---|
| RF-XXX-00 | Requerimiento funcional; las letras indican el módulo |
| RNF-XXX-00 | Requerimiento no funcional |
| Debe | Obligatorio para aceptar la etapa |
| Debería | Importante; se entrega en la etapa si no pone en riesgo la fecha |
| Podría | Deseable; se puede mover a una etapa posterior |
| Etapa 1, 2, 3 | Etapa de entrega según la propuesta formal |

## Actores del sistema

| Actor | Descripción |
|---|---|
| Gerente | Control total: configuración, usuarios, aprobación de cierres y excepciones, auditoría |
| Administrador | Operación diaria: ventas, abonos, egresos, cierres de caja, personal |
| Consulta | Solo lectura; puede tener acceso a todos los proyectos o solo a algunos (por ejemplo, el socio de La Floresta) |
| Cliente comprador | No ingresa al sistema; recibe recibos, recordatorios y avisos |
| Sistema | Procesos automáticos: mora, recordatorios, consecutivos |

---

## RF — Configuración, usuarios y seguridad

### Configuración de la empresa (CFG)

| ID | Requerimiento | Prioridad | Etapa |
|---|---|---|---|
| RF-CFG-01 | El gerente registra y edita los datos de la empresa: razón social, nombre comercial, NIT, dirección, teléfonos, correo, logo y color principal | Debe | 1 |
| RF-CFG-02 | Los datos de la empresa aparecen en pantallas, recibos, reportes y correos sin estar escritos en el código | Debe | 1 |
| RF-CFG-03 | El gerente configura los parámetros de venta: porcentaje de cuota inicial por defecto (30 %), plazo máximo (12 meses) y tasa de financiación por defecto (0 %) | Debe | 1 |
| RF-CFG-04 | El gerente configura la tasa de interés de mora mensual y los días de gracia antes de cobrarla | Debe | 1 |
| RF-CFG-05 | El gerente configura los días antes del vencimiento en que el semáforo pasa a amarillo | Debe | 1 |
| RF-CFG-06 | El gerente administra las cuentas de recaudo (banco, tipo, número, alias), como Bancolombia y Davivienda | Debe | 1 |
| RF-CFG-07 | El gerente activa o desactiva medios de pago: efectivo, consignación, transferencia, Nequi y Daviplata | Debe | 1 |
| RF-CFG-08 | El gerente administra las categorías de gasto | Debe | 1 |
| RF-CFG-09 | El gerente configura el valor fijo de comisión por tipo de vendedor (asesor inmobiliario: $1.000.000; referido: $500.000) | Debe | 2 |
| RF-CFG-10 | El gerente define el texto legal del pie de los recibos | Debería | 1 |

### Usuarios, roles y acceso (USR)

| ID | Requerimiento | Prioridad | Etapa |
|---|---|---|---|
| RF-USR-01 | Ingreso con correo y contraseña; no existe registro público | Debe | 1 |
| RF-USR-02 | Roles Gerente, Administrador y Consulta, con permisos distintos | Debe | 1 |
| RF-USR-03 | El rol Consulta puede limitarse a uno o varios proyectos | Debe | 1 |
| RF-USR-04 | El gerente crea, edita, desactiva y reactiva usuarios sin borrar su historial | Debe | 1 |
| RF-USR-05 | El gerente restablece la contraseña de un usuario | Debe | 1 |
| RF-USR-06 | El usuario recupera su contraseña por correo con un enlace de un solo uso | Debería | 2 |
| RF-USR-07 | La sesión se cierra sola tras un tiempo de inactividad configurable | Debe | 1 |
| RF-USR-08 | El sistema permite agregar roles nuevos (por ejemplo, jurídico) sin reescribir el código | Debería | 1 |
| RF-USR-09 | Un usuario no puede desactivar su propia cuenta | Debe | 1 |

---

## RF — Proyectos, lotes, clientes y ventas

### Proyectos y lotes (PRY)

| ID | Requerimiento | Prioridad | Etapa |
|---|---|---|---|
| RF-PRY-01 | Crear un proyecto con nombre, ubicación, municipio, área total, valor y fecha de compra del predio | Debe | 1 |
| RF-PRY-02 | Organizar un proyecto en manzanas; las manzanas son opcionales | Debe | 1 |
| RF-PRY-03 | Crear lotes con número, manzana, área, medidas o linderos, valor por m² opcional y precio de venta | Debe | 1 |
| RF-PRY-04 | Mostrar área total, subdividida y disponible del proyecto, y advertir si un lote excede el área disponible | Debe | 1 |
| RF-PRY-05 | Manejar los estados del lote: disponible, separado, vendido, escriturado y desistido | Debe | 1 |
| RF-PRY-06 | Cambiar el estado del lote solo mediante acciones del sistema (separar, vender, escriturar, desistir), registrando fecha y usuario | Debe | 1 |
| RF-PRY-07 | Registrar cambios de precio de un lote con fecha, usuario y valor anterior | Debe | 1 |
| RF-PRY-08 | Finalizar y reactivar un proyecto; un proyecto finalizado no admite lotes nuevos y conserva su historial | Debe | 1 |
| RF-PRY-09 | Consultar los lotes por proyecto, manzana y estado, con filtros y búsqueda | Debe | 1 |
| RF-PRY-10 | Marcar el lote como escriturado con fecha y datos de la escritura cuando el cliente termina de pagar | Debería | 1 |

### Clientes (CLI)

| ID | Requerimiento | Prioridad | Etapa |
|---|---|---|---|
| RF-CLI-01 | Registrar clientes con nombre, tipo y número de documento, teléfono, correo y dirección | Debe | 1 |
| RF-CLI-02 | Impedir clientes duplicados por número de documento | Debe | 1 |
| RF-CLI-03 | Ver la ficha del cliente con sus lotes, ventas, abonos, saldo y estado de mora | Debe | 1 |
| RF-CLI-04 | Registrar la autorización de tratamiento de datos personales del cliente | Debería | 1 |

### Ventas (VEN)

| ID | Requerimiento | Prioridad | Etapa |
|---|---|---|---|
| RF-VEN-01 | Separar un lote con valor y fecha límite opcionales antes de formalizar la venta | Debe | 1 |
| RF-VEN-02 | Registrar una venta de contado o financiada | Debe | 1 |
| RF-VEN-03 | Definir la cuota inicial en porcentaje o en valor; por defecto, el porcentaje configurado | Debe | 1 |
| RF-VEN-04 | Generar automáticamente el plan de cuotas mensuales sin interés, con fechas y valores | Debe | 1 |
| RF-VEN-05 | Exigir motivo y autorización del gerente cuando la cuota inicial sea menor a la configurada o el plazo supere el máximo | Debe | 1 |
| RF-VEN-06 | Adjuntar a la venta uno o varios documentos firmados (PDF o imagen) | Debe | 1 |
| RF-VEN-07 | Registrar el vendedor de la venta: asesor inmobiliario o referido, con nombre, documento y teléfono | Debe | 1 |
| RF-VEN-08 | Registrar el desistimiento de una venta con motivo, fecha y valor a devolver o retener, sin borrar sus abonos ni recibos | Debe | 1 |
| RF-VEN-09 | Permitir más de un comprador por venta (copropietarios) | Podría | 1 |
| RF-VEN-10 | Consultar el detalle de la venta: plan de cuotas con su estado, abonos, saldo y documentos | Debe | 1 |

---

## RF — Abonos, recibos, cierre de caja y cartera

### Abonos y recibos de caja (REC)

| ID | Requerimiento | Prioridad | Etapa |
|---|---|---|---|
| RF-REC-01 | Registrar un abono con venta, valor, fecha, medio de pago, cuenta destino, referencia y usuario que lo recibe | Debe | 1 |
| RF-REC-02 | Adjuntar el soporte de pago del cliente (foto o PDF) al abono | Debe | 1 |
| RF-REC-03 | Aplicar el abono a las cuotas en orden de vencimiento, permitiendo abonos parciales y abonos que cubren varias cuotas | Debe | 1 |
| RF-REC-04 | Generar al guardar el abono un recibo de caja en PDF con consecutivo único, sin repetidos ni saltos | Debe | 1 |
| RF-REC-05 | El recibo incluye datos de la empresa, número, fecha, cliente, proyecto, manzana, lote, valor en números y letras, medio de pago, cuotas cubiertas, saldo anterior, saldo nuevo y quien recibió | Debe | 1 |
| RF-REC-06 | Un recibo emitido no se puede editar ni borrar | Debe | 1 |
| RF-REC-07 | Anular un recibo con motivo obligatorio, usuario y fecha; el recibo queda visible con la marca "ANULADO" | Debe | 1 |
| RF-REC-08 | Al anular un recibo se revierte su efecto en cuotas y saldo, y el consecutivo no se reutiliza | Debe | 1 |
| RF-REC-09 | Volver a descargar o imprimir cualquier recibo en cualquier momento | Debe | 1 |
| RF-REC-10 | Los abonos por consignación o transferencia quedan "por verificar" hasta que el administrador los confirma contra el extracto | Debería | 2 |

### Cierre de caja (CAJ)

| ID | Requerimiento | Prioridad | Etapa |
|---|---|---|---|
| RF-CAJ-01 | El administrador genera un cierre de caja diario, semanal o quincenal | Debe | 1 |
| RF-CAJ-02 | El cierre muestra abonos y egresos del período, con totales por medio de pago y por cuenta | Debe | 1 |
| RF-CAJ-03 | El cierre compara el efectivo esperado con el efectivo contado y muestra la diferencia | Debe | 1 |
| RF-CAJ-04 | El cierre pasa por los estados borrador, cerrado (administrador) y aprobado o devuelto con observación (gerente) | Debe | 1 |
| RF-CAJ-05 | Los movimientos de un cierre aprobado no se pueden editar; solo se anulan, y la anulación aparece en el siguiente cierre | Debe | 1 |
| RF-CAJ-06 | Exportar el cierre de caja a PDF | Debería | 1 |

### Cartera y mora (CAR)

| ID | Requerimiento | Prioridad | Etapa |
|---|---|---|---|
| RF-CAR-01 | Asignar a cada cliente un semáforo: verde (al día), amarillo (próximo a vencer) y rojo (en mora) | Debe | 1 |
| RF-CAR-02 | Calcular el interés de mora solo sobre el saldo vencido, con la tasa y los días de gracia configurados | Debe | 1 |
| RF-CAR-03 | Generar el estado de cuenta del cliente: total vendido, pagado, saldo, cuotas vencidas, interés de mora y próxima cuota | Debe | 1 |
| RF-CAR-04 | Consultar la cartera vencida por proyecto y consolidada, con acceso directo a la venta de cada cliente | Debe | 1 |
| RF-CAR-05 | Clasificar la cartera por edades de mora (1–30, 31–60, 61–90 y más de 90 días) | Debería | 2 |
| RF-CAR-06 | Registrar el pago del interés de mora por separado del abono a capital | Debería | 1 |

---

## RF — Ingresos y egresos, auditoría y migración

### Ingresos y egresos (EGR)

| ID | Requerimiento | Prioridad | Etapa |
|---|---|---|---|
| RF-EGR-01 | Registrar un egreso con fecha, valor, categoría, proyecto (o gastos generales), descripción, medio de pago, cuenta y usuario | Debe | 1 |
| RF-EGR-02 | Exigir soporte adjunto en cada egreso, o un motivo cuando no exista soporte | Debe | 1 |
| RF-EGR-03 | Registrar ingresos que no vienen de ventas (por ejemplo, otros servicios) con categoría y proyecto | Debería | 1 |
| RF-EGR-04 | Anular un egreso con motivo, sin borrarlo | Debe | 1 |
| RF-EGR-05 | Calcular la utilidad por proyecto: recaudado (cuotas iniciales y abonos no anulados) menos egresos del proyecto | Debe | 1 |
| RF-EGR-06 | Mostrar por proyecto el valor total vendido, el recaudado y el saldo por cobrar | Debe | 1 |
| RF-EGR-07 | Mostrar el consolidado de ingresos, egresos y saldo de la empresa por rango de fechas | Debe | 1 |

### Auditoría (AUD)

| ID | Requerimiento | Prioridad | Etapa |
|---|---|---|---|
| RF-AUD-01 | Registrar quién creó, modificó o anuló ventas, abonos, recibos, egresos, cierres, precios, estados de lote, configuración y usuarios, con fecha, hora y valores antes y después | Debe | 1 |
| RF-AUD-02 | El gerente consulta la auditoría con filtros por fecha, usuario y tipo de registro | Debe | 1 |
| RF-AUD-03 | Ningún usuario puede editar ni borrar los registros de auditoría | Debe | 1 |

### Migración desde Excel (MIG)

| ID | Requerimiento | Prioridad | Etapa |
|---|---|---|---|
| RF-MIG-01 | Descargar plantillas de Excel para proyectos y lotes, clientes, ventas con su plan de cuotas y abonos históricos | Debe | 1 |
| RF-MIG-02 | Cargar las plantillas en modo de prueba, que valida y muestra errores y diferencias sin guardar | Debe | 1 |
| RF-MIG-03 | Guardar la carga solo con confirmación del usuario | Debe | 1 |
| RF-MIG-04 | Marcar los abonos históricos como importados, con una serie de recibos distinta a la real | Debe | 1 |
| RF-MIG-05 | Generar un reporte de conciliación de saldos importados para revisarlo con el gerente | Debería | 1 |

---

## RF — Notificaciones, comisiones, panel y reportes

### Notificaciones (NOT)

| ID | Requerimiento | Prioridad | Etapa |
|---|---|---|---|
| RF-NOT-01 | Enviar el recibo en PDF al correo del cliente al registrar un abono | Debe | 2 |
| RF-NOT-02 | Enviar recordatorios de cuota antes del vencimiento, con los días configurados | Debe | 2 |
| RF-NOT-03 | Enviar avisos de mora periódicos a clientes con cuotas vencidas | Debe | 2 |
| RF-NOT-04 | Abrir WhatsApp con el número del cliente y el mensaje prellenado (recibo, recordatorio o aviso de mora) | Debe | 2 |
| RF-NOT-05 | No enviar dos veces el mismo recordatorio para la misma cuota | Debe | 2 |
| RF-NOT-06 | Registrar cada notificación con tipo, canal, fecha, destinatario y resultado | Debería | 2 |
| RF-NOT-07 | Alertar en el panel sobre consignaciones pendientes de verificar y su antigüedad | Debería | 2 |

### Comisiones (COM)

| ID | Requerimiento | Prioridad | Etapa |
|---|---|---|---|
| RF-COM-01 | Generar la comisión automáticamente al registrar una venta con vendedor, con el valor fijo de su tipo | Debe | 2 |
| RF-COM-02 | Manejar los estados de la comisión: pendiente, pagada (fecha, medio y soporte) y anulada (con motivo) | Debe | 2 |
| RF-COM-03 | Al pagar una comisión, crear automáticamente el egreso en la categoría Comisiones del proyecto | Debe | 2 |
| RF-COM-04 | Al desistir una venta, avisar si su comisión está pendiente o pagada para que el gerente decida | Debería | 2 |

### Panel y reportes (REP)

| ID | Requerimiento | Prioridad | Etapa |
|---|---|---|---|
| RF-REP-01 | Panel del gerente por rango de fechas y proyecto: recaudado, egresos, utilidad, cartera al día, por vencer y vencida, interés de mora y lotes por estado | Debe | 2 |
| RF-REP-02 | Mostrar en el panel comisiones pendientes, cierres por aprobar y consignaciones por verificar | Debería | 2 |
| RF-REP-03 | Reporte de estado de cuenta por cliente | Debe | 1 |
| RF-REP-04 | Reporte de recaudo por fechas, proyecto, medio de pago, cuenta y usuario | Debe | 2 |
| RF-REP-05 | Reporte de cartera por edades de mora | Debe | 2 |
| RF-REP-06 | Reporte de egresos por categoría y proyecto | Debe | 2 |
| RF-REP-07 | Reporte de inventario de lotes por estado | Debe | 2 |
| RF-REP-08 | Reporte de comisiones por vendedor, estado y fechas | Debe | 2 |
| RF-REP-09 | Informe de proyecto para el socio: ventas, recaudo, egresos, utilidad y cartera de un solo proyecto | Debe | 2 |
| RF-REP-10 | Exportar todos los reportes a PDF y Excel | Debe | 2 |

---

## RF — Personal

El módulo de personal registra y controla; no liquida nómina ni transmite a la DIAN.

| ID | Requerimiento | Prioridad | Etapa |
|---|---|---|---|
| RF-PER-01 | Registrar trabajadores con nombre, documento, teléfono, contacto de emergencia, cargo, valor acordado y periodicidad de pago (semanal o quincenal) | Debe | 3 |
| RF-PER-02 | Registrar el tipo de contrato (por defecto obra o labor), fecha de ingreso, fecha de salida y motivo | Debe | 3 |
| RF-PER-03 | Asignar trabajadores a proyectos y conservar el historial de asignaciones | Debe | 3 |
| RF-PER-04 | Registrar afiliaciones a EPS, fondo de pensión, caja de compensación y ARL (con clase de riesgo), con fecha y certificado adjunto | Debe | 3 |
| RF-PER-05 | Alertar sobre trabajadores activos sin alguna afiliación o sin certificado | Debería | 3 |
| RF-PER-06 | Adjuntar documentos del trabajador: contrato, cartas de renuncia, certificados y otros | Debe | 3 |
| RF-PER-07 | Registrar pagos por período con valor devengado, novedades digitadas (horas extra, descuentos, anticipos, incapacidades) y valor neto | Debe | 3 |
| RF-PER-08 | Generar el recibo de pago de nómina en PDF con consecutivo propio, descargable y enviable por correo | Debe | 3 |
| RF-PER-09 | Cada pago crea un egreso en la categoría Nómina del proyecto asignado (o gastos generales) | Debe | 3 |
| RF-PER-10 | Reporte de costo de mano de obra por proyecto y por período | Debe | 3 |
| RF-PER-11 | Listado de personal activo con sus afiliaciones, exportable a Excel para el contador y la PILA | Debería | 3 |

---

## Requerimientos no funcionales

Todos son de prioridad Debe, salvo que se indique otra cosa. Cada uno incluye cómo se verifica en las pruebas de aceptación.

### Seguridad (SEG)

| ID | Requerimiento | Cómo se verifica |
|---|---|---|
| RNF-SEG-01 | Toda la comunicación viaja cifrada por HTTPS | El navegador muestra conexión segura; HTTP redirige a HTTPS |
| RNF-SEG-02 | Las contraseñas se guardan con un algoritmo de hash seguro (bcrypt o argon2) y tienen mínimo 8 caracteres | Revisión de código y prueba de registro |
| RNF-SEG-03 | Los permisos se validan en el servidor en cada operación, no solo ocultando botones | Una cuenta de Consulta que llama directo al servicio para guardar recibe rechazo |
| RNF-SEG-04 | Un usuario de Consulta limitado a un proyecto no puede ver datos de otros proyectos por ningún medio | Prueba con usuario del socio de La Floresta |
| RNF-SEG-05 | Los archivos adjuntos solo se descargan con sesión válida y permiso sobre el registro | Enlace de un soporte abierto sin sesión es rechazado |
| RNF-SEG-06 | Bloqueo temporal de la cuenta tras 5 intentos fallidos de ingreso | Prueba con contraseña errónea |
| RNF-SEG-07 | Ningún secreto (claves, contraseñas de servicios) está escrito en el código fuente | Revisión del repositorio |

### Integridad de la información (INT)

| ID | Requerimiento | Cómo se verifica |
|---|---|---|
| RNF-INT-01 | El consecutivo de recibos es único aun con registros simultáneos | Prueba automática de concurrencia |
| RNF-INT-02 | Los valores de dinero se guardan como enteros o decimales exactos, nunca como punto flotante | Revisión del modelo de datos |
| RNF-INT-03 | La información de negocio no se borra; se anula, desactiva o finaliza | No existe opción de borrado en ventas, abonos, recibos ni egresos |
| RNF-INT-04 | Las operaciones de dinero se ejecutan en transacciones: se guardan completas o no se guardan | Prueba con error simulado a mitad de un abono |
| RNF-INT-05 | La lógica de dinero (plan de cuotas, aplicación de abonos, anulación, mora, cierre) tiene pruebas automáticas | Reporte de pruebas en verde |

### Rendimiento (REN)

| ID | Requerimiento | Cómo se verifica |
|---|---|---|
| RNF-REN-01 | Las pantallas de consulta cargan en menos de 2 segundos con conexión normal | Medición con 10 proyectos, 1.000 lotes y 5.000 abonos de prueba |
| RNF-REN-02 | El estado de cuenta de un cliente se obtiene en menos de 1 minuto desde que se busca | Prueba cronometrada con el administrador |
| RNF-REN-03 | Los reportes en PDF o Excel se generan en menos de 10 segundos | Prueba con el volumen de RNF-REN-01 |
| RNF-REN-04 | El sistema soporta al menos 10 usuarios simultáneos sin degradarse | Prueba de carga básica |

### Disponibilidad y respaldo (DIS)

| ID | Requerimiento | Cómo se verifica |
|---|---|---|
| RNF-DIS-01 | Disponibilidad mínima de 99 % mensual, excluyendo mantenimientos avisados | Monitoreo del servidor |
| RNF-DIS-02 | Copia de seguridad automática diaria de la base de datos y los adjuntos, conservada al menos 30 días | Registro de copias y prueba de restauración |
| RNF-DIS-03 | Restauración completa posible en menos de 4 horas ante una falla | Simulacro de restauración |

### Usabilidad (USA)

| ID | Requerimiento | Cómo se verifica |
|---|---|---|
| RNF-USA-01 | Interfaz en español de Colombia, con fechas dd/mm/aaaa y moneda $1.234.567 | Revisión de pantallas |
| RNF-USA-02 | Registrar un abono toma máximo 3 pasos desde la ficha del cliente | Prueba con el administrador |
| RNF-USA-03 | Mensajes de error claros que dicen qué pasó y cómo corregirlo | Revisión de formularios |
| RNF-USA-04 | Un usuario nuevo aprende las tareas básicas en una sesión de capacitación de 2 horas | Observación en la capacitación |
| RNF-USA-05 | Manual de usuario en español con capturas de pantalla | Entrega del manual |

### Compatibilidad (COM)

| ID | Requerimiento | Cómo se verifica |
|---|---|---|
| RNF-COM-01 | Funciona en las dos últimas versiones de Chrome, Edge y Firefox | Prueba en cada navegador |
| RNF-COM-02 | Diseño adaptable al celular desde 360 px de ancho; registrar abonos y consultar estados de cuenta funciona en un Android de gama media | Prueba en celular real |
| RNF-COM-03 | Exportaciones que abren correctamente en Excel y en cualquier lector de PDF | Apertura de los archivos generados |

### Mantenibilidad y portabilidad (MAN)

| ID | Requerimiento | Cómo se verifica |
|---|---|---|
| RNF-MAN-01 | Datos de la empresa y reglas de negocio con números son configurables; no están escritos en el código | Cambio de NIT o tasa de mora desde la configuración, sin tocar código |
| RNF-MAN-02 | Código en repositorio Git, con documentación de instalación y despliegue | Revisión del repositorio |
| RNF-MAN-03 | Almacenamiento de archivos intercambiable (disco local o servicio compatible con S3) sin cambiar la lógica de negocio | Revisión de arquitectura |

### Legal y cumplimiento (LEG)

| ID | Requerimiento | Cómo se verifica |
|---|---|---|
| RNF-LEG-01 | Tratamiento de datos personales conforme a la Ley 1581 de 2012 | Autorización registrada por cliente y política de datos disponible |
| RNF-LEG-02 | Los servicios en la nube se contratan a nombre de la empresa, y la empresa puede exportar todos sus datos a Excel en cualquier momento | Exportación completa de datos |

---

## Restricciones, fuera del alcance y puntos por confirmar

### Restricciones

- Aplicación web en la nube; no se instala en los equipos.
- Base de datos relacional PostgreSQL.
- Se construye sobre la base genérica Urbanix; el desarrollador conserva sus derechos (Forma A de la propuesta).
- Los servicios en la nube y el dominio se contratan a nombre de la empresa y los paga la empresa.
- Presupuesto del desarrollo: $10.000.000 COP en tres etapas; cronograma de unas 11 semanas desde la aprobación.

### Fuera del alcance

- Liquidación automática de nómina, seguridad social y prestaciones, y transmisión de nómina electrónica a la DIAN.
- Contabilidad general.
- Facturación electrónica.
- Pagos en línea (PSE y tarjetas).
- Firma electrónica dentro de la plataforma. Para la carta de descuento de préstamos (CC-01) se genera el PDF y se adjunta firmado en papel; la firma electrónica queda como adicional.
- Portal del cliente, PQRS y app móvil nativa.
- Contratos de alquiler de maquinaria con tarifas, horómetro, cartera de cobros y alertas de mantenimiento (CC-02 incluye solo el registro de equipos y su utilidad).
- Integración de la página web y registro de la línea de reformas de casas (se cotizan aparte). Excepción registrada en CC-01: solo se incluye el seguimiento de ingresos y egresos de los proyectos de remodelación; cotizaciones, avance y presupuesto de obra siguen fuera.

### Puntos por confirmar con la empresa

| Punto | Requerimientos afectados |
|---|---|
| Tasa exacta de interés de mora y desde qué día se cobra | RF-CFG-04, RF-CAR-02 |
| Lista de los 6 proyectos con sus manzanas y lotes | RF-PRY-01 a RF-PRY-03, RF-MIG-01 |
| Funciones de la abogada en el sistema y si necesita un rol propio | RF-USR-02, RF-USR-08 |
| Números de las cuentas de recaudo y uso de Nequi o Daviplata | RF-CFG-06, RF-CFG-07 |
| Si se manejarán varios compradores por venta | RF-VEN-09 |
| Cómo se cobra el interés de mora: junto con la cuota o por separado | RF-CAR-06 |
| Software contable del contador externo y formato de reportes que necesita | RF-REP-10, RF-PER-11 |
| Logo de la empresa en buena calidad | RF-CFG-01 |

---

## Control de cambios

### CC-01 · 16 de octubre de 2026 · Proyectos de remodelación, préstamos a trabajadores y flujo de caja

**Origen:** solicitud del cliente por llamada con el desarrollador (16 de octubre de 2026).

**Estado:** aprobado por el desarrollador para el diseño; **pendiente la confirmación comercial con el cliente** (si entra en el presupuesto de $10.000.000 o se cotiza como adicional).

**Resumen:** (1) el sistema maneja proyectos de venta de lotes y de remodelación de casas, con el dinero de cada proyecto independiente; (2) los préstamos a trabajadores se controlan con una alerta antes de cada nómina y una carta de autorización de descuento; (3) el flujo de caja se consulta por día, semana, quincena, mes y proyecto.

| ID | Requerimiento | Prioridad | Etapa |
|---|---|---|---|
| RF-PRY-11 | Cada proyecto tiene un tipo: venta de lotes o remodelación. Un proyecto de remodelación no tiene manzanas ni lotes; solo ingresos y egresos propios | Debe | 1 |
| RF-CFG-11 | El gerente administra las categorías de ingreso (por ejemplo: cuota inicial, abono, anticipo de remodelación, otros) | Debe | 1 |
| RF-CFG-12 | El gerente configura la fecha de pago de la nómina: día de la semana para el pago semanal y fechas del pago quincenal | Debe | 3 |
| RF-EGR-08 | Cada proyecto tiene una sección de finanzas con sus ingresos y egresos detallados (fecha, tipo, categoría, descripción, valor, medio de pago, cuenta, soporte y usuario), con totales de ingresos, egresos y utilidad filtrables por período | Debe | 1 |
| RF-EGR-09 | Cada ingreso o egreso registra el tercero (nombre y documento del proveedor o cliente) y el número de factura o recibo | Debería | 1 |
| RF-REP-11 | Reporte de flujo de caja por día, semana, quincena o mes, para toda la empresa o por proyecto, con ingresos, egresos y saldo acumulado; exportable a PDF y Excel | Debe | 2 |
| RF-PER-12 | Registrar préstamos a trabajadores: fecha, valor, forma de pago, número de cuotas, saldo y estado | Debe | 3 |
| RF-PER-13 | Alertar el día antes de cada fecha de nómina sobre los trabajadores con préstamo pendiente de descuento, en el panel y por correo | Debe | 3 |
| RF-PER-14 | Generar en PDF la carta de autorización de descuento con los datos del trabajador y del préstamo (nombre, documento, cargo, fecha, valor, cuotas y forma de pago) | Debe | 3 |
| RF-PER-15 | Compartir la carta por WhatsApp con un enlace de mensaje listo y adjuntar la carta firmada en la ficha del trabajador; no se activa el descuento de un préstamo sin la carta firmada adjunta | Debe | 3 |
| RF-PER-16 | Al registrar el pago de nómina, proponer el descuento de las cuotas de préstamo pendientes como novedad y actualizar el saldo del préstamo | Debería | 3 |

**Decisiones del desarrollador sobre el alcance:**
- La carta se firma en papel (o con la firma que la empresa ya use) y se adjunta escaneada o fotografiada. **La firma electrónica dentro de la plataforma no se incluye**; queda como adicional pendiente del concepto de la abogada de la empresa sobre su validez para descuentos de nómina.
- El envío por WhatsApp es un enlace de mensaje preparado (gratis); el envío automático por la API de WhatsApp Business no se incluye.
- La carta nunca queda en blanco: incluye valor, cuotas y forma de pago del préstamo.
- Los proyectos de remodelación solo incluyen seguimiento de ingresos y egresos. Cotizaciones, avance de obra y presupuesto de obra siguen fuera del alcance.

**Puntos por confirmar derivados de este cambio:**

| Punto | Requerimientos afectados |
|---|---|
| Si el cambio entra en el presupuesto de $10.000.000 o se cotiza como adicional | CC-01 completo |
| Si en una remodelación se debe registrar también el cliente de la obra y el valor del contrato | RF-PRY-11 |
| Si el préstamo se descuenta en una sola nómina o en cuotas, y quién lo aprueba | RF-PER-12, RF-PER-16 |
| Definición de la quincena (propuesta: del 1 al 15 y del 16 al fin de mes) | RF-CFG-12, RF-REP-11 |
| Si el cliente necesita más campos en cada ingreso o egreso (por ejemplo, centro de costo) | RF-EGR-08, RF-EGR-09 |
| Concepto de la abogada sobre la carta de autorización y el descuento en la liquidación final | RF-PER-14, RF-PER-15 |

### CC-02 · 16 de octubre de 2026 · Maquinaria amarilla y su alquiler

**Origen:** dato que la empresa había omitido: tiene maquinaria amarilla que también alquila. Sus ingresos y egresos deben quedar soportados en el sistema.

**Estado:** aprobado por el desarrollador para el diseño; **pendiente la confirmación comercial con el cliente**, junto con CC-01.

**Resumen:** los equipos de maquinaria se registran uno por uno (sin límite de cantidad ni de tipos; se espera del orden de diez) y cada ingreso o egreso se asigna a un equipo, para ver la utilidad de cada máquina por separado.

| ID | Requerimiento | Prioridad | Etapa |
|---|---|---|---|
| RF-PRY-12 | Existe el tipo de proyecto Maquinaria, que agrupa el alquiler de equipos; no tiene manzanas ni lotes | Debe | 1 |
| RF-MAQ-01 | Registrar los equipos de maquinaria, sin límite de cantidad ni de tipos, con nombre, tipo, marca, modelo, año, placa o serie y estado (activo, en mantenimiento, fuera de servicio) | Debe | 1 |
| RF-MAQ-02 | El gerente administra la lista de tipos de equipo (por ejemplo: excavadora, retroexcavadora, volqueta) | Debería | 1 |
| RF-MAQ-03 | Cada ingreso o egreso de un proyecto de maquinaria se asigna a un equipo, o se marca como gasto general de la flota, y lleva soporte adjunto o motivo | Debe | 1 |
| RF-MAQ-04 | El ingreso por alquiler registra el cliente (nombre y documento), el período alquilado y el valor | Debería | 1 |
| RF-MAQ-05 | Mostrar por equipo los ingresos, egresos y utilidad por rango de fechas, y comparar todos los equipos en un solo listado; exportable a PDF y Excel | Debe | 2 |
| RF-MAQ-06 | Categorías de gasto propias de la maquinaria (combustible, mantenimiento, repuestos, operario, transporte del equipo), administrables por el gerente | Debería | 1 |
| RF-MAQ-07 | Un equipo no se borra: se da de baja conservando todos sus movimientos | Debe | 1 |

**Decisiones del desarrollador sobre el alcance:**
- Se incluye el registro de equipos y la utilidad por equipo. **No se incluyen** contratos de alquiler con tarifas por hora, día o mes, horómetro de salida y regreso, cartera de cobros de alquileres ni alertas de mantenimiento; se cotizan aparte cuando la empresa ya use el sistema.
- La cantidad de equipos del ejemplo (diez) es solo una referencia: el sistema no limita su número.

**Puntos por confirmar derivados de este cambio:**

| Punto | Requerimientos afectados |
|---|---|
| Si el alquiler se cobra siempre de contado; si hay cobros a crédito, se necesitaría cartera de alquileres (fuera de este cambio) | RF-MAQ-04 |
| Si se usan las máquinas en proyectos propios y se quiere cobrar internamente ese uso al proyecto | RF-MAQ-03 |
| Categorías de gasto que la empresa maneja para la maquinaria | RF-MAQ-06 |
| Cantidad y tipos de equipos actuales, para la carga inicial | RF-MAQ-01, RF-MAQ-02 |
