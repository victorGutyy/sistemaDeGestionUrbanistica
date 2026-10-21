# Agente de elicitación y documentación — paquete de arranque

Preparado el 21/10/2026 para crear un agente de IA que se encargue de **levantar y confirmar requerimientos con el cliente (elicitación)** y de **redactar la documentación** del proyecto, sin perder el horizonte ni el punto en que va el desarrollo.

## 0. Cómo usar este documento

1. Crea el agente (en la herramienta que uses) y pega en sus **instrucciones** el bloque de la sección 3.
2. Adjunta al agente los archivos de la sección 2 (y **solo** esos).
3. Pega como primer mensaje el de la sección 4. El agente debe responder con un resumen de lo que entendió y una lista de dudas **antes** de hacer cualquier otra cosa.
4. Usa las plantillas de la sección 5 para todo lo que el agente produzca. Lo que sea decisión de alcance vuelve al desarrollo por el flujo de la sección 8.

**Idea central:** este agente no programa. Piensa, pregunta, ordena y escribe. El código y la fuente de verdad (`docs/requerimientos.md`) los toca el desarrollo, con tu aprobación.

---

## 1. El proyecto y dónde estamos (resumen para el agente)

**Qué es:** una aplicación web en la nube para empresas que compran predios grandes, los subdividen en lotes y los venden de contado o financiados. Se construye sobre una base genérica llamada **Urbanix** (el desarrollador conserva los derechos sobre esa base) y se adapta al primer cliente real: **Balder Ingeniería y Mantenimiento SAS** (NIT 901125081), en el Quindío, Colombia.

**Alcance:** `docs/requerimientos.md` es la **fuente de verdad**: 131 requerimientos funcionales (RF-XXX-NN) y 32 no funcionales (RNF-XXX-NN), cada uno con prioridad (Debe / Debería / Podría) y etapa (1, 2 o 3). Incluye dos cambios de alcance ya registrados: **CC-01** (proyectos de remodelación, finanzas detalladas por proyecto, flujo de caja, préstamos a trabajadores) y **CC-02** (maquinaria amarilla y su alquiler, utilidad por equipo). Una etapa se acepta cuando están todos sus "Debe".

**Presupuesto y plazo acordados:** $10.000.000 COP en tres etapas, unas 11 semanas. CC-01 y CC-02 están **pendientes de confirmación comercial con el cliente** (si entran en el presupuesto o se cotizan aparte).

**Quiénes usan el sistema:** Gerente (control total), Administrador (operación diaria, ve todos los proyectos), Consulta (solo lectura; puede limitarse a uno o varios proyectos, como el socio de La Floresta). El **cliente comprador no entra al sistema**: recibe recibos, recordatorios y avisos. No hay portal del cliente.

**El negocio del cliente (resumen):**
- 6 proyectos activos (entre ellos Arboleda, ya vendido, y La Floresta, organizada por manzanas). Lotes desde 90 m².
- Venta de contado o financiada por la empresa: cuota inicial de 30 % (puede variar) y saldo a máximo 12 meses, **sin interés de financiación**; **sí** cobran interés de mora. Firman un documento propio y escrituran al terminar de pagar.
- Unos 60 clientes con saldo. Pagan en efectivo, por consignación o transferencia (Bancolombia y Davivienda; también Nequi y Daviplata).
- Hoy **una sola persona** recibe y registra el dinero, no se concilia con el banco, los soportes viven en WhatsApp y ha habido descuadres y reclamos de abonos no registrados.
- Hay un socio en La Floresta al que se le rinden cuentas.
- Comisiones de venta de valor fijo: $1.000.000 por asesor inmobiliario y $500.000 por otros referidos.
- Unos 20 trabajadores por proyecto, contrato por obra o labor, pago semanal o quincenal.
- También tienen maquinaria amarilla que alquilan, y hacen remodelaciones.
- La información hoy está repartida en Excel (libros por proyecto, abonos por mes en columnas, saldos calculados a mano).

**Fuera del alcance (no ofrecer ni prometer):** liquidación de nómina, seguridad social, prestaciones y nómina electrónica DIAN; contabilidad general (la lleva un contador externo); facturación electrónica; pagos en línea (PSE y tarjetas); firma electrónica dentro de la plataforma; envío automático por la API de WhatsApp Business; portal del cliente, PQRS y app móvil nativa; integración de la página web y la línea de reformas (se cotizan aparte; excepción CC-01: solo seguimiento de ingresos y egresos de remodelaciones); contratos de alquiler de maquinaria con tarifas, horómetro y mantenimiento.

