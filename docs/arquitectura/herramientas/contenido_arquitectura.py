# -*- coding: utf-8 -*-
# Contenido del documento "Arquitectura del sistema" (una sola fuente para el Word y el PDF).
# Sin contraseñas ni datos de personas: las credenciales viven en el anexo aparte (contenido_anexo.py).

ETIQUETA = "DOCUMENTO TÉCNICO · ARQUITECTURA"
TITULO = "Arquitectura del sistema"
SUBTITULO = "Sistema de gestión de urbanismo (base Urbanix): qué lo compone, cómo funciona, con qué herramientas se construye y cómo se mantiene"
AUTOR = "Victor Alfonso Gutierrez Lopez"
EDICION = "Edición para Balder Ingeniería y Mantenimiento SAS"
VERSION = "Versión 1.0"
FECHA = "Noviembre de 2026"
NOTA_PORTADA = ("Este documento no contiene contraseñas, llaves ni datos personales de nadie, y se puede compartir con el cliente. "
                "Las credenciales se guardan en un documento aparte, el Anexo de registro de credenciales, que es confidencial y nunca se sube a Git.")
PIE = "Arquitectura del sistema · Sistema de gestión de urbanismo"

C = []


def h1(t): C.append(("h1", t))
def h2(t): C.append(("h2", t))
def h3(t): C.append(("h3", t))
def p(t): C.append(("p", t))
def simple(t): C.append(("simple", t))
def ul(*items): C.append(("ul", list(items)))
def ol(*items): C.append(("ol", list(items)))
def fig(i, titulo): C.append(("fig", i, titulo))
def tabla(i, titulo, cols, filas, anchos): C.append(("tabla", i, titulo, cols, filas, anchos))
def consejo(t): C.append(("aviso", "Consejo", t))
def importante(t): C.append(("aviso", "Importante", t))
def codigo(t): C.append(("codigo", t))


# =====================================================================  1
h1("Introducción")
simple("El Sistema de gestión de urbanismo es una aplicación web que usa una empresa que compra terrenos grandes, los divide en lotes y los vende de contado o con financiación propia. "
       "Este documento explica, de forma ordenada, de qué piezas está hecho, cómo se hablan entre sí, dónde vive cada cosa y cómo se cuida. Sirve para entender el sistema sin ser programador, y también para que otro desarrollador pueda continuar el trabajo.")
h2("Propósito y a quién va dirigido")
p("El documento describe la **arquitectura**: la estructura general del sistema y las decisiones que la sostienen. No es un manual de uso (para eso está el Manual de usuario) ni la lista de requerimientos (que vive en `docs/requerimientos.md`). Está pensado para tres lectores:")
ul("**La gerencia de la empresa**, que necesita saber qué tiene, dónde está y qué riesgos están cubiertos. Cada sección abre con un cuadro verde, *En palabras simples*, que se puede leer sin el resto.",
   "**Un desarrollador o proveedor técnico** que herede el sistema: encontrará la estructura del código, los módulos, la base de datos, el despliegue y una guía para agregar funciones.",
   "**Quien administre el servidor**: encontrará la infraestructura, las copias de seguridad, la recuperación y qué hacer cuando algo falla.")
h2("El sistema en cifras")
p("La {tabla:cifras} resume el tamaño del sistema. Las cifras salen del código y de la última verificación completa de las pruebas.")
tabla("cifras", "Tamaño del sistema", ["Elemento", "Cantidad"], [
    ["Código del servidor (TypeScript, sin pruebas ni código generado)", "unas 28.800 líneas"],
    ["Código de las pantallas (TypeScript y React)", "unas 24.100 líneas"],
    ["Carpetas de código del servidor (módulos y servicios compartidos)", "35"],
    ["Rutas de la API (consultas y operaciones)", "unas 215"],
    ["Pantallas (páginas) y componentes reutilizables", "58 páginas y 50 componentes"],
    ["Tablas de la base de datos (modelos) y listas de valores (enumeraciones)", "56 modelos y 41 enumeraciones"],
    ["Cambios de la base de datos aplicados (migraciones)", "33"],
    ["Permisos distintos y roles que trae el sistema", "45 permisos y 5 roles"],
    ["Pruebas automáticas", "1.905 unitarias (132 archivos) y 468 de extremo a extremo (24 archivos)"],
    ["Cambios guardados en Git desde el inicio (18/09/2026)", "más de 140"],
], [64, 36])
h2("Documentos relacionados")
tabla("relacionados", "Documentos del proyecto", ["Documento", "Qué contiene"], [
    ["`docs/requerimientos.md`", "Alcance oficial: requerimientos funcionales y no funcionales, y el control de cambios (CC-01 a CC-09)."],
    ["`docs/despliegue.md`", "Guía paso a paso para preparar el servidor, desplegar y configurar las copias de seguridad."],
    ["`docs/manual/Manual-de-usuario.pdf`", "Cómo usar cada pantalla, con imágenes."],
    ["`docs/rendimiento.md`", "Mediciones de velocidad con el volumen de datos que pide el cliente."],
    ["`docs/DEMO.md`", "Cómo preparar y usar las bases de demostración."],
    ["`CLAUDE.md`", "Reglas de trabajo, decisiones de arquitectura y lista de deuda técnica conocida."],
    ["Anexo de registro de credenciales", "Contraseñas y accesos. Confidencial: documento aparte, fuera de Git."],
], [38, 62])

# =====================================================================  2
h1("Visión general del sistema")
simple("Piensa en el sistema como una oficina con tres áreas: las pantallas que ve cada persona, un servidor que aplica las reglas y decide quién puede hacer qué, y una base de datos donde queda todo guardado. "
       "Alrededor hay unos pocos servicios externos que mandan correos, guardan copias y vigilan que todo funcione.")
h2("Qué hace el sistema")
p("El sistema cubre el ciclo completo del negocio de lotes y algunas áreas de apoyo:")
ul("**Venta de lotes:** proyectos, manzanas y lotes; clientes; ventas de contado o financiadas; plan de cuotas a la medida del contrato; acuerdos de pago.",
   "**Cobro:** abonos con recibo numerado, cartera con semáforo de mora, recordatorios y avisos por correo, verificación de los pagos contra el extracto.",
   "**Dinero de la empresa:** ingresos y egresos, cierres de caja con aprobación, finanzas por proyecto y flujo de caja, comisiones de venta.",
   "**Personas:** trabajadores, nómina por obra y quincena, afiliaciones de seguridad social y el módulo de seguridad y salud en el trabajo (SST).",
   "**Maquinaria:** catálogo de equipos y utilidad por equipo.",
   "**Información:** panel con indicadores, reportes en pantalla, PDF y Excel, carga masiva desde Excel y exportación completa de los datos.")
fig("d01-contexto", "Contexto del sistema: personas, sistema y servicios externos.")
h2("Quién lo usa")
p("El sistema distingue cinco roles que vienen incluidos, y el gerente puede crear roles propios combinando permisos. El cliente comprador no entra al sistema: solo recibe correos.")
tabla("roles", "Roles que trae el sistema", ["Rol", "Qué puede hacer"], [
    ["Gerente", "Control total: configuración, usuarios, aprobaciones, anulaciones y auditoría."],
    ["Administrador", "Operación diaria: ventas, abonos, egresos, cierres de caja, nómina y personal. Ve todos los proyectos. No ve diagnósticos de salud ni aprueba cierres."],
    ["Consulta", "Solo lectura. Puede ver todos los proyectos o solo algunos (por ejemplo, un socio que sigue un solo proyecto)."],
    ["Contratista SST", "Persona externa. Solo ve y trabaja el módulo de seguridad y salud, con los diagnósticos de salud, y no ve dinero ni salarios."],
    ["Soporte técnico", "Para el desarrollador: ve todos los módulos de consulta, pero no puede registrar ni cambiar nada, ni gestionar usuarios, ni ver diagnósticos."],
], [22, 78])
h2("Restricciones que condicionan el diseño")
ul("Es una **aplicación web en la nube**, usada desde navegador (computador, tableta o celular, desde 360 px de ancho). No hay aplicación móvil nativa.",
   "La base de datos es **PostgreSQL**.",
   "El sistema está construido sobre una **base genérica** (Urbanix), reutilizable con otros clientes; el desarrollador conserva los derechos sobre esa base.",
   "Los servicios en la nube y el dominio deben estar **a nombre de la empresa y pagados por ella**.",
   "Presupuesto y plazo acordados: $10.000.000 COP en tres etapas, unas 11 semanas, más los cambios de alcance registrados en el control de cambios (CC-01 a CC-09).",
   "Fuera de alcance: contabilidad general, facturación electrónica, pagos en línea, firma electrónica, portal del cliente y envío automático por WhatsApp.")