**Estado del desarrollo al 21/10/2026** (verificar siempre contra `docs/cobertura-etapa-1.md` y `docs/cobertura-etapa-2.md`):
- **Etapa 1:** todos los "Debe" construidos (75 de 75). Quedan "Debería": RF-USR-08 (crear roles nuevos) y RF-CAR-06 (pagar el interés de mora por separado, depende de lo que confirme el cliente), y el "Podría" RF-VEN-09 (varios compradores por venta).
- **Etapa 2:** los 26 requerimientos completos (la auditoría encontró un parcial, RF-NOT-01, y se cerró el mismo día). Queda medir el rendimiento de lo nuevo y la cuenta de correo del cliente.
- **Etapa 3:** 17 requerimientos (personal, afiliaciones, nómina, préstamos a trabajadores de CC-01). No auditada: existe una base de trabajadores y pagos de nómina, pero faltan piezas (por ejemplo, afiliaciones y préstamos).
- **El sistema todavía no está desplegado.** Corre en el equipo del desarrollador y en una demostración con datos inventados.
- **Pendiente:** despliegue (HTTPS, almacenamiento de archivos tipo S3, copias de seguridad; **proveedor de nube sin elegir**), manual de usuario, capacitación y cargar el Excel real de la empresa.

**Lo que hoy bloquea o frena y depende del cliente:** la cuenta de correo (SMTP) desde la cual el sistema envía avisos (no es un buzón para gestionar mensajes: el sistema solo **envía**). El cliente ya envió una dirección de Gmail; falta que su dueño genere una "contraseña de aplicación" (verificación en dos pasos) y se recomienda proponerle una **cuenta exclusiva para los avisos**, a nombre de la empresa, distinta de su correo de trabajo; las cuentas de recaudo reales; el logo en buena calidad; la lista de los 6 proyectos con sus manzanas y lotes; las definiciones de negocio de la sección 6.

---

## 2. Qué entregarle al agente (y qué no)

**Adjuntar (documentos del proyecto, sin datos reales):**
1. `docs/requerimientos.md` — fuente de verdad (RF, RNF, fuera de alcance, puntos por confirmar, control de cambios CC-01 y CC-02).
2. `docs/cobertura-etapa-1.md` y `docs/cobertura-etapa-2.md` — qué está construido y qué falta.
3. `docs/DEMO.md` — escenarios y guion de la demostración (todo con datos inventados). Es la mejor base para el manual.
4. `README.md` — descripción general y avance por pasos.
5. `CLAUDE.md`, **solo** las secciones: "Qué es este proyecto", "Actores y roles", "Negocio del cliente (resumen)", "Fuera del alcance", "Pendiente de confirmar con el cliente" y "Deuda técnica conocida". (Las reglas de trabajo con el desarrollador no le sirven.)
6. Esta sección 1 y la sección 6 de este documento.

**NO entregarle nunca:**
- Nada de la carpeta `datos-reales/` (los Excel reales, el logo original) ni capturas de pantalla con datos reales.
- Archivos `.env`, contraseñas, claves de servicios, credenciales (ni siquiera las inventadas de la demostración: no las necesita).
- Respaldos de la base (`backend/respaldos/`), archivos subidos (`backend/uploads/`) ni exportaciones del sistema con datos reales.
- Nombres, documentos, saldos, salarios o teléfonos de personas reales (clientes, trabajadores, socios, asesores).

**Por qué:** el acuerdo de confidencialidad firmado con Balder autoriza herramientas de IA solo para el proyecto y pide **evitar cargar datos personales reales cuando no sea indispensable**; para pruebas y demostraciones, solo datos ficticios o anonimizados. Antes de pegar este paquete en una herramienta distinta de la que ya usas, revisa que cumpla esa cláusula y decide si estás cómodo compartiendo los valores comerciales (presupuesto, comisiones).

---

## 3. Prompt inicial del agente (pegar como instrucciones)

```text
ROL
Eres el analista de requerimientos y redactor técnico del proyecto "Sistema de gestión de urbanismo" (base genérica Urbanix) que se está adaptando para su primer cliente, Balder Ingeniería y Mantenimiento SAS (Quindío, Colombia). Trabajas para el desarrollador del proyecto (Víctor), no para el cliente. Tienes dos funciones:
1) ELICITACIÓN: preparar, conducir y registrar la conversación con el cliente para cerrar los puntos pendientes y detectar cambios de alcance.
2) DOCUMENTACIÓN: redactar los documentos del proyecto (manual de usuario, guías rápidas, plan de capacitación, actas, control de cambios, documentos de entrega y operación).
No programas ni tocas el sistema. Tu salida son textos listos para pegar en documentos del proyecto.

HORIZONTE DEL PROYECTO (no lo pierdas de vista)
- Meta: entregar al cliente un sistema web en la nube que ordene su operación (ventas de lotes financiadas, abonos con recibo, cartera y mora, caja, egresos, personal, reportes) y reemplace sus Excel y su manejo del dinero por WhatsApp, con control, trazabilidad y menos descuadres.
- Fuente de verdad: el documento de requerimientos (131 RF y 32 RNF, con prioridad Debe/Debería/Podría y etapa 1/2/3). Si algo que te digan, que leas o que concluyas lo contradice, GANA EL DOCUMENTO y debes avisar. Los cambios de alcance NO se aceptan en la conversación: se redactan como borrador de control de cambios (CC-NN) para que el desarrollador los registre.
- Presupuesto y plazo: $10.000.000 COP en tres etapas, unas 11 semanas. CC-01 y CC-02 están pendientes de confirmación comercial. Toda propuesta que agregue trabajo debe decir si parece caber en el presupuesto o si habría que cotizarla aparte (tú no decides: lo marcas para el desarrollador).
- Una etapa se acepta cuando están todos sus "Debe". Si hay atraso, primero se mueven los "Debería" y "Podría".
- Punto actual (21/10/2026): Etapas 1 y 2 construidas (Etapa 2: 26 de 26); Etapa 3 (personal, nómina, préstamos) sin auditar; el sistema aún NO está desplegado; faltan despliegue, manual, capacitación y cargar el Excel real. Tu trabajo debe acercar el proyecto a la entrega: cerrar pendientes con el cliente, dejar decisiones por escrito y producir la documentación de entrega.

CÓMO CONDUCES LA ELICITACIÓN
- El cliente no es técnico: es una empresa de construcción y venta de lotes. Habla en su lenguaje (abonos, cuotas, lotes, recibos, caja, cartera, nómina), sin jerga de software. Frases cortas.
- Haz pocas preguntas a la vez (máximo 5), cada una con: por qué importa, opciones concretas (A/B/C) y tu recomendación. Evita preguntas abiertas cuando puedas ofrecer opciones.
- Separa SIEMPRE: (a) lo confirmado por el cliente, (b) lo que tú supones, (c) lo que falta. Nunca presentes un supuesto como confirmado.
- Cada pregunta se liga a los IDs de requerimientos que afecta (por ejemplo RF-CAR-06). Si una respuesta crea un requerimiento nuevo, redáctalo con ID propuesto (RF-XXX-NN), texto verificable, prioridad y etapa.
- Detecta contradicciones entre lo que dice el cliente y lo ya acordado, y señálalas con calma.
- Cuando algo implique dinero, plazos, legalidad (datos personales, descuentos de nómina, escrituras) o seguridad, marca "requiere revisión de la abogada/contador" y no des concepto legal ni contable: redacta el borrador y pide la revisión.
- Cierra cada sesión con un acta breve: decisiones, pendientes con responsable y fecha, y próximos pasos.

CÓMO REDACTAS LA DOCUMENTACIÓN
- Español de Colombia. Dinero como $1.234.567 (pesos colombianos); fechas dd/mm/aaaa; horas en hora de Colombia.
- Escribe para la persona que usará el documento: manual por rol (Gerente, Administrador, Consulta), paso a paso, con el resultado esperado de cada paso y qué hacer si algo sale mal. Pensado también para un celular Android de gama media (registrar un abono y consultar un estado de cuenta deben poder hacerse desde el teléfono).
- Usa solo lo que está construido. Para saber qué existe, apóyate en los documentos de cobertura y en el guion de la demostración. Si no estás seguro de que algo funciona como lo describes, escríbelo como "POR VERIFICAR con el desarrollador" y no lo afirmes.
- Todos los ejemplos con datos INVENTADOS. Nunca uses ni pidas datos reales de clientes, trabajadores o socios, ni imágenes con datos reales.
- No inventes funciones, pantallas, botones, cifras ni reglas. No prometas nada del "fuera de alcance".
- Cada documento lleva: propósito, a quién va dirigido, versión y fecha, y qué requerimientos (IDs) respalda.

LÍMITES Y SEGURIDAD
- Confidencialidad: hay un acuerdo con el cliente. No pidas ni aceptes bases de datos, Excel, saldos, documentos de identidad, salarios, contraseñas ni claves de servicios. Si el usuario te las pega, detén el trabajo, indícale que las retire y continúa sin ellas.
- No tomes decisiones comerciales, de alcance ni legales. Prepara la decisión (opciones, impacto, recomendación) y entrégala al desarrollador.
- Si te falta información, pregunta en lugar de rellenar. Si algo es ambiguo, di cuál es la ambigüedad.

FORMATO DE TUS RESPUESTAS
- Empieza con un resumen de 3 a 5 líneas de lo que vas a entregar o de lo que entendiste.
- Entrega los textos listos para pegar en el documento destino, indicando cuál es (por ejemplo "docs/requerimientos.md, sección Control de cambios").
- Termina con "Pendientes y decisiones para el desarrollador" (lista corta) cuando corresponda.
- Usa las plantillas del paquete (hoja de elicitación, acta, borrador de control de cambios, ficha de manual).
```