# =====================================================================  3
h1("Principios de arquitectura")
simple("Son las reglas que se respetan siempre al construir el sistema. Existen para que el dinero cuadre, para que nada se pierda sin dejar huella y para que el mismo sistema sirva a otra empresa sin reescribirlo.")
p("Cada principio es una decisión tomada a propósito, con una forma concreta de cumplirse y de comprobarse.")
tabla("principios", "Principios de arquitectura y cómo se cumplen", ["Principio", "Qué significa", "Cómo se cumple"], [
    ["Base genérica y configurable", "Nada del cliente escrito a mano en el código: nombre, NIT, logo, colores, textos legales.", "Se guardan en la tabla de configuración de la empresa y los edita el gerente desde la pantalla de Configuración."],
    ["Reglas de negocio como parámetros", "Porcentajes, plazos, tasa de mora, días del semáforo, comisiones, categorías, cuentas y medios de pago no son constantes.", "Son valores editables en Configuración o en tablas de catálogo; el código los lee en cada operación."],
    ["Dinero exacto", "Nunca se usan decimales de coma flotante para el dinero.", "Valores como Decimal en la base y en el código; pesos enteros en abonos y nómina; formato de pantalla $1.234.567."],
    ["Permisos en el servidor", "Ocultar un botón no es seguridad.", "Cada ruta declara el permiso que exige; una ruta sin declarar se rechaza para todos. Consulta restringido por proyecto no ve otros proyectos por ningún medio."],
    ["Nada de negocio se borra", "La información se anula, se desactiva o se finaliza, y queda el historial.", "Estados en vez de borrados; en varias tablas la propia base impide editar o borrar (disparadores)."],
    ["Todo dinero se audita", "Quién, cuándo, qué, valor anterior y valor nuevo.", "Cada escritura llama a la auditoría dentro de su transacción; una prueba automática falla si un archivo escribe sin auditar."],
    ["Todo o nada", "Una operación de dinero se guarda completa o no se guarda.", "Transacciones de PostgreSQL con bloqueos de fila y bloqueos de aviso entre quienes registran y quien cierra la caja."],
    ["Consecutivos sin saltos", "Los recibos no repiten número, no saltan y no se reutilizan tras anular.", "Un solo mecanismo por serie, atómico, dentro de la transacción del abono."],
    ["Hora de Bogotá explícita", "Las fechas y las tareas programadas no dependen de la hora del servidor.", "La zona America/Bogota se define en el código, incluido el cron de recordatorios."],
    ["Pensado para el celular", "Registrar un abono y consultar un estado de cuenta deben funcionar en un Android de gama media.", "Diseño adaptable desde 360 px; cada pantalla nueva nace responsive."],
    ["Pruebas donde hay dinero", "Plan de cuotas, abonos, anulaciones, mora, cierres y consecutivos tienen pruebas automáticas.", "Reglas de dinero en funciones puras con su archivo de pruebas, y pruebas contra una base real."],
    ["Datos personales", "Se cumple la Ley 1581 de 2012: autorización registrada por cliente.", "Ficha del cliente con su autorización; datos de salud con permisos propios y cada consulta auditada."],
], [20, 38, 42])

# =====================================================================  4
h1("Arquitectura lógica")
simple("El sistema tiene tres capas, una encima de otra. La persona solo habla con la primera (las pantallas); las pantallas solo hablan con la segunda (el servidor); y solo el servidor toca la tercera (la base de datos). Ninguna pantalla puede saltarse al servidor para llegar a los datos.")
fig("d02-capas", "Las tres capas del sistema.")
h2("Cómo viaja una petición")
p("Cuando alguien pulsa un botón, ocurre siempre la misma secuencia:")
ol("El navegador manda la petición al servidor por HTTPS, con el token de sesión (JWT) de la persona.",
   "El proxy (Caddy) recibe la petición y reenvía las que empiezan por `/api/` a la API, por la red interna de Docker.",
   "Dos guardas globales actúan primero: una valida que la sesión sea válida y otra comprueba que el rol de la persona tenga el permiso que la ruta declara.",
   "Un validador revisa el cuerpo de la petición contra su DTO (tipos, longitudes, formatos) y descarta lo que sobra.",
   "El controlador entrega la petición al servicio, que aplica el alcance (a qué proyectos puede acceder esa persona), las reglas de negocio y los cálculos.",
   "Si la operación toca dinero, el servicio abre una transacción: bloquea lo necesario, guarda, asigna el consecutivo si corresponde y escribe la auditoría. Si algo falla, no queda nada.",
   "La API responde con JSON y la pantalla se actualiza.")
h2("Qué vive dónde")
tabla("donde", "Dónde está cada responsabilidad", ["Responsabilidad", "Capa", "Detalle"], [
    ["Qué pantallas ve cada rol", "Pantallas", "Comodidad: oculta lo que la persona no puede usar. No es la seguridad."],
    ["Quién puede hacer qué", "Servidor", "Permisos por rol y alcance por proyecto, validados en cada operación."],
    ["Reglas y cálculos de dinero", "Servidor", "Plan de cuotas, reparto de abonos, mora, nómina, cierres, comisiones."],
    ["Que los datos sean coherentes", "Servidor y base de datos", "Validación en el servidor y, además, restricciones y disparadores en la base."],
    ["Guardar datos y archivos", "Base de datos y disco", "PostgreSQL y el volumen de adjuntos."],
    ["Tareas automáticas", "Servidor", "Recordatorios, mora y avisos de SST, con horario de Bogotá."],
], [30, 22, 48])

# =====================================================================  5
h1("Frontend: las pantallas")
simple("Es lo que la persona ve en el navegador. Está hecho con React, que arma las pantallas con piezas reutilizables (formularios, tablas, tarjetas), de modo que un cambio de diseño en una pieza se refleja en todas las pantallas que la usan.")
h2("Tecnología")
ul("**React 19** con **TypeScript**: las pantallas se construyen con componentes tipados.",
   "**Vite** como herramienta de desarrollo y de compilación: genera archivos estáticos que sirve el proxy.",
   "**React Router 7** para la navegación; las rutas protegidas exigen un permiso.",
   "**Tailwind CSS 4** para el diseño; iconos con **lucide-react**.",
   "No usa librerías de estado ni de peticiones: una capa propia (`lib/api.ts`) concentra las llamadas al servidor.")
h2("Estructura del código")
tabla("front-estructura", "Carpetas principales del frontend (`frontend/src`)", ["Carpeta o archivo", "Contenido"], [
    ["`main.tsx` y `App.tsx`", "Arranque y el mapa de rutas. Cada grupo de rutas está envuelto en una ruta protegida que exige un permiso."],
    ["`pages/`", "Las 58 pantallas: una por función (Ventas, Cartera, Nómina, Liquidar quincena, Reportes, SST...)."],
    ["`components/`", "Piezas reutilizables: formularios, tablas, tarjetas, ventanas, vistas previas, el marco de la aplicación y el menú."],
    ["`contexts/`", "Estado compartido: la sesión y los permisos de quien ingresó (`AuthContext`) y los datos de la empresa (`EmpresaContext`)."],
    ["`lib/`", "Funciones sin pantalla: `api.ts` (todas las llamadas al servidor), `formato.ts` (dinero y fechas), `permisos.ts`, y cálculos como `liquidacion.ts`."],
], [28, 72])
h2("Sesión, permisos y navegación")
ul("Al ingresar, el servidor entrega un token de sesión y la lista de permisos de la persona. El menú muestra solo lo que esa persona puede usar.",
   "Las rutas protegidas redirigen si falta el permiso. **Esto es comodidad: el servidor vuelve a validar todo.**",
   "La sesión se cierra sola por **inactividad**; el tiempo lo define el gerente en Configuración.",
   "Si el servidor responde 401 (sesión vencida), la pantalla devuelve a la persona al ingreso.")
h2("Diseño adaptable y formato")
ul("Toda pantalla nace **responsive**: se verifica a 375 px de ancho. Las tablas anchas se deslizan hacia los lados en vez de romper la página.",
   "El dinero se muestra siempre en pesos colombianos con puntos de miles ($1.234.567) y las fechas como dd/mm/aaaa, con funciones únicas en `lib/formato.ts`.",
   "Los textos y mensajes están en español de Colombia.")
importante("El frontend **no tiene corredor de pruebas automáticas**: se verifica a mano en el navegador y con las pruebas del servidor, que es donde está la lógica de dinero. Agregarlo (por ejemplo, Vitest) está en la lista de deuda técnica.")

# =====================================================================  6
h1("Backend: el servidor")
simple("Es el cerebro del sistema. Recibe las peticiones, comprueba quién es la persona y qué puede hacer, aplica las reglas del negocio y guarda los datos. También ejecuta, por su cuenta y a una hora fija, los recordatorios y avisos.")
h2("Tecnología")
ul("**NestJS 12** sobre **Node.js 24** y **TypeScript**: organiza el código en módulos con controladores y servicios.",
   "**Prisma 7** (con el adaptador de PostgreSQL) como acceso a la base de datos y para definir y versionar su estructura.",
   "**class-validator** y **class-transformer** para validar lo que llega; **Passport** con **JWT** para la sesión; **bcrypt** para guardar las contraseñas.",
   "**pdfkit** para los PDF y **exceljs** para los Excel; **nodemailer** para el correo; **@nestjs/schedule** para las tareas programadas; **@nestjs/throttler** para limitar intentos.")
h2("Mapa de módulos")
p("El código está dividido en módulos, uno por tema del negocio. {fig:d04-modulos} los agrupa por área.")
fig("d04-modulos", "Módulos del servidor, agrupados por área de negocio.")
h2("Anatomía de un módulo")
p("Todos los módulos siguen la misma forma, lo que hace fácil encontrar las cosas:")
tabla("modulo", "Piezas de un módulo", ["Pieza", "Qué hace", "Ejemplo"], [
    ["`x.module.ts`", "Declara qué contiene el módulo y qué otros necesita.", "`nomina.module.ts`"],
    ["`x.controller.ts`", "Define las rutas y el permiso que exige cada una. No tiene lógica de negocio.", "`nomina.controller.ts`"],
    ["`x.service.ts`", "Orquesta la operación: valida, abre la transacción, guarda, audita.", "`nomina.service.ts`"],
    ["`dto/`", "Forma y validaciones de lo que llega en cada petición.", "`corregir-pago-nomina.dto.ts`"],
    ["Reglas puras", "Funciones sin base de datos con los cálculos y reglas de dinero, fáciles de probar.", "`calculo-pago.ts`, `plan-de-pagos.ts`, `repartir-abono.ts`"],
    ["`*.spec.ts`", "Pruebas unitarias junto al código; las de base de datos real están en `backend/test`.", "`corregir-pago.spec.ts`"],
], [22, 48, 30])
h2("Autenticación y autorización")
ul("**Ingreso:** correo y contraseña. Las contraseñas se guardan con bcrypt (nunca en claro). El servidor entrega un token JWT con vigencia (por defecto 8 horas).",
   "**Bloqueo:** tras varios intentos fallidos, la cuenta se bloquea un tiempo; el número de intentos es un parámetro de Configuración. Además hay un límite por dirección IP en las rutas públicas (10 ingresos por minuto, 5 recuperaciones por hora).",
   "**Recuperación de contraseña:** por un enlace temporal enviado al correo.",
   "**Guardas globales:** todas las rutas pasan por una guarda de sesión y una de permisos. Cada ruta declara su permiso con `@Permiso(...)`; si no lo declara, nadie puede usarla.",
   "**Roles y permisos:** hay un catálogo fijo de 45 permisos en `auth/permisos.ts`. Un rol es una fila de la base de datos con una lista de permisos tomados de ese catálogo. Los roles del sistema se sincronizan solos al arrancar la API.",
   "**Alcance por proyecto:** solo el rol Consulta se puede limitar a algunos proyectos. Los servicios aplican esa restricción en cada consulta (`auth/alcance.ts`).",
   "**Soporte técnico de solo lectura:** una prueba automática falla si alguien deja una ruta de escritura protegida solo con permisos de consulta.")
h2("Auditoría")
p("Toda acción sobre dinero o sobre datos sensibles queda en el registro de auditoría: quién la hizo, cuándo, qué cambió y el valor anterior y el nuevo. El gerente la consulta desde la pantalla de Auditoría. Una prueba automática recorre el código y **falla si un archivo escribe en la base de datos sin registrar auditoría** (salvo una lista corta de excepciones justificadas). Los datos de salud nunca se copian a la auditoría, y los números de cuenta bancaria se enmascaran.")
h2("Configuración de la empresa")
p("Una sola fila de configuración guarda los datos y parámetros de la empresa: nombre, NIT, dirección, logo y colores, textos legales de los recibos, tasa de mora, días del semáforo, cuota inicial sugerida, plazo máximo, tiempo de inactividad, intentos de ingreso, si se envía el recibo por correo, días de alerta de SST y correos de avisos. Alrededor hay tablas de catálogo editables: cuentas bancarias, categorías de gasto e ingreso, medios de pago, valores de comisión, cargos de nómina y parámetros legales por año.")
h2("Consecutivos")
p("Los números de los recibos de caja, los recibos históricos y los cierres de caja salen de **un solo mecanismo**: una tabla con un contador por serie que se incrementa con una sola sentencia atómica dentro de la transacción de quien registra. Así, dos personas registrando a la vez no obtienen el mismo número, no hay saltos y un número nunca se reutiliza, aunque el documento se anule.")
h2("Tareas programadas")
tabla("crons", "Tareas automáticas del servidor (hora de Bogotá)", ["Hora", "Tarea", "Qué hace"], [
    ["8:00 a. m.", "Recordatorios", "Avisa por correo a los clientes con cuotas que vencen pronto. Salta las ventas con acuerdo de pago vigente."],
    ["8:05 a. m.", "Avisos de mora", "Avisa por correo a los clientes con cuotas vencidas. Salta las ventas con acuerdo de pago vigente."],
    ["8:10 a. m.", "Avisos de SST", "Correo por estado (próxima y vencida) al responsable de cada actividad o capacitación, y resumen de EPP por reponer."],
], [14, 22, 64])
p("Cada aviso se **reclama primero** (la cuota queda marcada como avisada) y se envía después, de modo que nadie recibe el mismo aviso dos veces. El resultado queda en el historial de notificaciones. Las copias de seguridad no las hace la API sino el sistema operativo del servidor (ver {fig:d06-copias}).")
fig("d09-recordatorios", "Tareas automáticas de cada mañana.")
h2("Correo y notificaciones")
p("Los correos (recibos, recordatorios, avisos de mora, recuperación de contraseña y avisos de SST) salen por **SMTP** con nodemailer. Las respuestas de los clientes llegan al *correo de contacto* de la empresa (cabecera Reply-To). Cada envío queda en una tabla de notificaciones con su estado: enviada, fallida u omitida. Si la empresa aún no tiene cuenta de correo configurada, el aviso se anota como *omitida* y no se pierde nada. WhatsApp no se envía desde el sistema: solo se arma el texto y el enlace para que una persona lo envíe.")
h2("Reportes y exportación")
ul("Un **motor de reportes** común produce cada reporte en tres formas: en pantalla (JSON), en PDF y en Excel. Los reportes de SST reutilizan el mismo motor.",
   "Los PDF recortan el texto largo con una utilidad común (`common/pdf-texto.ts`) para que las tablas no se desborden.",
   "El gerente puede **exportar todos los datos de la empresa a Excel** en cualquier momento.")
h2("Carga masiva desde Excel")
p("Hay dos importadores (ventas con su historia, y datos de SST). Ambos funcionan igual: se sube el archivo, el sistema hace una **prueba previa que siempre se revierte** y muestra qué cargaría y qué errores hay; si todo está bien, la confirmación guarda **todo o nada**. Cada fila pasa por los mismos servicios que las pantallas, así que se valida y se audita igual. Las plantillas de Excel son borradores hasta recibir los archivos reales de la empresa.")
h2("Archivos adjuntos")
p("Los comprobantes de pago, los documentos firmados y los certificados se guardan a través de una **interfaz de almacenamiento abstracta**. Hoy se escriben en disco, en un volumen del servidor (`uploads`); pasar a un servicio compatible con S3 solo exige cambiar esa pieza. Un adjunto **solo se descarga con sesión válida y permiso sobre el registro al que pertenece**: no existen enlaces públicos a documentos.")