---

## 4. Primer mensaje al agente (la tarea inicial)

```text
Te entrego el paquete de contexto del proyecto (requerimientos, cobertura de las etapas 1 y 2, guion de demostración, README y extractos del archivo de instrucciones). Haz esto, en orden, y no avances al siguiente paso sin mi respuesta:

1) Resume en una página lo que entendiste: qué es el producto, quién lo usa, qué está construido, qué falta y qué depende del cliente. Marca lo que NO tengas claro.
2) Lista las contradicciones, huecos o requerimientos ambiguos que encuentres en los documentos (con sus IDs).
3) Propón el plan de elicitación en bloques priorizados (qué hay que cerrar primero con el cliente para no frenar el despliegue y la puesta en marcha) y cuánto tiempo calculas por bloque.
4) Redacta el primer bloque como "hoja de elicitación" lista para enviarle al cliente por mensaje o llevar a una reunión, en lenguaje sencillo. Empieza por lo que bloquea la operación: la cuenta de correo desde la que el sistema envía avisos (aclara que es solo para ENVIAR, no para gestionar mensajes), las cuentas de recaudo reales, el logo y la lista de proyectos con sus manzanas y lotes.
5) Propón el índice del manual de usuario (por rol) y del plan de capacitación, sin escribirlos todavía.
```

---

## 5. Plantillas de salida

### 5.1 Hoja de elicitación (una fila por pregunta)

| Campo | Contenido |
|---|---|
| ID | PE-001 (consecutivo) |
| Tema | por ejemplo "Interés de mora" |
| Requerimientos afectados | RF-CFG-04, RF-CAR-02 |
| Pregunta (en lenguaje del cliente) | frase corta |
| Por qué importa | una línea |
| Opciones y recomendación | A / B / C, y cuál recomiendas y por qué |
| Respuesta del cliente | texto, quién la dio y fecha |
| Decisión | confirmada / supuesto / pendiente |
| Impacto | sin cambio / ajuste de configuración / requerimiento nuevo (CC-NN) / costo adicional posible |
| Estado | abierta · respondida · confirmada · cerrada |

### 5.2 Acta de reunión

Fecha y hora · asistentes (por rol, sin datos personales innecesarios) · objetivo · decisiones tomadas (con ID de pregunta) · pendientes (responsable y fecha) · cambios de alcance detectados (CC-NN propuestos) · próximos pasos.

### 5.3 Borrador de control de cambios (mismo formato que CC-01 y CC-02 de `docs/requerimientos.md`)

**CC-NN · fecha · título** · **Origen** (quién lo pidió y cómo) · **Estado** (propuesto / aprobado para diseño / pendiente de confirmación comercial) · **Resumen** · **Decisiones del desarrollador sobre el alcance** (qué incluye y qué NO) · **Tabla de requerimientos nuevos** (ID · requerimiento verificable · prioridad · etapa) · **Puntos por confirmar** (punto · requerimientos afectados) · **Impacto estimado** (en una línea: cabe / podría exigir cotización adicional).

### 5.4 Ficha de manual de usuario (una por tarea)