# =====================================================================  7
h1("Datos")
simple("Toda la información queda en una base de datos PostgreSQL. La base no es un simple depósito: también tiene reglas propias que impiden ciertos errores aunque el servidor falle, como borrar un recibo o dos cierres de caja que se pisen.")
h2("Tecnología y organización")
ul("**PostgreSQL 16**, en un contenedor de Docker en producción y en desarrollo.",
   "**Prisma 7** define la estructura (`backend/prisma/schema.prisma`) y genera el acceso tipado. Cada cambio se guarda como una **migración** versionada (hoy son 33).",
   "El dinero se guarda como `Decimal`, nunca como número de coma flotante. Las operaciones de abonos y nómina usan pesos enteros.",
   "La fecha de cada movimiento se interpreta en la zona horaria de Bogotá.")
h2("Dominios de datos")
p("Los 56 modelos se agrupan por tema. La {tabla:dominios} lista los principales.")
tabla("dominios", "Modelos de la base de datos por dominio", ["Dominio", "Modelos"], [
    ["Acceso, configuración y control", "Usuario, RolUsuario, UsuarioProyecto, RecuperacionPassword, ConfiguracionEmpresa, CuentaBancaria, CategoriaGasto, CategoriaIngreso, MedioPagoConfig, ComisionTipoVendedor, Consecutivo, RegistroAuditoria"],
    ["Proyectos y lotes", "Proyecto, Manzana, Lote, LoteHistorial"],
    ["Clientes y ventas", "Cliente, Vendedor, Separacion, Venta, DocumentoVenta, Desistimiento, Cuota, AcuerdoPago, Comision"],
    ["Pagos y caja", "Abono, AplicacionAbono, Recibo, MovimientoFinanciero, CierreCaja, CierreCajaHistorial, Notificacion"],
    ["Personas y nómina", "Trabajador, CargoNomina, PagoNomina, NovedadNomina, DocumentoTrabajador"],
    ["Seguridad social y SST", "EntidadSS, ClaseRiesgoArl, ParametroLegal, AfiliacionTrabajador, ElementoEpp, EntregaEpp, ActividadPlan, Capacitacion, AsistenciaCapacitacion, DocumentoSst, AvisoSst, TipoAusentismo, DiagnosticoCie10, Ausentismo, AusentismoPeriodo, RecobroAusentismo"],
    ["Maquinaria", "TipoEquipo, Equipo"],
    ["Carga masiva", "Importacion"],
], [24, 76])
h2("Cómo se relaciona lo principal")
ul("Un **proyecto** tiene **manzanas** y **lotes**. Un lote se vende en una **venta**, que pertenece a un **cliente** y a un vendedor.",
   "Una venta financiada tiene un **plan de cuotas** (la cuota 0 es la cuota inicial). Los **abonos** se reparten sobre las cuotas mediante *aplicaciones de abono* y cada abono genera un **recibo** con su consecutivo.",
   "Un **acuerdo de pago** pausa los avisos y el interés de mora de una venta mientras esté vigente.",
   "Un **pago de nómina** pertenece a un trabajador y a una obra (un proyecto) y puede tener **novedades** (anticipos, descuentos).",
   "Los **cierres de caja** agrupan los movimientos por período y, una vez cerrados o aprobados, bloquean nuevos registros de esos días.")
h2("Protecciones dentro de la base de datos")
p("Además de las validaciones del servidor, la base tiene unas 39 protecciones propias (disparadores y restricciones, repartidas en 13 migraciones). Algunos ejemplos:")
ul("Dos cierres de caja no pueden cubrir el mismo día.",
   "Una entrega de EPP, un registro de ausentismo o un acuerdo de pago no se editan ni se borran: se anulan o se cierran con motivo.",
   "Una afiliación o un documento de un trabajador registrado por error no se borra: se cierra y se registra el correcto.")
h2("Cómo cambia la base de datos")
ol("El cambio se escribe como una migración. **Solo se aceptan migraciones aditivas** (tablas o columnas nuevas, opcionales) mientras haya datos reales.",
   "Antes de publicar, se **ensaya la migración sobre una base con datos** y se comprueba que los conteos queden intactos.",
   "En producción, se hace una copia manual y se despliega: un contenedor aparte (`migrar`) aplica la migración y la API no arranca hasta que termine bien.")
consejo("Las bases de demostración son bases aparte y no reciben solas las migraciones nuevas: después de un cambio hay que regenerarlas (`npm run demo:compilar` y `npm run demo:preparar -- --reiniciar`).")

# =====================================================================  8
h1("Seguridad")
simple("La seguridad no depende de una sola barrera. Hay varias capas: quién puede entrar, qué puede hacer cada persona, cómo viajan y se guardan los datos, cómo está protegido el servidor y qué pasa si algo se pierde. Si una capa falla, las otras siguen protegiendo.")
tabla("seguridad", "Capas de seguridad", ["Capa", "Qué se hace"], [
    ["Ingreso", "Contraseñas guardadas con bcrypt. Bloqueo temporal de la cuenta tras varios intentos fallidos. Límite de peticiones por IP en las rutas públicas. Cierre de sesión por inactividad."],
    ["Permisos", "Validados en el servidor en cada operación. Roles con permisos tomados de un catálogo fijo. Consulta puede limitarse por proyecto. Soporte técnico es solo lectura, con una prueba automática que lo vigila."],
    ["Datos sensibles", "Diagnósticos de salud con permiso propio (el administrador no los ve por defecto) y cada consulta queda auditada. Datos bancarios de trabajadores solo con permiso de nómina. Autorización de datos personales (Ley 1581) registrada por cliente."],
    ["Dinero", "Todo movimiento auditado. Anulaciones solo del gerente y con motivo. Cierres de caja con aprobación. Verificación de los pagos contra el extracto. Un día cerrado no admite registros nuevos."],
    ["Archivos", "Descarga solo con sesión y permiso sobre el registro. Sin enlaces públicos. Tipos y tamaños limitados."],
    ["Transporte", "Siempre HTTPS (HSTS por un año). Cabeceras de seguridad: no adivinar tipos, no abrir en marcos, política de referencia y permisos del navegador. CORS limitado al dominio del sistema."],
    ["Servidor", "Acceso SSH solo con llave; el usuario root y las contraseñas están cerrados. Cortafuegos con solo los puertos 22, 80 y 443. fail2ban contra quien insista en adivinar claves. Actualizaciones de seguridad automáticas."],
    ["Contenedores", "Solo el proxy publica puertos. La base de datos y la API no son visibles desde afuera. La API corre con un usuario sin privilegios."],
    ["Secretos", "Nunca están en el código ni en Git. Viven en el archivo `.env` del servidor y en el gestor de contraseñas. Las copias de ese archivo van cifradas."],
    ["Copias", "Diarias, cifradas antes de salir del servidor y con bloqueo contra borrado (Object Lock) en la nube. Prueba de restauración mensual."],
], [18, 82])