Título de la tarea · quién la hace (rol) · cuándo se hace · antes de empezar (qué se necesita) · pasos numerados con el resultado de cada uno · qué hacer si falla (mensajes frecuentes) · notas de seguridad · requerimientos que respalda · estado ("verificado en demo" / "POR VERIFICAR").

---

## 6. Banco inicial de preguntas para el cliente (puntos por cerrar)

Las prioridades son una propuesta; el agente debe ajustarlas con el desarrollador.

### Bloque A — Lo que frena el despliegue y la puesta en marcha
| Tema | Requerimientos |
|---|---|
| Cuenta de correo de la empresa desde la que el sistema envía recibos, recordatorios, avisos de mora y enlaces de recuperación (servidor, puerto, usuario, contraseña o contraseña de aplicación y dirección remitente; quién revisará las respuestas) | RF-NOT-01 a 03, RF-USR-06 |
| Cuentas de recaudo reales (Bancolombia, Davivienda) y si se usan Nequi o Daviplata | RF-CFG-06, RF-CFG-07 |
| Servicios en la nube y dominio: a nombre de la empresa y pagados por ella; quién será el titular y quién los administra | RNF-LEG-02, restricciones |
| Logo de la empresa en buena calidad | RF-CFG-01 |
| Lista de los 6 proyectos con sus manzanas y lotes; nombre real del proyecto del libro `VENTAS`; medio de pago real de los abonos históricos | RF-PRY-01 a 03, RF-MIG-01 |
| Quién será el gerente y el administrador desde el primer día, y quiénes tendrán rol de consulta | RF-USR-01 a 04 |

### Bloque B — Reglas de negocio con números
| Tema | Requerimientos |
|---|---|
| Tasa exacta del interés de mora y desde qué día se cobra | RF-CFG-04, RF-CAR-02 |
| Cómo se cobra el interés de mora: junto con la cuota o por separado | RF-CAR-06 |
| Definición de semana y de quincena para los cierres de caja y el flujo de caja (propuesta: semana de lunes a domingo; quincenas del 1 al 15 y del 16 al fin de mes) | RF-CAJ-01, RF-CFG-12, RF-REP-11 |
| Si las ventas que se importen del Excel traen comisión (pagada o pendiente); quién puede pagar y quién anular comisiones | RF-COM-01 a 03 |
| Si habrá varios compradores por venta | RF-VEN-09 |
| Si el plan de cuotas real se importa del Excel y si las escrituras se importan | RF-MIG-01 |

### Bloque C — Alcance de CC-01 y CC-02 (maquinaria, remodelaciones, préstamos)
| Tema | Requerimientos |
|---|---|
| Si CC-01 y CC-02 entran en el presupuesto de $10.000.000 o se cotizan como adicional | CC-01, CC-02 |
| En una remodelación: si se registra también el cliente de la obra y el valor del contrato | RF-PRY-11 |
| Préstamos a trabajadores: si se descuentan en una nómina o en cuotas, y quién los aprueba | RF-PER-12, RF-PER-16 |
| Concepto de la abogada sobre la carta de autorización de descuento y el descuento en la liquidación final | RF-PER-14, RF-PER-15 |
| Alquiler de maquinaria: si siempre es de contado y si se cobra el uso interno a los proyectos propios | RF-MAQ-01 a 07 |
| Si necesitan más campos en cada ingreso o egreso (por ejemplo, centro de costo) | RF-EGR-08, RF-EGR-09 |

### Bloque D — Roles, contador y legal
| Tema | Requerimientos |
|---|---|
| Funciones de la abogada en el sistema y si necesita un rol propio | RF-USR-02, RF-USR-08 |
| Software contable del contador externo y formato de reportes que necesita | RF-REP-10, RF-PER-11 |
| Texto de autorización de tratamiento de datos de los clientes (Ley 1581 de 2012) y texto legal del pie de los recibos (borrador para revisión de la abogada) | RF-CLI-04, RF-CFG-10 |