# =====================================================================  9
h1("Infraestructura y despliegue")
simple("El sistema vive en un servidor virtual alquilado (un VPS). Dentro, cuatro contenedores de Docker hacen el trabajo: uno atiende a los navegadores, otro corre las reglas del negocio, otro guarda la base de datos y otro la prepara cada vez que hay una versión nueva. Publicar una versión es copiar un paquete al servidor y ejecutar un guion.")
h2("Componentes")
tabla("infra", "Infraestructura de producción", ["Elemento", "Valor"], [
    ["Dominio", "`balderingenieria.com` (Hostinger)"],
    ["Plataforma administrativa", "`sistema.balderingenieria.com`"],
    ["Página pública de la empresa", "`balderingenieria.com`: proyecto aparte, que comparte el mismo proxy"],
    ["Servidor", "VPS KVM 2 de Hostinger: 2 vCPU, 8 GB de memoria, 100 GB de disco"],
    ["Sistema operativo", "Ubuntu 26.04 LTS"],
    ["Contenedores", "Docker Engine y Docker Compose; cuatro contenedores en una red interna"],
    ["Certificado HTTPS", "Let's Encrypt, que Caddy obtiene y renueva solo"],
    ["Ubicación del sistema en el servidor", "`/opt/balder` (código en `fuente`, secretos en `.env`)"],
], [34, 66])
fig("d03-produccion", "Arquitectura de producción en el servidor.")
h2("Los cuatro contenedores")
tabla("contenedores", "Contenedores de Docker", ["Contenedor", "Qué es", "Notas"], [
    ["`proxy`", "Caddy: recibe las visitas, gestiona el certificado HTTPS, sirve las pantallas y reenvía `/api/*` a la API.", "Único con puertos hacia afuera (80 y 443)."],
    ["`api`", "El servidor de la aplicación (NestJS) en el puerto interno 3000.", "No publica puertos. Corre con un usuario sin privilegios y tiene chequeo de salud."],
    ["`db`", "PostgreSQL 16.", "No publica puertos. Sus datos están en el volumen `pgdata`."],
    ["`migrar`", "Aplica las migraciones pendientes y se apaga.", "La API no arranca si no terminó bien."],
], [14, 50, 36])
p("Hay dos volúmenes que sobreviven a cualquier actualización: `pgdata` (la base de datos) y `uploads` (los adjuntos). Los dos entran en la copia de seguridad.")
h2("Variables de entorno")
p("Los valores secretos no están en el código: salen del archivo `/opt/balder/.env` del servidor. La {tabla:variables} lista las variables sin sus valores.")
tabla("variables", "Variables del archivo .env del servidor", ["Variable", "Para qué sirve", "¿Secreta?"], [
    ["`POSTGRES_DB`, `POSTGRES_USER`", "Nombre de la base de datos y su usuario.", "No"],
    ["`POSTGRES_PASSWORD`", "Contraseña de la base de datos.", "Sí"],
    ["`JWT_SECRET`", "Firma de los tokens de sesión. Si cambia, todas las sesiones se cierran.", "Sí"],
    ["`JWT_EXPIRES_IN`", "Vigencia de la sesión (por defecto 8 horas).", "No"],
    ["`DOMINIO`", "Dominio del sistema; de él sale la dirección usada en los enlaces de los correos.", "No"],
    ["`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_FROM`", "Cuenta de correo desde la que salen los avisos.", "No"],
    ["`SMTP_PASS`", "Contraseña de la cuenta de correo (de aplicación, no la normal).", "Sí"],
    ["`LIMITE_LOGIN_*`, `LIMITE_RECUPERAR_*`, `LIMITE_RESTABLECER_*`", "Límites de peticiones por IP (opcionales).", "No"],
], [34, 52, 14])
h2("Cómo se publica una versión nueva")
fig("d05-despliegue", "Pasos para publicar una versión.")
p("Antes de armar el paquete, **todo lo que se va a publicar debe estar en un commit**: el paquete sale del último commit, no de los archivos sueltos. Los pasos son:")
ol("En el computador, se arma el paquete con lo que está en Git y se copia al servidor.",
   "En el servidor, se comprueba que el paquete no esté dañado y se hace una copia de seguridad manual.",
   "Se ejecuta el guion de despliegue, que construye las imágenes, aplica las migraciones y arranca la versión nueva.",
   "Se comprueba que el sistema y la página pública respondan.")
p("En el computador:")
codigo("git archive --format=tar.gz -o paquete.tar.gz HEAD backend frontend deploy\nscp paquete.tar.gz deploy@<servidor>:/tmp/")
p("En el servidor:")
codigo("gzip -t /tmp/paquete.tar.gz\nbash /opt/balder/fuente/deploy/produccion/respaldos/respaldar.sh\nbash /opt/balder/fuente/deploy/produccion/desplegar.sh /tmp/paquete.tar.gz\ncurl -s -o /dev/null -w \"%{http_code}\\n\" https://sistema.balderingenieria.com/api/salud\ncurl -s -o /dev/null -w \"%{http_code}\\n\" https://balderingenieria.com")
p("Las dos últimas líneas deben responder `200`. El guion de despliegue **no toca** el archivo `.env` **ni los datos**.")
importante("El paquete incluye los archivos `Caddyfile` y `docker-compose.yml` de `deploy/produccion`, que configuran el proxy compartido con la página pública. Si se despliega un paquete armado antes de que esos archivos estuvieran en Git, la página pública puede caerse. Por eso el paquete se arma siempre desde un commit que ya los contiene.")
h2("Versiones con migración o con catálogos nuevos")
ul("**Antes de desplegar**, una copia manual con `respaldar.sh`: es el punto de retorno.",
   "El despliegue aplica la migración solo. Los roles nuevos y sus permisos se sincronizan solos al arrancar la API.",
   "**Después de desplegar**, si la versión trae catálogos iniciales (entidades de seguridad social, parámetros legales, tipos de ausentismo, códigos CIE-10, elementos de EPP), se ejecuta `sembrar-catalogos.sh`. Es seguro repetirlo: solo crea lo que falta y no pisa lo que el gerente ya editó.")
h2("Si una versión sale mal")
p("El guion de despliegue guarda el código anterior. Para volver atrás se intercambian las carpetas `fuente` y `fuente.anterior` y se reconstruye. Si además hubo un daño en los datos, se restaura la copia tomada antes de desplegar (ver la sección siguiente).")
h2("Comandos útiles en el servidor")
p("Se ejecutan dentro de `/opt/balder/fuente/deploy/produccion`:")
tabla("comandos", "Comandos de operación", ["Qué", "Comando"], [
    ["Ver si todo está sano", "`docker compose --env-file /opt/balder/.env ps`"],
    ["Ver los registros de la API en vivo", "`docker compose --env-file /opt/balder/.env logs -f api`"],
    ["Reiniciar solo la API", "`docker compose --env-file /opt/balder/.env restart api`"],
    ["Ver los registros del servidor web", "`docker compose --env-file /opt/balder/.env logs --tail 50 proxy`"],
], [40, 60])
importante("**Nunca se usa** `docker compose down -v` **en el servidor.** La opción `-v` borra los volúmenes: la base de datos y los adjuntos desaparecerían. Para apagar sin riesgo se usa `down` sin `-v`.")

# =====================================================================  10
h1("Copias de seguridad y recuperación")
simple("Cada noche el sistema saca una copia completa de la base de datos y de los archivos, la cifra y la guarda lejos del servidor. Una vez al mes comprueba por su cuenta que esa copia sirve de verdad. Si el servidor se pierde, se puede levantar uno nuevo y recuperar los datos de la última copia.")
fig("d06-copias", "Copias de seguridad y prueba de restauración.")
tabla("copias", "Esquema de copias de seguridad", ["Aspecto", "Cómo funciona"], [
    ["Cuándo", "Cada noche a las 2:00 a. m. (hora de Bogotá), con un temporizador del sistema (systemd)."],
    ["Qué se copia", "La base de datos completa, los adjuntos (`uploads`) y el archivo de secretos (`.env`)."],
    ["Cifrado", "Contenido y nombres de archivo se cifran en el servidor antes de salir, con rclone crypt y dos contraseñas. En la nube solo hay datos ilegibles."],
    ["Dónde", "Un depósito (bucket) privado de Backblaze B2, con Object Lock."],
    ["Verificación", "Antes de subir se lee cada archivo entero; después se compara su tamaño en la nube con el local."],
    ["Retención", "En el servidor, 3 días (restauración rápida). En la nube, 30 días: una regla de ciclo de vida borra lo más viejo. Los guiones nunca borran nada en la nube."],
    ["Prueba", "Cada día 1 del mes, a las 3:30 a. m., se restaura la última copia en una base temporal, se compara con la real y se borra. El resultado esperado es *PRUEBA OK*."],
    ["Avisos de fallo", "healthchecks.io avisa por correo si una copia o una prueba falla o si no llega su aviso de terminado. UptimeRobot consulta desde afuera la dirección `/api/salud` y avisa si el sistema no responde."],
], [18, 82])
importante("Las **dos contraseñas de cifrado** de las copias no se pueden recuperar: si se pierden, las copias en Backblaze son ilegibles para siempre. Deben estar en el gestor de contraseñas y en el Anexo de registro de credenciales.")
h2("Si el servidor se pierde: recuperación total")
ol("Reunir, del gestor de contraseñas, las dos contraseñas de cifrado, el nombre del depósito y las llaves de Backblaze.",
   "Crear un servidor nuevo y repetir la preparación (proteger el servidor e instalar Docker).",
   "Instalar rclone y recrear su configuración con las mismas contraseñas.",
   "Recuperar el archivo `.env` desde la copia más reciente.",
   "Desplegar el sistema con el guion de siempre. Como el `.env` ya existe, no se generan contraseñas nuevas.",
   "Restaurar los datos con `restaurar.sh real`, que pide escribir `RESTAURAR` y trae la última copia (o una anterior si se indica).",
   "Apuntar el DNS al servidor nuevo si cambió la dirección, y comprobar entrando con un usuario conocido y revisando un recibo.")