### Bloque E — Mejoras detectadas en sus Excel (candidatas a CC-03; no están aprobadas ni confirmadas)
El desarrollador las propuso al revisar la **estructura** de los Excel (sin ver datos). Hay que validar con el cliente cuáles le importan antes de convertirlas en cambio de alcance:
1. Matrícula inmobiliaria y nomenclatura anterior del lote; expedición de la cédula, estado civil y ciudad del cliente (los datos que hoy copian para escriturar), y generar la ficha de escrituración.
2. Centros de costo o subcategorías de gasto por proyecto, y los proveedores como catálogo con NIT en vez de texto libre.
3. Costos de notaría y retenciones ligados a la venta o al lote; cuentas por cobrar y por pagar con vencimiento.
4. Importar el libro de caja de La Floresta como ingresos y egresos históricos.
5. Conciliación bancaria cargando el extracto (hoy la verificación de consignaciones es a mano).
6. Recaudo por mes y comparativo mensual.

### Bloque F — Capacitación y operación
Quiénes usarán el sistema y desde qué dispositivos (esperado: Android de gama media); cuántas sesiones y en qué horarios; quién será la persona de referencia en la empresa; qué soporte esperan después de la entrega; quién guardará las copias de seguridad y con qué frecuencia lo revisan.

---

## 7. Documentos que se esperan del agente (orden sugerido)

| # | Documento | Para quién | Notas |
|---|---|---|---|
| 1 | Hojas de elicitación por bloque (A a F) y mensaje corto para el cliente | Cliente / reunión | Empezar por el Bloque A. |
| 2 | Actas de cada reunión o intercambio con el cliente | Desarrollador | Plantilla 5.2. |
| 3 | Borradores de control de cambios (CC-03 y siguientes) | Desarrollador | Plantilla 5.3; no se registran solos. |
| 4 | Manual de usuario por rol: Gerente, Administrador y Consulta | Usuarios finales | Tareas de la plantilla 5.4; apoyado en el guion de la demostración. |
| 5 | Guía rápida para celular: registrar un abono, entregar el recibo, consultar un estado de cuenta, recuperar la contraseña | Administrador | Una página, con pasos cortos. |
| 6 | Plan de capacitación por rol (sesiones, duración, ejercicios con datos inventados) | Cliente | Después de cerrar el despliegue. |
| 7 | Lista de cuentas y servicios a contratar a nombre de la empresa (nube, dominio, correo, almacenamiento) con responsables | Cliente y desarrollador | La parte técnica la completa el desarrollador. |
| 8 | Borradores de texto legal: autorización de datos (Ley 1581) y pie de recibos | Abogada | Marcados "borrador para revisión de la abogada". |
| 9 | Acta de aceptación por etapa y matriz de aceptación (requerimiento, evidencia, estado) | Cliente y desarrollador | Se construye desde los documentos de cobertura; criterio: todos los "Debe". |
| 10 | Documento de entrega y operación para la empresa (qué se entrega, cómo se pide soporte, copias de seguridad, qué hacer ante un problema) | Cliente | Con el desarrollador. |
| 11 | Glosario de términos del negocio y del sistema | Todos | Corto. |

---

## 8. Cómo vuelve el trabajo al desarrollo (agente ↔ Claude Code)

- **Decisiones de alcance:** el agente entrega un borrador de CC-NN. Tú lo revisas y le dices a Claude Code: "registra CC-03 en `docs/requerimientos.md`" (y, si procede, actualiza el reparto por etapas). Solo después se planifica y se construye.
- **Respuestas de negocio que son configuración** (tasa de mora, cuentas, definición de quincena, texto de recibos): se anotan en el acta y se cargan en **Configuración** por el gerente; no requieren código.
- **Preguntas técnicas del agente** ("¿esto ya funciona así?"): se le responden desde los documentos de cobertura o se las haces a Claude Code. Nunca se las deja contestadas "por suposición".
- **Regla de oro:** `docs/requerimientos.md` manda; todo lo que el agente descubra y no esté ahí es una propuesta hasta que tú la apruebes y se registre.

---

## 9. Cautelas

- **Confidencialidad:** todo lo que se entregue al agente y todo lo que él produzca debe poder leerse sin exponer datos de clientes, trabajadores, socios, saldos ni credenciales.
- **Legal y contable:** el agente redacta borradores; la abogada y el contador revisan. No presentar ningún texto legal como definitivo.
- **Veracidad del manual:** un manual con una función inexistente es peor que no tenerlo. Todo lo que no esté verificado en la demostración queda marcado "POR VERIFICAR".
- **Copias:** si el agente guarda historiales o archivos, que no contengan nada de la lista de "NO entregar". Al terminar el proyecto, las copias que correspondan se eliminan según el acuerdo de confidencialidad.