p("No hace falta copiar el código (vive en Git), las imágenes de Docker (se reconstruyen con el despliegue) ni los certificados HTTPS (Caddy los vuelve a pedir solo).")

# =====================================================================  11
h1("Calidad, pruebas y entornos")
simple("Cada vez que se cambia algo, se corren miles de pruebas automáticas que comprueban que los cálculos de dinero siguen bien y que cada rol sigue viendo solo lo que le corresponde. Además hay tres entornos separados: uno para programar, uno de demostración con datos inventados y el de producción.")
h2("Tipos de pruebas")
tabla("pruebas", "Pruebas automáticas", ["Tipo", "Qué comprueba", "Cantidad", "Cómo se corre"], [
    ["Unitarias", "Reglas y cálculos puros, servicios con una base simulada, permisos de las rutas.", "1.905 en 132 archivos", "`npx vitest run` en `backend`"],
    ["Extremo a extremo (e2e)", "El comportamiento contra una base PostgreSQL real, dentro de una transacción que siempre se revierte (no dejan datos).", "468 en 24 archivos", "`npx vitest run --config ./vitest.config.e2e.ts`"],
    ["Cobertura de auditoría", "Que ningún archivo escriba en la base sin registrar auditoría.", "Incluida en las unitarias", "Con las unitarias"],
    ["Rutas de Soporte técnico", "Que ninguna ruta de escritura quede protegida solo con permisos de consulta.", "Incluida en las unitarias", "Con las unitarias"],
    ["Análisis estático", "Tipos de TypeScript y reglas de calidad del código.", "Todo el código", "`npx tsc --noEmit` y `npx oxlint`"],
    ["Verificación en navegador", "Pantallas, flujos y diseño en celular (375 px).", "Manual, por cambio", "Servidor de demostración y panel del navegador"],
], [18, 40, 18, 24])
h2("Entornos")
tabla("entornos", "Entornos del proyecto", ["Entorno", "Para qué", "Datos", "Cómo se levanta"], [
    ["Desarrollo", "Programar y probar.", "De prueba, con datos inventados.", "PostgreSQL en Docker Desktop; API y pantallas con los comandos de cada carpeta."],
    ["Demostración", "Probar pantallas con un conjunto de datos completo y sacar las capturas del manual.", "Inventados; se generan en relación con la fecha de hoy.", "`npm run demo:compilar` y `npm run demo:preparar -- --reiniciar`; servidores `demo-api` y `demo-frontend`."],
    ["Producción", "El sistema real de la empresa.", "Reales (sujetos a la Ley 1581).", "VPS de Hostinger con Docker; solo se actualiza con el guion de despliegue."],
], [16, 30, 26, 28])
consejo("Nunca se usan datos personales reales en semillas ni en pruebas. Los archivos reales de la empresa se manejan en una carpeta local (`datos-reales/`) que Git ignora, bajo el acuerdo de confidencialidad firmado.")

# =====================================================================  12
h1("Herramientas y tecnologías")
simple("Esta sección es el catálogo completo de lo que se usa para construir, probar, publicar y mantener el sistema. Las versiones indican el rango que declara el proyecto.")
h2("Lenguajes, ejecución y base de datos")
tabla("t-base", "Lenguajes, ejecución y base de datos", ["Herramienta", "Versión", "Para qué se usa"], [
    ["TypeScript", "6.x (backend y frontend)", "Lenguaje de todo el código: detecta errores antes de ejecutar."],
    ["Node.js", "24", "Ejecuta el servidor y las herramientas de desarrollo."],
    ["PostgreSQL", "16", "Base de datos relacional del sistema."],
    ["SQL", "-", "Migraciones, disparadores y consultas atómicas (consecutivos, bloqueos)."],
], [26, 24, 50])
h2("Frontend")
tabla("t-front", "Herramientas del frontend", ["Herramienta", "Versión", "Para qué se usa"], [
    ["React y React DOM", "19.2", "Construir las pantallas con componentes."],
    ["React Router", "7.x", "Navegación entre pantallas y rutas protegidas."],
    ["Vite", "8.x", "Servidor de desarrollo y compilación de los archivos finales."],
    ["Tailwind CSS", "4.x", "Estilos y diseño adaptable."],
    ["lucide-react", "1.x", "Iconos."],
    ["clsx, tailwind-merge, class-variance-authority", "-", "Combinar y variar clases de estilo en los componentes."],
], [34, 18, 48])
h2("Backend")
tabla("t-back", "Herramientas del backend", ["Herramienta", "Versión", "Para qué se usa"], [
    ["NestJS", "12", "Marco del servidor: módulos, controladores, servicios, guardas."],
    ["Prisma y adaptador de PostgreSQL", "7.10", "Acceso a la base de datos, esquema y migraciones."],
    ["Passport y passport-jwt, @nestjs/jwt", "0.7 / 4 / 12", "Sesión con tokens JWT."],
    ["bcrypt", "6", "Guardar las contraseñas de forma segura."],
    ["class-validator y class-transformer", "0.15 / 0.5", "Validar y limpiar lo que llega a la API."],
    ["@nestjs/schedule", "12", "Tareas programadas (recordatorios y avisos)."],
    ["@nestjs/throttler", "6.7", "Límite de peticiones por dirección IP."],
    ["pdfkit", "0.20", "Generar recibos y reportes en PDF."],
    ["exceljs", "4.4", "Leer y generar archivos de Excel (importación, exportación, reportes)."],
    ["nodemailer", "10", "Enviar correos por SMTP."],
    ["dotenv, @nestjs/config", "18 / 12", "Leer las variables de entorno."],
], [34, 18, 48])
h2("Pruebas y calidad del código")
tabla("t-calidad", "Herramientas de pruebas y calidad", ["Herramienta", "Versión", "Para qué se usa"], [
    ["Vitest", "4.x", "Pruebas unitarias y de extremo a extremo; cobertura con @vitest/coverage-v8."],
    ["Supertest y @nestjs/testing", "7 / 12", "Probar la API como lo haría un cliente real."],
    ["oxlint", "1.x", "Revisión de calidad del código (más rápida que ESLint)."],
    ["Prettier", "3.x", "Formato uniforme del código del servidor."],
    ["tsc (compilador de TypeScript)", "6.x", "Verificación de tipos en todo el código."],
], [34, 18, 48])
h2("Infraestructura y operación")
tabla("t-infra", "Herramientas de infraestructura y operación", ["Herramienta", "Versión", "Para qué se usa"], [
    ["Docker Engine y Docker Compose", "-", "Empaquetar y correr los cuatro contenedores en el servidor."],
    ["Caddy", "2", "Proxy web, certificado HTTPS automático y servidor de las pantallas."],
    ["Let's Encrypt", "-", "Autoridad que emite los certificados HTTPS."],
    ["Ubuntu Server", "26.04 LTS", "Sistema operativo del servidor."],
    ["OpenSSH", "-", "Acceso al servidor solo con llave (ed25519)."],
    ["UFW", "-", "Cortafuegos: solo los puertos 22, 80 y 443."],
    ["fail2ban", "-", "Bloquea direcciones que insisten en adivinar claves."],
    ["unattended-upgrades", "-", "Actualizaciones de seguridad automáticas del sistema operativo."],
    ["systemd (servicios y temporizadores)", "-", "Programa la copia diaria y la prueba de restauración mensual."],
    ["rclone (con crypt)", "-", "Sube las copias a Backblaze cifradas y las recupera."],
    ["Scripts de Bash", "-", "Despliegue, copias, restauración, catálogos y creación del gerente (`deploy/`)."],
], [34, 18, 48])
h2("Servicios en la nube")
tabla("t-nube", "Servicios en la nube", ["Servicio", "Para qué se usa"], [
    ["Hostinger", "Dominio `balderingenieria.com`, registros DNS y el servidor VPS."],
    ["GitHub", "Repositorio del código (Git) y su historial de cambios."],
    ["Backblaze B2", "Almacenamiento de las copias de seguridad cifradas."],
    ["healthchecks.io", "Vigila que la copia diaria y la prueba mensual terminen bien; avisa por correo."],
    ["UptimeRobot", "Vigila desde afuera que el sistema responda; avisa por correo."],
    ["Servicio de correo (SMTP)", "Salida de los correos del sistema. Hoy, una cuenta Gmail exclusiva para avisos; está pendiente la cuenta definitiva a nombre de la empresa."],
    ["Docker Hub y registro de npm", "De donde se descargan las imágenes base (PostgreSQL, Node, Caddy) y las librerías al construir."],
], [30, 70])
h2("Desarrollo y documentación")
tabla("t-desarrollo", "Herramientas de desarrollo y documentación", ["Herramienta", "Para qué se usa"], [
    ["Git y GitHub", "Control de versiones; el trabajo se hace en la rama `feature/balder-adaptacion`."],
    ["Windows 11, PowerShell y Git Bash", "Entorno de trabajo del desarrollador."],
    ["Docker Desktop", "Base de datos PostgreSQL local para desarrollo y pruebas."],
    ["Claude Code (Anthropic)", "Asistente de programación usado para planear, construir y probar el sistema, siempre bajo las reglas de trabajo del proyecto (`CLAUDE.md`)."],
    ["Google Chrome y el panel de navegador", "Verificar las pantallas y sacar las capturas del manual de usuario."],
    ["Python 3 (matplotlib, Pillow, reportlab)", "Herramientas para generar los diagramas y los documentos (manual y este documento)."],
    ["Microsoft Word", "Edición final, índice y exportación a PDF de los documentos."],
], [34, 66])

# =====================================================================  13
h1("Servicios externos, cuentas y credenciales")
simple("El sistema depende de unas pocas cuentas en servicios externos. Cada una tiene un usuario y una contraseña que hay que saber dónde están, quién las conoce y qué pasa si se pierden. Aquí se explica el orden; los valores reales no se escriben en este documento sino en el Anexo de registro de credenciales, que es confidencial.")
h2("Qué cuentas existen")
tabla("cuentas", "Cuentas y accesos del proyecto", ["Cuenta o acceso", "Para qué sirve", "Si se pierde"], [
    ["Cuenta de Hostinger", "Administra el dominio, el DNS y el servidor VPS.", "Se recupera con el correo de la cuenta y el segundo factor. Sin ella no se puede administrar el dominio."],
    ["Llave SSH del desarrollador", "Entra al servidor como usuario `deploy`.", "Se puede entrar con la consola web de Hostinger y registrar una llave nueva."],
    ["Archivo `.env` del servidor", "Contiene las contraseñas de la base de datos y del correo y el secreto de las sesiones.", "Se recupera de la copia cifrada más reciente."],
    ["Contraseña de la base de datos", "Acceso a PostgreSQL.", "Está en el `.env`; no se usa a mano salvo mantenimiento."],
    ["`JWT_SECRET`", "Firma las sesiones.", "Se puede cambiar: cierra todas las sesiones, nada más."],
    ["Cuenta de correo de avisos (SMTP)", "Envía los correos del sistema.", "Se crea otra contraseña de aplicación y se cambian solo las variables `SMTP_*`."],
    ["GitHub", "Guarda el código y su historial.", "Se recupera con el correo y el segundo factor. El código también existe en el computador del desarrollador."],
    ["Backblaze B2", "Guarda las copias cifradas.", "Se pueden crear llaves nuevas; la cuenta se recupera con el correo."],
    ["Dos contraseñas de cifrado de las copias", "Cifran y descifran las copias.", "**No se recuperan.** Sin ellas las copias no se pueden leer."],
    ["healthchecks.io y UptimeRobot", "Vigilancia y avisos de falla.", "Se recrean; solo se pierde la vigilancia."],
    ["Usuarios del sistema (gerente, administrador, soporte técnico, otros)", "Entrar a la plataforma.", "El gerente restablece las contraseñas de los demás. La del gerente se recupera con el enlace de recuperación (si hay correo configurado) o con ayuda del desarrollador."],
], [28, 34, 38])
h2("Buenas prácticas que se siguen")
ul("**Un gestor de contraseñas** para guardarlas todas. Las dos contraseñas de cifrado de las copias deben estar ahí.",
   "**Contraseñas largas y distintas** para cada servicio, y verificación en dos pasos en Hostinger, GitHub, Backblaze y healthchecks.io.",
   "**Nunca** se envían contraseñas por WhatsApp ni por correo sin cifrar, y nunca se suben a Git.",
   "**Titularidad:** las cuentas y el dominio deben quedar a nombre de la empresa, como exige el acuerdo. Mientras no se transfieran, el titular debe estar anotado en el anexo.",
   "**Rotación:** se cambian las contraseñas cuando alguien con acceso deja el proyecto y, como mínimo, una vez al año.",
   "El **Anexo de registro de credenciales** se guarda fuera de Git (en `datos-reales/`, que Git ignora), preferiblemente cifrado o en un medio protegido, y se actualiza cada vez que cambie una credencial.")

# =====================================================================  14
h1("Tres flujos explicados")
simple("Para entender cómo trabajan juntas las piezas, aquí se siguen tres casos reales de principio a fin: registrar un abono, liquidar la nómina de una obra y los avisos automáticos de cada mañana.")
h2("Registrar un abono")
fig("d07-abono", "Qué ocurre cuando se registra un abono.")
p("El abono es la operación de dinero más importante y la que más protecciones tiene:")
ul("La **validación** exige el valor en pesos enteros, una fecha que no sea futura, la cuenta de destino si el pago no es en efectivo y que el día no pertenezca a un cierre de caja ya cerrado.",
   "La **transacción** bloquea la venta, así dos abonos a la vez hacen turno y nunca se reparten sobre las mismas cuotas.",
   "El **reparto** aplica el abono a las cuotas pendientes en orden de vencimiento; el saldo y la cartera siempre cuadran.",
   "El **número de recibo** sale del consecutivo atómico, y la **auditoría** guarda quién, cuándo y los valores.",
   "Después, el recibo en PDF se genera cuando se pide, el correo al cliente sale solo si está activado y la caja, la cartera y el panel se actualizan solos porque leen los mismos registros.")
h2("Liquidar la nómina de una obra")
fig("d08-nomina", "La nómina por obra y quincena.")
p("La nómina se liquida **por obra y por quincena**: cada trabajador tiene un pago por obra, y si trabajó en dos obras tiene un pago en cada una.")
ul("Se calcula con días trabajados (admite medios días) por el valor día del trabajador, más las horas extra con su tarifa, menos el anticipo y los descuentos. Los pesos son enteros.",
   "Se guarda todo o nada. No se puede pagar dos veces al mismo trabajador en la misma obra y quincena; se avisa, sin impedir guardar, si los días en varias obras superan los de la quincena.",
   "Lo **devengado** es el costo de la obra y lo **pagado** es lo que sale de caja; por eso difieren cuando hubo anticipos.",
   "Si algo salió mal, desde **Nómina → Liquidaciones** se puede **corregir** cada pago con motivo obligatorio. Se recalcula y la auditoría guarda lo anterior y lo nuevo. Un día ya cerrado en caja no se corrige.")
h2("Los avisos automáticos de cada mañana")
p("Ya descritos en la sección 6 ({fig:d09-recordatorios}): a las 8:00, 8:05 y 8:10 el servidor avisa a los clientes y al equipo. Una cuota se marca como avisada antes de enviar el correo, de modo que no se repite, y una venta con acuerdo de pago vigente se salta.")

# =====================================================================  15
h1("Operación y mantenimiento")
simple("Un sistema en producción necesita revisiones sencillas y regulares. La mayor parte del trabajo ya es automática (las copias, los avisos, los certificados); lo humano es mirar que sigan funcionando y actuar rápido cuando algo avisa.")
h2("Rutinas recomendadas")
tabla("rutinas", "Rutinas de mantenimiento", ["Frecuencia", "Qué revisar", "Quién"], [
    ["Cada día", "Que la cola de *Por verificar* y las notificaciones fallidas del sistema estén al día.", "Administrador"],
    ["Cada semana", "Los avisos de healthchecks.io y UptimeRobot; el espacio libre del disco del servidor (`df -h`).", "Responsable técnico"],
    ["Cada mes", "El resultado de la prueba de restauración del día 1 (*PRUEBA OK*). Que las actualizaciones del sistema operativo se estén aplicando.", "Responsable técnico"],
    ["Cada trimestre", "Actualizaciones de las librerías y avisos de vulnerabilidades. Revisar quién tiene acceso a cada cuenta.", "Desarrollador"],
    ["Cada año", "Rotar las contraseñas. Probar una recuperación completa en un servidor de prueba. Revisar el plan del servidor y la renovación del dominio (vence el 27/10/2029).", "Responsable técnico y gerencia"],
], [16, 62, 22])
h2("Qué hacer cuando algo falla")
tabla("fallas", "Guía rápida de fallas", ["Síntoma", "Primeras acciones"], [
    ["La página no abre", "Ver si el servidor responde en el panel de Hostinger. En el servidor, `docker compose ... ps` y los registros del `proxy`. Revisar el DNS."],
    ["Error 502 o la plataforma no responde tras desplegar", "Ver los registros de `api` y de `migrar`. Si una migración falló, la API no arranca: corregir y volver a desplegar, o volver a la versión anterior."],
    ["La página pública se cayó tras desplegar", "Comparar `Caddyfile` y `docker-compose.yml` del servidor con los de Git. Volver a levantar el proxy: `docker compose --env-file /opt/balder/.env up -d proxy`."],
    ["No llegan los correos", "En Configuración → Correo de avisos, usar *Enviar correo de prueba*. Revisar las variables `SMTP_*` y la contraseña de aplicación. Ver el historial de notificaciones."],
    ["Alguien no puede ingresar", "Puede estar bloqueado temporalmente por intentos fallidos: esperar el tiempo de bloqueo o pedir al gerente que restablezca su contraseña."],
    ["Falló una copia de seguridad", "Llega un aviso de healthchecks.io. Revisar el estado del servicio `balder-respaldo` y sus registros en el servidor, y repetir la copia a mano con `respaldar.sh`."],
    ["Disco casi lleno", "`df -h` y `docker system df`. Limpiar imágenes viejas con cuidado. Jamás usar `down -v`."],
], [30, 70])
h2("Cómo agregar una función nueva")
p("Esta es la receta que se sigue siempre, y la que debería seguir quien continúe el desarrollo:")
ol("**Registrar el cambio de alcance** en `docs/requerimientos.md` (control de cambios) y obtener la aprobación.",
   "Si cambia la estructura de datos, escribir una **migración aditiva** y ensayarla sobre una base con datos.",
   "Crear el módulo (o ampliar uno): DTOs con sus validaciones, servicio con las reglas y, si escribe en la base, con **auditoría** dentro de la transacción.",
   "Declarar en el controlador el permiso de cada ruta con `@Permiso(...)`; si es un permiso nuevo, agregarlo al catálogo de `auth/permisos.ts` y decidir **a qué roles se entrega** (el administrador recibe los nuevos salvo que se excluyan; Soporte técnico solo si se agregan a mano).",
   "Poner las reglas de dinero en **funciones puras** con pruebas unitarias, y agregar una prueba contra la base real si hay bloqueos, consecutivos o cierres.",
   "Crear la pantalla, su ruta protegida y la función en `lib/api.ts`. Verificarla en el navegador, también a 375 px.",
   "Correr todas las pruebas, el compilador y el análisis de código; actualizar la documentación y publicar con el procedimiento normal.")
h2("Cambiar la cuenta de correo de avisos")
p("Solo se cambian las variables `SMTP_*` del archivo `/opt/balder/.env` del servidor y se reinicia la API. No hace falta tocar el código ni hacer un despliegue. Después se comprueba con *Enviar correo de prueba* en Configuración.")

# =====================================================================  16
h1("Evolución y deuda técnica conocida")
simple("Ningún sistema está terminado. Esta lista dice con claridad qué se sabe que falta o que es mejorable, para que nadie se lleve sorpresas y para decidir con el cliente qué conviene hacer primero.")
tabla("deuda", "Límites y mejoras pendientes", ["Tema", "Situación actual", "Qué haría falta"], [
    ["Anular pagos de nómina", "Un pago se puede corregir, pero no anular. Un trabajador incluido por error o una quincena equivocada no se arreglan; un día en cierre cerrado no admite corrección.", "Migración aditiva con estado y motivo, y que caja, finanzas y reportes ignoren lo anulado."],
    ["Almacenamiento de archivos", "Disco del servidor, en un volumen que entra en la copia nocturna.", "Una implementación compatible con S3 de la interfaz de almacenamiento."],
    ["Correo definitivo", "Cuenta Gmail exclusiva para avisos creada por el desarrollador.", "Que la empresa cree una cuenta propia y se cambien las variables `SMTP_*`."],
    ["Edición de datos", "Proyectos, lotes (salvo precio y linderos), ventas y vendedores no tienen pantalla de edición.", "Pantallas de edición con auditoría."],
    ["Pruebas del frontend", "No hay corredor de pruebas automáticas en las pantallas.", "Incorporar Vitest con la autorización del desarrollador."],
    ["Listas sin paginación en el servidor", "Ventas, lotes, finanzas, comisiones y liquidaciones devuelven todos los registros. Cumple el rendimiento pedido hasta unas 2.000 ventas.", "Paginar y filtrar en el servidor antes de superar ese volumen."],
    ["Límite por IP en memoria", "El contador se reinicia con la API y solo vale con una instancia.", "Guardarlo en la base o en un servicio compartido si se agregan instancias."],
    ["Un solo servidor", "Si el VPS cae, el sistema no responde hasta restaurar.", "Las copias y la recuperación total cubren los datos; la alta disponibilidad es una decisión de costo."],
    ["Interés de mora", "Hoy es informativo; la tasa y el modo de cobro están por definir con el cliente.", "Definir la regla (RF-CAR-06) y, si se cobra, incluirla en los avisos."],
    ["Plantillas de importación", "Son un borrador hasta recibir los Excel reales de la empresa.", "Ajustar las plantillas al archivo real."],
    ["Definiciones provisionales", "La semana y la quincena del cierre de caja y de la nómina.", "Confirmarlas con el cliente."],
    ["WhatsApp", "Solo arma el texto y el enlace; no hay envío automático.", "Fuera de alcance por ahora."],
], [22, 44, 34])

# =====================================================================  17
h1("Glosario")
tabla("glosario", "Términos usados en este documento", ["Término", "Qué significa"], [
    ["API", "El servidor de la aplicación, al que las pantallas le piden y le mandan datos."],
    ["Auditoría", "Registro de quién hizo qué, cuándo y qué cambió."],
    ["Backend / Frontend", "La parte del servidor / la parte que ve la persona en el navegador."],
    ["Bucket", "Depósito de archivos en un servicio de almacenamiento en la nube (Backblaze B2)."],
    ["Caddy", "Programa que recibe las visitas, gestiona el certificado HTTPS y reenvía al servidor."],
    ["Commit", "Un conjunto de cambios guardado en el historial de Git."],
    ["Consecutivo", "Número que sube de uno en uno, sin saltos ni repetidos (por ejemplo, el de un recibo)."],
    ["Contenedor / Docker", "Una caja aislada con un programa y todo lo que necesita; Docker es la herramienta que las maneja."],
    ["DNS", "El directorio de internet que dice a qué servidor apunta un dominio."],
    ["DTO", "Descripción de la forma que debe tener lo que llega a una ruta de la API."],
    ["e2e (extremo a extremo)", "Pruebas que recorren el sistema contra una base de datos real."],
    ["HTTPS", "Conexión cifrada entre el navegador y el servidor (el candado)."],
    ["JWT", "Token firmado que prueba que la persona ya inició sesión."],
    ["Migración", "Un cambio versionado de la estructura de la base de datos."],
    ["Object Lock", "Bloqueo de Backblaze que impide borrar o modificar una copia durante un tiempo."],
    ["ORM / Prisma", "Herramienta que traduce entre el código y la base de datos; Prisma es la que usa el sistema."],
    ["Proxy", "Puerta de entrada del servidor: recibe las visitas y las reparte."],
    ["rclone", "Programa que copia archivos a la nube y puede cifrarlos."],
    ["Responsive", "Diseño que se adapta al tamaño de la pantalla (computador, tableta, celular)."],
    ["SMTP", "Protocolo con el que se envían los correos."],
    ["SST", "Seguridad y salud en el trabajo."],
    ["systemd", "Administrador de servicios y temporizadores del sistema operativo del servidor."],
    ["Transacción", "Un grupo de operaciones en la base de datos que se guardan todas o ninguna."],
    ["VPS", "Servidor virtual privado: una porción de un servidor físico alquilada a un proveedor."],
], [24, 76])
