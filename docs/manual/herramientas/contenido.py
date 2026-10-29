# -*- coding: utf-8 -*-
# Contenido del manual de usuario (una sola fuente para el PDF y el Word).
#
# Bloques:
#   ("cap", "Título")            capítulo (nivel 1 de APA, página nueva y numerado)
#   ("h2", "Título") ("h3", "Título")
#   ("p", "texto")               párrafo; **negrita** y *cursiva*; {fig:id} y {tabla:id} se vuelven "Figura N" / "Tabla N"
#   ("ul", [..]) ("ol", [..])
#   ("fig", "id")                figura (título y leyenda salen de capturas/manifiesto.json)
#   ("tabla", "id", "Título", [columnas], [[filas]], [anchos en %], "nota opcional")
#   ("aviso", "Consejo" | "Importante", "texto")
#   ("apendice", "Título")       apéndice (nivel 1 de APA, página nueva, con letra)

TITULO = "Manual de usuario del Sistema de gestión de urbanismo"
SUBTITULO = "Guía paso a paso para vender lotes, registrar abonos, cuidar la caja y entender las finanzas"
AUTOR = "Victor Alfonso Gutierrez Lopez"
EDICION = "Edición para Balder Ingeniería y Mantenimiento SAS"
VERSION = "Versión 1.2"
FECHA = "Octubre de 2026"

C = []  # contenido


def cap(t): C.append(("cap", t))
def h2(t): C.append(("h2", t))
def h3(t): C.append(("h3", t))
def p(t): C.append(("p", t))
def ul(*items): C.append(("ul", list(items)))
def ol(*items): C.append(("ol", list(items)))
def fig(i): C.append(("fig", i))
def tabla(i, titulo, cols, filas, anchos, nota=None): C.append(("tabla", i, titulo, cols, filas, anchos, nota))
def consejo(t): C.append(("aviso", "Consejo", t))
def importante(t): C.append(("aviso", "Importante", t))
def apendice(t): C.append(("apendice", t))


# =====================================================================  PRESENTACIÓN
C.append(("presentacion", "Presentación"))
p("Este manual explica, con palabras sencillas y con imágenes del propio sistema, cómo usar cada parte del Sistema de gestión de urbanismo. Está pensado para cualquier persona de la empresa, sin importar su experiencia con computadores: si sabes usar WhatsApp en el celular, puedes aprender a usar este sistema.")
p("El sistema sirve para una empresa que compra terrenos grandes, los divide en lotes y los vende de contado o con financiación propia. Ayuda a registrar los pagos de los clientes, entregar recibos, cuidar la caja, ver quién está atrasado y rendir cuentas a los socios. También lleva proyectos de remodelación y de maquinaria, y ayuda a cuidar al personal: sus afiliaciones a la seguridad social, los elementos de protección, el plan de trabajo y las capacitaciones de seguridad y salud en el trabajo, además de las incapacidades y licencias que se les reconocen.")
h2("Cómo está organizado")
p("Cada capítulo corresponde a una opción del menú del sistema y sigue el mismo orden: para qué sirve, quién puede usarlo, qué ventajas te da, los pasos explicados con imágenes y algunos consejos. Al final encontrarás un cuadro con lo que puede hacer cada rol, un glosario, las preguntas frecuentes y una guía para resolver problemas.")
h2("Cómo leer las imágenes")
ul("Los **círculos rojos con un número** señalan el botón, el campo o la zona de la que habla el texto. Debajo de cada imagen hay una lista que explica cada número.",
   "Los cuadros de **Consejo** te ayudan a trabajar mejor. Los cuadros de **Importante** te avisan de algo que no se puede deshacer o que conviene hacer con cuidado.",
   "Todas las imágenes usan **datos de demostración inventados** (personas, documentos, teléfonos y valores ficticios). Ningún dato real de la empresa ni de sus clientes aparece en este manual.")
h2("Esta versión del manual")
p("Este manual describe el sistema tal como está hoy. La versión 1.1 agregó el capítulo de Seguridad y salud en el trabajo. La versión 1.2 le suma el **ausentismo** (incapacidades y licencias con su liquidación de apoyo), los **reportes de SST** y la **carga de datos de SST desde Excel**, y actualiza Nómina, Importar desde Excel, Configuración, los permisos de cada rol, el glosario y las preguntas frecuentes. Cuando se agreguen funciones nuevas, el manual se actualizará y cambiará el número de versión que aparece en la portada.")
h2("Qué cambia según tu rol")
p("No todas las personas ven todas las opciones. El menú se adapta al rol que tiene tu cuenta (Gerente, Administrador, Consulta o Contratista SST). Si en este manual lees una opción que no aparece en tu menú, es porque tu rol no la incluye. En el Apéndice A hay un cuadro completo.")

# =====================================================================  1
cap("Conoce el sistema")
p("Antes de empezar, conviene entender qué es el sistema y cómo se reparten las tareas entre las personas que lo usan.")
h2("Qué es y qué no necesita")
p("Es una aplicación web: se usa desde el navegador (Chrome, Edge o el que prefieras) en un computador, una tableta o un celular. No hay que instalar nada. Cada persona ingresa con su correo y su contraseña, y ve solo lo que su rol permite.")
h2("Qué ventajas te da")
ul("**Todo en un solo lugar.** Proyectos, lotes, clientes, ventas, pagos, gastos y reportes dejan de estar repartidos entre cuadernos, hojas de cálculo y chats.",
   "**Recibos con numeración sin saltos.** Cada pago genera un recibo con su número, y ese número nunca se repite ni se reutiliza, ni siquiera si el recibo se anula.",
   "**Saldos siempre al día.** Cada abono se reparte solo entre las cuotas pendientes, por orden de vencimiento.",
   "**Cartera con semáforo.** Ves de un vistazo quién está al día, quién está por vencer y quién está en mora.",
   "**Control del dinero.** La caja se cierra por períodos, con conteo del efectivo y aprobación del gerente, y los pagos por banco se verifican contra el extracto.",
   "**Rendición de cuentas.** Hay un informe del proyecto pensado para el socio, y cada acción importante queda registrada: quién, cuándo y qué cambió.",
   "**Nada se borra por accidente.** La información de negocio no se elimina: se anula, se desactiva o se finaliza, y queda en el historial.")
h2("Quién hace qué")
tabla("roles", "Roles del sistema y sus responsabilidades", ["Rol", "Para qué sirve"], [
    ["Gerente", "Control total: configuración, usuarios, aprobaciones (ventas con excepción, cierres de caja, anulaciones) y auditoría."],
    ["Administrador", "Operación diaria: ventas, abonos, egresos, cierres de caja y personal. Ve todos los proyectos."],
    ["Consulta", "Solo mira: no cambia nada. Puede ver todos los proyectos o solo algunos (por ejemplo, un socio que solo sigue un proyecto)."],
    ["Contratista SST", "Persona externa encargada de la seguridad y salud en el trabajo. Solo ve y trabaja el módulo de Seguridad y salud: no ve dinero, salarios, clientes ni proyectos."],
    ["Cliente comprador", "No ingresa al sistema. Recibe sus recibos, recordatorios y avisos por correo o WhatsApp."],
    ["Sistema", "Hace solo las tareas automáticas: recordatorios de pago, avisos de mora y numeración de recibos."],
], [24, 76], "Nota. Los permisos de cada rol se detallan en el Apéndice A.")

# =====================================================================  2
cap("Primeros pasos")
p("En este capítulo aprendes a entrar al sistema, a recuperar tu contraseña si la olvidas, a moverte por el menú y a usarlo desde el celular.")
h2("Para qué sirve")
p("Es la puerta de entrada: sin ingresar con tu cuenta no puedes ver ninguna información de la empresa. Así se protege la información de los clientes.")
h2("Cómo ingresar")
p("Abre la dirección del sistema en tu navegador. Verás la pantalla de la {fig:ingreso}.")
ol("Escribe tu **correo** en el primer campo (1).",
   "Escribe tu **contraseña** en el segundo campo (2).",
   "Pulsa **Ingresar** (3).")
fig("ingreso")
importante("Por seguridad, después de varios intentos fallidos la cuenta se bloquea unos minutos (por defecto, 5 intentos y 15 minutos de bloqueo; el gerente puede cambiar estos valores). Además, si dejas el sistema sin usar por un rato (por defecto, 30 minutos), la sesión se cierra sola. Si pasa, vuelve a ingresar.")
h2("Si olvidaste tu contraseña")
p("No necesitas pedirle ayuda a nadie. Desde la pantalla de ingreso, pulsa **¿Olvidaste tu contraseña?** (4). Se abre la pantalla de la {fig:recuperar}.")
ol("Escribe el correo de tu cuenta (1).",
   "Pulsa **Enviar enlace** (2).",
   "Revisa tu correo: llega un enlace para elegir una contraseña nueva. El enlace sirve una sola vez y vence en poco tiempo (por defecto, 60 minutos).",
   "Abre el enlace, escribe tu contraseña nueva y confirma. Luego ingresa con ella.")
fig("recuperar")
p("Por seguridad, el sistema responde igual exista o no el correo escrito, para que nadie pueda averiguar quién tiene cuenta. Si el correo no llega, revisa la carpeta de correo no deseado o pídele al gerente que te restablezca la contraseña (lo explicamos en el capítulo de Usuarios y roles).")
h2("Conoce la pantalla principal")
p("Al ingresar llegas a la pantalla principal, que se ve en la {fig:menu}. A la izquierda está el **menú**: cada opción abre un módulo del sistema (1). Abajo del menú ves tu nombre y tu rol (2), y el botón para **cerrar sesión** (3).")
fig("menu")
consejo("Cuando termines de trabajar, cierra tu sesión, sobre todo si usas un computador compartido.")
h2("Cómo usarlo desde el celular")
p("El sistema se adapta a la pantalla del celular. En lugar del menú lateral, verás un botón con tres rayitas (1) en la parte de arriba, como se ve en la {fig:movil-panel}. Al tocarlo se abre el menú, como en la {fig:movil-menu}, y tocas la opción que necesites.")
fig("movil-panel")
fig("movil-menu")
consejo("Registrar un abono y consultar el estado de cuenta de un cliente funcionan perfectamente desde un celular Android. Los verás paso a paso en los capítulos de Clientes y de Abonos y recibos.")

# =====================================================================  3
cap("Panel general")
p("El panel general es la primera pantalla que ves al entrar. Resume cómo va la empresa en un solo vistazo.")
h2("Para qué sirve")
p("Te muestra cuánto dinero ha entrado y salido, cuánto debe la cartera, cuántos lotes hay en cada estado y qué tareas están pendientes. Es el lugar ideal para empezar el día.")
h2("Quién puede usarlo")
p("Todos los roles. Si tu cuenta está limitada a algunos proyectos, el panel solo suma lo de esos proyectos.")
h2("Qué ventajas te da")
ul("Ves la utilidad del período sin hacer cuentas a mano.",
   "Las tarjetas amarillas y rojas te dicen qué atender primero: cierres por aprobar, pagos sin verificar y comisiones por pagar.",
   "Puedes mirar toda la empresa o un solo proyecto con un clic, y descargar el resumen en PDF o Excel.")
h2("Paso a paso")
h3("Filtrar por fechas y por proyecto")
p("En la parte de arriba de la {fig:panel-finanzas} están los filtros: **Desde** y **Hasta** para elegir las fechas (1) y **Proyecto** para ver todos o solo uno (2). Los botones **Exportar PDF** (3) y **Exportar Excel** (4) descargan el panel. Si eres gerente o administrador también verás el botón **Enviar recordatorios de pago**, que manda ya los recordatorios que el sistema enviaría solo cada mañana.")
fig("panel-finanzas")
p("La sección **Finanzas** tiene cinco tarjetas: ingresos por ventas, ingresos generales, gastos, total de ingresos y, en azul, la **utilidad del período** (5), que es la caja neta: lo que ingresó menos lo que se gastó.")
h3("Leer los pendientes y la cartera")
p("Más abajo, la {fig:panel-pendientes} muestra los pendientes y la cartera. La tarjeta de **cierres de caja por aprobar** (1) cuenta los cierres que esperan la decisión del gerente. La de **pagos por verificar contra el extracto** (2) se pone roja cuando hay pagos esperando demasiado tiempo. En **Cartera**, la **cartera vencida** (3) es el dinero que los clientes ya debieron pagar, y el **interés de mora** (4) es el interés que ese atraso va acumulando.")
fig("panel-pendientes")
p("Si tu rol ve la seguridad y salud en el trabajo, al comienzo de los pendientes aparecen dos tarjetas más. **Gestión SST por atender** suma los elementos de protección por reponer y las actividades del plan y las capacitaciones que están próximas o vencidas. **Trabajadores con seguridad social por completar** cuenta a quienes todavía tienen alguna afiliación sin registrar, no tienen el certificado de afiliación o no han dado su autorización de datos de salud. Al tocarlas llegas al módulo de Seguridad y salud, que se explica en el capítulo 16.")
p("Debajo están los **lotes por estado** (disponibles, separados, vendidos, escriturados y desistidos) y una tabla **por proyecto** con la caja neta, la cartera vencida, lo que está por vencer y el interés de mora de cada uno.")
fig("panel-lotes")
h3("Ver un solo proyecto")
p("Elige un proyecto en el filtro (1). Todo el panel se recalcula, como se ve en la {fig:panel-proyecto}.")
fig("panel-proyecto")
consejo("Para volver a ver toda la empresa, pulsa **Quitar filtro** junto al selector de proyecto.")

# =====================================================================  4
cap("Proyectos y lotes")
p("Un proyecto es cada negocio de la empresa: un terreno que se divide en lotes, una remodelación o una flota de maquinaria. Dentro de un proyecto de lotes se registran las manzanas (si las hay) y cada lote.")
h2("Para qué sirve")
p("Aquí se organiza lo que la empresa vende: cuántos lotes tiene cada proyecto, de qué tamaño, a qué precio y en qué estado está cada uno. También se llevan los proyectos de remodelación y de maquinaria.")
h2("Quién puede usarlo")
p("Todos los roles pueden ver los proyectos. Crear proyectos y lotes lo hacen el gerente y el administrador. Marcar un proyecto como finalizado y dar de baja un equipo de maquinaria lo hace solo el gerente.")
h2("Qué ventajas te da")
ul("Cada lote tiene su **ficha** con área, precio, medidas y un **historial** de cada cambio de estado o de precio.",
   "El estado de un lote solo cambia con acciones claras (vender, separar, escriturar), y cada una queda anotada.",
   "El sistema te muestra cuánta área del terreno queda disponible para que no repartas de más.",
   "Los proyectos no se borran: se finalizan, y su historial se conserva.")
h2("Paso a paso")
h3("Ver los proyectos")
p("La opción **Proyectos** del menú abre la lista de la {fig:proyectos-lista}: nombre, tipo, ubicación, área total, número de lotes y estado. Desde aquí puedes crear un proyecto nuevo (1), ir directo a registrar una venta (2) o abrir un proyecto tocando su nombre (3).")
fig("proyectos-lista")
h3("Crear un proyecto")
p("Pulsa **Nuevo proyecto**. En el formulario de la {fig:proyecto-nuevo} escribe el **nombre** (1) y elige el **tipo** (2): venta de lotes, remodelación o maquinaria. Los demás datos (ubicación, municipio, área total, valor y fecha de compra) son opcionales, pero conviene llenar el área total si vas a dividir el terreno en lotes. Termina con **Registrar proyecto** (3).")
fig("proyecto-nuevo")
h3("Entender el detalle de un proyecto de lotes")
p("Al abrir un proyecto de venta de lotes ves la {fig:proyecto-detalle}. Arriba están el acceso a las **Finanzas** del proyecto (1), el botón **Marcar como finalizado** (2) y **Nuevo lote** (3). Las tarjetas muestran el área total, el área ya subdividida en lotes y el **área disponible** (4), que es lo que todavía no se ha repartido.")
fig("proyecto-detalle")
p("Más abajo puedes crear **manzanas** (por ejemplo A, B, C). Son opcionales: un proyecto sin manzanas funciona igual. Debajo está la lista de lotes, que puedes filtrar por manzana (1) y por estado (2), como en la {fig:proyecto-lotes}. En cada lote disponible hay un enlace **Vender**.")
fig("proyecto-lotes")
h3("Crear un lote")
p("Pulsa **Nuevo lote**. En la {fig:lote-nuevo} escribe el **número del lote** (1), que no se puede repetir dentro de la misma manzana; el **área** en metros cuadrados (2) y el **precio de venta** (3). El valor por metro cuadrado y las medidas y linderos son opcionales. Arriba del formulario el sistema te recuerda cuánta área disponible queda.")
fig("lote-nuevo")
h3("Ver la ficha de un lote y sus acciones")
p("Al tocar un lote se abre su ficha. La {fig:lote-disponible} muestra uno **disponible**, con tres acciones: **Vender** (1), **Separar** (2) y **Editar ficha** (3). Un lote vendido ofrece **Escriturar** en lugar de Vender y Separar. En el **historial** (abajo) queda cada cambio, como se ve en la {fig:lote-detalle}.")
fig("lote-disponible")
fig("lote-detalle")
p("Para **separar** un lote (apartarlo para un cliente interesado) pulsa **Separar**. Se abre el formulario de la {fig:lote-separar}. Todo es opcional: quién es el interesado, su teléfono, el valor que dejó, la fecha límite para formalizar la venta y una nota. El valor que dejó es solo informativo: el dinero se recibe después como abono a la cuota inicial.")
fig("lote-separar")
p("Para cambiar el precio o los linderos pulsa **Editar ficha** (3). En la {fig:lote-editar} puedes ajustar el área, el precio de venta (1) y escribir el motivo del cambio de precio (2). Guarda con **Guardar cambios** (3). Si cambias el precio, el cambio queda anotado en el historial del lote.")
fig("lote-editar")
h3("Proyectos de maquinaria")
p("Un proyecto de **maquinaria** no tiene lotes: tiene un **catálogo de equipos** (excavadoras, retroexcavadoras, volquetas, etc.), como en la {fig:maquinaria}. Pulsa **Nuevo equipo** (1) para agregar uno o toca un equipo (2) para ver su utilidad.")
fig("maquinaria")
p("En el formulario de la {fig:equipo-nuevo} escribe el nombre del equipo (1), elige su estado (activo, en mantenimiento o fuera de servicio) (2) y, si lo tiene, la placa o serie (3), que no se puede repetir entre equipos.")
fig("equipo-nuevo")
p("La **ficha del equipo** ({fig:equipo}) suma sus ingresos (por ejemplo, alquileres), sus egresos (combustible, repuestos, operario) y muestra su **utilidad** (2). Para anotar un movimiento pulsa **Registrar ingreso o egreso** (1). Se abre el formulario de la {fig:equipo-movimiento}, donde eliges a qué equipo pertenece (1) o lo marcas como gasto general de la flota. Un equipo no se borra: con **Dar de baja este equipo** (3) queda marcado y conserva su historial.")
fig("equipo")
fig("equipo-movimiento")
h3("Proyectos de remodelación")
p("Un proyecto de **remodelación** tampoco tiene lotes. En él se lleva el seguimiento de lo que entra y lo que sale: pulsa **Finanzas** (1) en la {fig:remodelacion} para registrar y revisar sus ingresos y egresos.")
fig("remodelacion")
consejo("Si un proyecto ya terminó, usa **Marcar como finalizado** en lugar de intentar borrarlo. Todo su historial queda guardado y puedes reactivarlo si hace falta.")

# =====================================================================  5
cap("Clientes")
p("Aquí se registran las personas o empresas que compran. Cada cliente tiene una ficha con su saldo, sus ventas y los avisos que se le han enviado.")
h2("Para qué sirve")
p("Es tu directorio de compradores y el punto de partida para registrar un abono: encuentras al cliente, ves cuánto debe y registras su pago.")
h2("Quién puede usarlo")
p("Todos los roles pueden ver los clientes. Crear y editar clientes lo hacen el gerente y el administrador.")
h2("Qué ventajas te da")
ul("Buscas por nombre, documento o teléfono y llegas a la ficha en segundos.",
   "En la ficha ves de inmediato el total vendido, lo pagado y el saldo.",
   "Puedes descargar el **estado de cuenta** en PDF para entregárselo al cliente.",
   "Queda registrada la autorización de tratamiento de datos de cada cliente, como exige la Ley 1581 de 2012 (Congreso de la República de Colombia, 2012).")
h2("Paso a paso")
h3("Buscar un cliente")
p("La opción **Clientes** muestra la lista de la {fig:clientes-lista}. Escribe en el buscador (2) el nombre, el documento o el teléfono, y la lista se filtra, como en la {fig:clientes-busqueda}. Para registrar un comprador nuevo pulsa **Nuevo cliente** (1).")
fig("clientes-lista")
fig("clientes-busqueda")
h3("Registrar un cliente nuevo")
p("En el formulario de la {fig:cliente-nuevo} escribe el **nombre completo** (1), elige el tipo de documento y escribe el **número de documento** (2), sin puntos ni espacios. El teléfono, el correo y la dirección son opcionales, pero conviene llenarlos: el teléfono se usa para los avisos por WhatsApp y el correo para enviar los recibos.")
fig("cliente-nuevo")
importante("Marca la casilla de autorización (3) **solo si el cliente autorizó** el uso de sus datos personales. El sistema guarda la fecha y quién lo anotó. El número de documento no se puede cambiar después, porque es la identidad del cliente.")
h3("Leer la ficha de un cliente")
p("Al abrir un cliente ves su ficha ({fig:cliente-ficha}). Arriba aparece un semáforo (al día, por vencer o en mora) y el botón **Estado de cuenta (PDF)** (1). Las tarjetas muestran lo vendido, lo pagado, el **saldo pendiente** (2) y lo vencido. En **Datos de contacto** puedes pulsar **Editar** (3). Más abajo está la **autorización de tratamiento de datos** (4) y, si el cliente no la tiene registrada, la ficha te lo avisa.")
fig("cliente-ficha")
p("Más abajo están las **ventas** del cliente ({fig:cliente-ventas}), cada una con sus acciones: **Registrar abono** (1), **Ver venta** (2) y **Recordar cuota por WhatsApp** (3). Al final aparece el historial de **avisos enviados**.")
fig("cliente-ventas")
h3("Corregir los datos de un cliente")
p("Pulsa **Editar** en *Datos de contacto*. Se abre el formulario de la {fig:cliente-editar}: cambia el teléfono (1) o el correo (2) y guarda con **Guardar cambios** (3).")
fig("cliente-editar")
h3("Consultar un cliente desde el celular")
p("La ficha también funciona en el celular, como muestra la {fig:movil-cliente}. Desde ahí descargas el **estado de cuenta** (1) para compartirlo.")
fig("movil-cliente")
h3("El estado de cuenta en PDF")
p("El **estado de cuenta** ({fig:estado-cuenta-pdf}) es un documento listo para entregar al cliente: resume lo vendido, lo pagado y lo que debe, muestra cada cuota con su vencimiento y su estado, y lista los abonos con su número de recibo.")
fig("estado-cuenta-pdf")

# =====================================================================  6
cap("Ventas")
p("Una venta une un lote, un comprador y una forma de pago. Desde aquí se registran las ventas de contado y las financiadas por la empresa, y se hace seguimiento a cada una.")
h2("Para qué sirve")
p("Registrar la venta de un lote genera automáticamente su plan de cuotas (si es financiada) y deja el lote como vendido. Desde el detalle de la venta se registran los abonos, se adjuntan los documentos firmados y, si el comprador se retira, se registra el desistimiento.")
h2("Quién puede usarlo")
p("Todos los roles ven las ventas. Registrar ventas lo hacen el gerente y el administrador. Aprobar o rechazar una venta con excepción, y registrar un desistimiento, lo hace solo el gerente.")
h2("Qué ventajas te da")
ul("El plan de cuotas se calcula solo, con valores en pesos enteros y sin errores de suma.",
   "Las condiciones del negocio (cuota inicial, plazo máximo) vienen de la configuración, así que no dependen de la memoria de nadie.",
   "Las ventas que se salen de las reglas (por ejemplo, una cuota inicial menor) quedan **pendientes de aprobación** del gerente, con su motivo.",
   "Todos los documentos firmados quedan adjuntos a la venta.")
h2("Paso a paso")
h3("Ver las ventas")
p("La opción **Ventas** ({fig:ventas-lista}) lista todas las ventas con su estado: **Activa**, **Pendiente de aprobación**, **Rechazada** o **Desistida**. Puedes filtrar por estado (2). Si hay ventas con excepción, aparece un aviso amarillo, y el gerente ve los botones **Aprobar** (3) y **Rechazar** (4) junto a cada una. Para registrar una venta nueva pulsa **Registrar venta** (1).")
fig("ventas-lista")
h3("Registrar una venta")
p("En la {fig:venta-nueva}, lo primero es elegir el **lote** (1). Solo aparecen los lotes disponibles o separados.")
fig("venta-nueva")
p("Después elige el **comprador**: un *cliente existente* de la lista o un *cliente nuevo*, que se crea en el mismo formulario ({fig:venta-comprador-nuevo}). Si quieres, indica el **vendedor** (sin vendedor, uno ya registrado o uno nuevo); si tiene vendedor, la venta genera su comisión.")
fig("venta-comprador-nuevo")
p("Luego elige la **forma de pago**.")
h3("Venta de contado")
p("Elige **Contado** (1) como en la {fig:venta-contado}. El valor total aparece ya escrito con el precio del lote, pero puedes cambiarlo. Si el cliente pagó todo hoy, marca **Ya se recibió el pago completo** (2) y elige el medio de pago: el sistema registra el abono y emite el recibo. Si todavía no pagó, déjala sin marcar y registra el abono después. Termina con **Registrar venta** (3).")
fig("venta-contado")
h3("Venta financiada")
p("Elige **Financiado** (1) y se despliegan las condiciones, como en la {fig:venta-financiada}. La **cuota inicial** se puede escribir como porcentaje (por defecto, 30 %) o como valor, y el **número de cuotas** (por defecto, 12) divide el saldo. El sistema te muestra al instante la cuota inicial, el saldo a financiar y el valor aproximado de cada cuota. La financiación de la empresa no cobra interés. Si el cliente ya entregó la cuota inicial, marca la casilla y elige el medio de pago.")
fig("venta-financiada")
importante("Si la cuota inicial queda por debajo del mínimo o el plazo supera el máximo configurados, la venta se guarda como **pendiente de aprobación** y pide un motivo. No se genera su plan de cuotas hasta que el gerente la apruebe.")
h3("Seguir una venta")
p("El detalle de una venta ({fig:venta-financiada-detalle}) tiene arriba el botón **Registrar abono** (1) y tres tarjetas: lo que el cliente ya pagó (2), el saldo pendiente (3) y la próxima cuota (4). También muestra si el cliente está al día o tiene cuotas vencidas.")
fig("venta-financiada-detalle")
p("Más abajo está el **plan de cuotas** ({fig:venta-cuotas}): la cuota inicial y cada cuota con su vencimiento, su valor y su estado (**Pagada**, **Parcial** o **Pendiente**).")
fig("venta-cuotas")
h3("Adjuntar los documentos firmados")
p("En la sección **Documentos firmados** ({fig:venta-documentos}) pulsa **Subir documentos** (1) para adjuntar el contrato o la promesa de compraventa firmados (PDF, PNG o JPG; hasta 10 a la vez). Quedan guardados con la venta y solo se pueden descargar con sesión iniciada. En esa misma zona está la **comisión de la venta** y, al final, **Registrar desistimiento** (2).")
fig("venta-documentos")
h3("Registrar un desistimiento")
p("Si el comprador se retira, el gerente pulsa **Registrar desistimiento**. Se abre el formulario de la {fig:desistimiento}: la fecha, cuánto se le **devuelve** al cliente (1), cuánto se **retiene** (2), el **motivo** (3) y, si la venta tenía una comisión pendiente, una casilla para anularla junto con el desistimiento. Confirma con **Confirmar desistimiento** (4).")
fig("desistimiento")
importante("El desistimiento no borra ningún abono ni recibo. La venta queda como desistida y el lote como desistido. Los valores a devolver y a retener los escribes tú: el sistema no mueve dinero, solo lo deja registrado.")
h3("Pagar o anular la comisión")
p("En la sección **Comisión de la venta** ({fig:comision-pagar}) pulsa **Pagar** y se abre el formulario con la fecha del pago (1) y el medio de pago (2). Al pulsar **Registrar el pago** (3) el sistema crea solo el egreso en Finanzas. **Anular** (solo el gerente) pide un motivo.")
fig("comision-pagar")

# =====================================================================  7
cap("Abonos y recibos")
p("Un abono es cualquier pago que hace un cliente: la cuota inicial, una cuota o un pago extra. Cada abono genera un recibo de caja.")
h2("Para qué sirve")
p("Registrar un pago, repartirlo automáticamente entre las cuotas y entregar al cliente un recibo oficial. Es la operación más frecuente del sistema.")
h2("Quién puede usarlo")
p("Registrar abonos y ver recibos: gerente y administrador (Consulta puede ver). Anular un abono: solo el gerente.")
h2("Qué ventajas te da")
ul("El valor se reparte solo entre las cuotas pendientes, empezando por la más antigua.",
   "Cada recibo tiene un número consecutivo, sin repetidos ni saltos.",
   "Puedes adjuntar la foto o el PDF del comprobante del banco.",
   "Un abono mal registrado no se borra: se anula con un motivo y queda en el historial.",
   "Cada pago queda con su recibo y su referencia, lo que evita los reclamos de “no me registraron mi abono”.")
h2("Paso a paso")
h3("Registrar un abono")
p("Entra a la ficha del cliente o al detalle de la venta y pulsa **Registrar abono**. Se abre la {fig:abono-nuevo}. Arriba ves el **saldo pendiente** (1). Escribe el **valor recibido** en pesos, sin puntos (2), la **fecha del pago** (3) y elige el **medio de pago** (4): efectivo, transferencia, consignación, Nequi o Daviplata. Termina con **Registrar abono y emitir recibo** (5).")
fig("abono-nuevo")
p("Si el pago no es en efectivo, el formulario pide dos datos más, como en la {fig:abono-transferencia}: la **cuenta donde entró el dinero** (1) y la **referencia de la transacción** (2), que no se puede repetir en la misma cuenta. Además puedes adjuntar el **soporte del pago** (3). Antes de guardar, el sistema te muestra cómo se aplicará el valor entre las cuotas.")
fig("abono-transferencia")
importante("Solo se aceptan valores en pesos enteros. Si te equivocas de valor, no lo corrijas escribiendo otro abono: pídele al gerente que anule el equivocado y registra uno nuevo.")
h3("Qué pasa después de registrar")
p("Aparece la confirmación de la {fig:abono-registrado} con el número del recibo. Desde ahí puedes abrir el recibo en PDF (1), registrar otro abono o ir a la venta. También puedes **avisar al cliente**: por WhatsApp (2), que abre el mensaje ya escrito (el PDF lo adjuntas tú), o por correo, que envía el recibo al correo del cliente. Si la empresa tiene activado el envío automático, el recibo sale solo al correo.")
fig("abono-registrado")
h3("Buscar y abrir recibos")
p("La opción **Recibos** ({fig:recibos-lista}) permite buscar un recibo por su número, por el nombre o documento del cliente, por el lote o por la referencia del pago (1). Puedes filtrar por estado (2): vigentes o anulados. Cada recibo tiene **Ver recibo** (3) y **Ver la venta** (4). Los recibos anulados aparecen marcados y con el valor tachado; los pagos ya confirmados contra el banco muestran la etiqueta **Verificado**.")
fig("recibos-lista")
h3("El recibo de caja")
p("El recibo ({fig:recibo-pdf}) trae los datos de la empresa, el número y la fecha, quién pagó, el proyecto, la manzana y el lote, el valor en números y en letras, el medio de pago, la cuenta y la referencia, las cuotas a las que se aplicó, el saldo anterior y el saldo nuevo, y el espacio para quién lo recibió.")
fig("recibo-pdf")
h3("Anular un abono")
p("En la lista **Abonos registrados** de la venta, el gerente pulsa **Anular** junto al abono. El sistema muestra un cuadro que explica qué va a pasar (el valor vuelve al saldo de la venta y el recibo queda marcado como ANULADO) y pide el **motivo**. El recibo se conserva y su número **no se vuelve a usar**.")
consejo("Escribe motivos claros al anular, como “Abono digitado dos veces por error”. El motivo queda en la auditoría y en el recibo anulado.")

# =====================================================================  8
cap("Pagos por verificar")
p("Cuando un cliente paga por transferencia, consignación o billetera digital, la empresa debe comprobar que el dinero de verdad llegó al banco. Esa comprobación se llama **verificar contra el extracto**.")
h2("Para qué sirve")
p("Evita que un comprobante falso o equivocado pase como pago real. Los pagos por banco quedan marcados **por verificar** hasta que alguien confirma que aparecen en el extracto.")
h2("Quién puede usarlo")
p("Gerente y administrador.")
h2("Qué ventajas te da")
ul("Cada pago por banco se compara con el extracto, no solo con una foto.",
   "Mientras tanto el pago **ya cuenta** en el saldo del cliente, así que el cliente no queda como deudor por una demora interna.",
   "Si un pago lleva muchos días sin verificar, el panel se pone en rojo para recordártelo.")
h2("Paso a paso")
p("La opción **Por verificar** ({fig:por-verificar-lista}) muestra cuántos pagos faltan y por cuánto dinero (1), y cuántos días lleva esperando el más antiguo (2). Puedes filtrar por **cuenta** (3) y por fechas. Cada fila indica el valor, el cliente, el medio, la cuenta, la referencia, la fecha en que pagó, el recibo y cuántos días lleva esperando.")
fig("por-verificar-lista")
ol("Abre el extracto de tu banco y comprueba que cada pago aparece.",
   "Marca los pagos que sí aparecen. Con **Elegir todos los que se ven** (4) los marcas todos de una vez.",
   "Escribe, si quieres, una **nota** (por ejemplo, el movimiento del extracto).",
   "Pulsa el botón **Confirmar** de la barra de abajo. El sistema te pregunta si estás seguro, porque no se puede deshacer.")
fig("por-verificar-seleccion")
importante("Si un pago **no aparece** en el extracto, no lo marques. Avisa al gerente: él puede anular ese abono con su motivo. Al confirmar un grupo de pagos, el sistema los verifica todos o ninguno.")
consejo("Los pagos en **efectivo** nunca se verifican. Qué medios exigen verificación lo decide el gerente en Configuración.")

# =====================================================================  9
cap("Caja y cierres")
p("El cierre de caja es el resumen de todo lo que entró y salió de la empresa en un período, con el conteo real del efectivo y la aprobación del gerente.")
h2("Para qué sirve")
p("Evita los descuadres. Compara lo que el sistema dice que debería haber en la caja con lo que realmente se cuenta, y obliga a explicar cualquier diferencia.")
h2("Quién puede usarlo")
p("Gerente y administrador generan y cierran los cierres. Solo el gerente los aprueba o los devuelve. Consulta no ve esta opción.")
h2("Qué ventajas te da")
ul("Los períodos son consecutivos y sin huecos: no se pueden saltar días.",
   "El efectivo esperado se calcula solo; tú solo cuentas el efectivo real.",
   "Si hay diferencia, hay que explicarla. Nada queda oculto.",
   "Un cierre aprobado no se puede modificar, y un día cerrado no admite registros nuevos.")
h2("Paso a paso")
h3("Ver los cierres y generar uno nuevo")
p("La opción **Caja** ({fig:caja-lista}) muestra abajo los cierres anteriores, cada uno con su número (3), su período, el efectivo contado, la diferencia y su estado (4). Para crear uno nuevo elige el **tipo** (1): diario, semanal (lunes a domingo) o quincenal (1 al 15 y 16 al fin de mes). El sistema te dice qué período cubrirá y con cuánto efectivo inicial (lo contado en el cierre anterior). Pulsa **Generar cierre** (2).")
fig("caja-lista")
importante("Primero debe aprobarse el cierre anterior. Además, un período no se puede cerrar antes de que termine; el sistema te lo indica con un mensaje.")
h3("Contar el efectivo y cerrar")
p("El cierre nuevo queda como **borrador** ({fig:cierre-borrador}). Los valores se calculan con lo registrado hasta ese momento. Cuenta el efectivo que hay en la caja y escríbelo en **Efectivo contado en la caja** (1). Si te equivocaste de período, puedes **descartar el borrador** (3): no se pierde ningún dato.")
fig("cierre-borrador")
p("Al escribir el valor, el sistema calcula la diferencia contra lo esperado ({fig:cierre-diferencia}). Si no cuadra, aparece el campo **Explica la diferencia** (1): es obligatorio explicarla. Cuando termines, pulsa **Cerrar caja** (2).")
fig("cierre-diferencia")
p("El cierre pasa a **Pendiente de aprobación** ({fig:cierre-cerrado}) y queda a la espera de la decisión del gerente.")
fig("cierre-cerrado")
h3("Aprobar o devolver un cierre (gerente)")
p("El gerente abre el cierre pendiente ({fig:cierre-detalle}). Arriba puede descargar el PDF (1). Revisa el efectivo esperado (2), el contado (3) y la diferencia (4). Después pulsa **Aprobar cierre** (5), o **Devolver con observación** (6) si algo debe corregirse; en ese caso el sistema pide escribir qué debe corregir el administrador.")
fig("cierre-detalle")
p("Más abajo el cierre muestra los totales **por medio de pago** y **por cuenta**, los **movimientos del período** y el **historial** de cada cambio de estado ({fig:cierre-medios}). Las anulaciones aparecen en el período en que se hicieron. Si hay pagos por verificar dentro del período, el cierre lo avisa, pero no impide cerrar.")
fig("cierre-medios")
p("El **cierre en PDF** ({fig:cierre-pdf}) incluye el efectivo de la caja, los totales del período, el detalle por medio de pago y por cuenta, los movimientos y los espacios de firma de quien lo elaboró (administrador) y de quien lo aprobó (gerente).")
fig("cierre-pdf")

# =====================================================================  10
cap("Cartera y mora")
p("La cartera es el dinero que los clientes le deben a la empresa. Esta pantalla te dice quién está al día, quién está por vencer y quién está en mora.")
h2("Para qué sirve")
p("Para saber a quién cobrar y cuándo. El semáforo ordena el trabajo de cobranza y te deja enviar un recordatorio por WhatsApp con un clic.")
h2("Quién puede usarlo")
p("Gerente, administrador y Consulta (solo lectura). Cada uno ve los proyectos que su rol permite.")
h2("Qué ventajas te da")
ul("Un **semáforo** claro: verde (al día), amarillo (próximo a vencer) y rojo (en mora).",
   "Ves el saldo vencido y el interés de mora de cada cliente.",
   "Desde la misma fila preparas el mensaje de cobro por WhatsApp.")
h2("Paso a paso")
p("La opción **Cartera** ({fig:cartera-lista}) muestra arriba la **cartera vencida** total (1) y el **interés de mora acumulado** (2). La tabla tiene una fila por cliente con su **estado** (3), el saldo vencido, el interés de mora, la próxima cuota y un enlace de **seguimiento** (4): **WhatsApp: recordar** si va al día, o **WhatsApp: mora** si está atrasado. Al pulsarlo se abre WhatsApp con el mensaje ya escrito; solo falta enviarlo.")
fig("cartera-lista")
p("Los clientes **en mora** (rojo) y los **próximos a vencer** (amarillo) se ven como en la {fig:cartera-mora}. Al final de la pantalla hay una tabla con la cartera vencida **por proyecto**.")
fig("cartera-mora")
importante("El interés de mora que ves es informativo: el sistema lo calcula por día con la tasa que el gerente deje en Configuración. La forma exacta de cobrarlo es una decisión de la empresa. Los avisos de mora que se mandan a los clientes, por ahora, no incluyen el interés.")
consejo("Cuántos días antes del vencimiento un cliente pasa a amarillo, y cuántos días de gracia hay antes de cobrar mora, se ajustan en Configuración.")

# =====================================================================  11
cap("Finanzas")
p("En Finanzas se anotan los gastos y los ingresos de la empresa que no son pagos de lotes (esos se registran como abonos) y se ve cuánto queda en caja.")
h2("Para qué sirve")
p("Controlar a dónde se va el dinero y de dónde viene: materiales, publicidad, servicios, trámites, alquileres de maquinaria, anticipos de remodelación y más, por proyecto o de toda la empresa.")
h2("Quién puede usarlo")
p("Ver: todos los roles. Registrar egresos e ingresos: gerente y administrador. Anular un egreso o ingreso: solo el gerente.")
h2("Qué ventajas te da")
ul("Cada gasto lleva su categoría, su proveedor y su soporte (la factura o el recibo).",
   "Si no hay soporte, el sistema exige explicar por qué, y lo deja marcado como **Sin soporte**.",
   "Ves la caja neta de toda la empresa y la de cada proyecto por separado.",
   "Nada se borra: un movimiento equivocado se anula y deja de sumar, pero queda a la vista.")
h2("Paso a paso")
h3("Leer el resumen")
p("La opción **Finanzas** ({fig:finanzas-lista}) tiene los filtros de fechas, proyecto, tipo y estado (2), las tarjetas de ingresos por ventas, otros ingresos, egresos, total de ingresos y la **caja neta** (3), y la **caja por proyecto** (4). Para anotar un movimiento pulsa **Registrar egreso o ingreso** (1).")
fig("finanzas-lista")
p("Debajo está la lista de **egresos e ingresos registrados** ({fig:finanzas-movimientos}), con su fecha, categoría, proyecto y valor (los egresos en rojo y los ingresos en verde). La etiqueta **Sin soporte** (1) avisa cuando falta el comprobante.")
fig("finanzas-movimientos")
h3("Registrar un egreso o un ingreso")
p("En el formulario de la {fig:egreso-nuevo} elige si es un **egreso** (gasto) o un **ingreso**, la **categoría** (1) y el **proyecto** (2) (o “general de la empresa”). Escribe la descripción, el **valor** en pesos (3), la fecha y el medio de pago. Si quieres, anota el proveedor (nombre, documento o NIT y número de factura). El **soporte** (4) es obligatorio: adjunta la imagen o el PDF, o explica por qué no lo hay.")
fig("egreso-nuevo")
consejo("Los pagos de clientes por lotes no se anotan aquí: se registran como abonos desde la venta o la ficha del cliente.")
h3("Ver o anular un movimiento")
p("Al tocar un movimiento se abre su detalle ({fig:egreso-detalle}). El gerente puede pulsar **Anular** (1): el sistema pide el motivo, el movimiento queda marcado como ANULADO y deja de sumar en los totales.")
fig("egreso-detalle")
h3("Finanzas de un proyecto")
p("Cada proyecto tiene sus propias finanzas ({fig:proyecto-finanzas}): ingresos por ventas, otros ingresos, egresos, la **utilidad** (1), el **valor vendido** (2), lo **recaudado** y el **saldo por cobrar** (3), seguido del detalle de cada movimiento. Es la base del informe para el socio.")
fig("proyecto-finanzas")

# =====================================================================  12
cap("Comisiones")
p("Cuando una venta tiene vendedor, genera una comisión de valor fijo según el tipo de vendedor (por ejemplo, asesor inmobiliario o referido). Esta pantalla las controla.")
h2("Para qué sirve")
p("Saber cuánto se debe pagar de comisiones, a quién, y dejar constancia de cuándo se pagó.")
h2("Quién puede usarlo")
p("Gerente y administrador ven y pagan comisiones. Solo el gerente las anula.")
h2("Qué ventajas te da")
ul("El valor de cada comisión sale de la configuración, no de la memoria.",
   "Al pagar una comisión, el sistema crea solo el egreso en Finanzas.",
   "Si la venta se desiste, la comisión se puede anular en el mismo momento.")
h2("Paso a paso")
p("La opción **Comisiones** ({fig:comisiones-lista}) tiene botones para exportar el reporte en PDF (1) o en Excel, filtros por **vendedor** (2), estado, proyecto y fechas, y tres tarjetas: **pendiente** (3), **pagada** y **anulada**, con su cantidad y su valor. Cada comisión muestra el vendedor, la venta, el valor y las acciones: **Pagar** (4), **Anular** y **Ver la venta**.")
fig("comisiones-lista")
p("Más abajo se ven las comisiones pagadas y las anuladas, con la fecha y el motivo ({fig:comisiones-detalle}). Para pagar una comisión, pulsa **Pagar** y sigue el formulario de la {fig:comision-pagar}: fecha, medio de pago y **Registrar el pago**.")
fig("comisiones-detalle")

# =====================================================================  13
cap("Reportes")
p("Los reportes convierten la información del sistema en documentos que puedes mirar en pantalla o descargar en PDF o Excel.")
h2("Para qué sirve")
p("Para rendir cuentas al socio, entregar información al contador o revisar un tema en detalle: recaudo, cartera, gastos, lotes, flujo de caja, comisiones y más.")
h2("Quién puede usarlo")
p("Todos los roles. Cada reporte respeta los proyectos que tu cuenta puede ver.")
h2("Qué ventajas te da")
ul("Ocho reportes listos, sin armar tablas a mano.",
   "Cada uno se puede ver antes de descargar, para confirmar que es lo que necesitas.",
   "El **informe del proyecto** está pensado para el socio: ventas y cobros, ingresos, egresos y utilidad, cartera e inventario de lotes de un solo proyecto.")
tabla("reportes", "Reportes disponibles", ["Reporte", "Qué muestra"], [
    ["Recaudo", "Lo que pagaron los clientes, con totales por medio de pago, por cuenta y por quién lo registró."],
    ["Cartera por edades de mora", "Lo que deben los clientes hoy, por vencer y vencido a 1–30, 31–60, 61–90 y más de 90 días."],
    ["Egresos por categoría y proyecto", "Lo gastado, por categoría y por proyecto. Incluye la nómina."],
    ["Inventario de lotes", "Cuántos lotes hay en cada estado y su valor de lista."],
    ["Flujo de caja", "Ingresos, egresos y saldo acumulado por día, semana, quincena o mes."],
    ["Comisiones", "Las comisiones por estado, por vendedor y una por una."],
    ["Informe del proyecto (para el socio)", "Resumen de un solo proyecto para rendir cuentas."],
    ["Maquinaria: utilidad por equipo", "Ingresos, egresos y utilidad de cada equipo, comparados con los gastos generales de la flota."],
], [34, 66])
h2("Paso a paso")
p("En la opción **Reportes** ({fig:reportes-catalogo}) cada tarjeta es un reporte; toca una (1) para elegirla. Aparece su formulario con los filtros (fechas, proyecto, medio de pago, etc.). Tienes tres botones: **Ver reporte** (2) para mirarlo en pantalla, **Descargar PDF** (3) y **Descargar Excel** (4).")
fig("reportes-catalogo")
p("El reporte en pantalla ({fig:reporte-recaudo}) muestra el período, los totales y las tablas. En pantalla se ven las primeras 500 filas; el archivo descargado trae todas.")
fig("reporte-recaudo")

# =====================================================================  14
cap("Notificaciones")
p("Las notificaciones son los avisos que el sistema le manda a los clientes: el recibo de cada pago, el recordatorio de una cuota próxima y el aviso de mora.")
h2("Para qué sirve")
p("Mantener informados a los clientes sin que nadie tenga que acordarse, y llevar el registro de cada aviso y su resultado.")
h2("Quién puede usarlo")
p("Gerente y administrador.")
h2("Qué ventajas te da")
ul("Los recordatorios y los avisos de mora salen **solos cada mañana** (8:00 a. m., hora de Colombia).",
   "Cada aviso queda en el historial, con su resultado, así se acaban los reclamos de “nunca me avisaron”.",
   "Por WhatsApp, el sistema arma el mensaje y abre la conversación; tú solo lo envías.")
h2("Los tres tipos de aviso")
tabla("avisos", "Tipos de aviso a clientes", ["Aviso", "Cuándo se manda", "Canal"], [
    ["Recibo", "Al registrar un abono (si está activado el envío automático).", "Correo (con el recibo en PDF) o WhatsApp"],
    ["Recordatorio de cuota", "Unos días antes del vencimiento (por defecto, 3).", "Correo o WhatsApp"],
    ["Aviso de mora", "Cada cierto número de días mientras haya cuotas vencidas (por defecto, 7).", "Correo o WhatsApp"],
], [26, 46, 28], "Nota. Los días se ajustan en Configuración.")
h2("Paso a paso")
p("La opción **Notificaciones** ({fig:notificaciones}) tiene filtros por **tipo de aviso** (1), **canal** (2) y **resultado** (3), y por fechas. Arriba hay cuatro contadores: **Enviada**, **Falló**, **Omitida** y **Enlace abierto**. Debajo, la lista de cada aviso con su cliente, su canal y su resultado.")
fig("notificaciones")
tabla("resultados", "Significado de cada resultado", ["Resultado", "Qué significa"], [
    ["Enviada", "El correo salió correctamente."],
    ["Falló", "Se intentó enviar y hubo un error. Puedes reintentar desde el recibo."],
    ["Omitida", "No se envió: el cliente no tiene correo o el correo de la empresa todavía no está configurado."],
    ["Enlace abierto", "Se abrió WhatsApp con el mensaje listo. Que el mensaje se envíe depende de quien lo abrió."],
], [24, 76])
consejo("Si necesitas mandar los recordatorios ya, sin esperar la mañana, usa el botón **Enviar recordatorios de pago** del panel general.")
importante("Antes de avisar a un cliente, revisa que tenga su autorización de tratamiento de datos registrada. La ficha del cliente te avisa cuando falta.")

# =====================================================================  15
cap("Nómina")
p("En esta opción se registran los trabajadores de la empresa y los pagos de nómina que se les hacen.")
h2("Para qué sirve")
p("Llevar quién trabaja en la empresa, con qué cargo y salario, y cuándo se le pagó. Cada pago queda como un egreso de categoría **Nómina** en las finanzas.")
h2("Quién puede usarlo")
p("Gerente y administrador. El rol Consulta no ve esta opción.")
h2("Qué ventajas te da")
ul("Cada pago guarda su período, su fecha, su medio y sus novedades.",
   "Los pagos de nómina se suman solos a los egresos de la empresa.",
   "Queda el historial de pagos de cada trabajador.")
importante("El sistema **registra** los pagos, pero no liquida la nómina: no calcula aportes de seguridad social ni prestaciones, ni transmite nómina electrónica. Eso lo sigue haciendo quien lleva la contabilidad de la empresa. Las afiliaciones de cada trabajador (EPS, pensión, cesantías, ARL y caja) sí se registran, en el módulo de Seguridad y salud en el trabajo que se explica en el capítulo 16.")
h2("Paso a paso")
h3("Ver los trabajadores y registrar uno nuevo")
p("La opción **Nómina** ({fig:nomina-lista}) lista los trabajadores con su cargo, su salario base y su estado. Para agregar uno pulsa **Nuevo trabajador** (1), y para ver sus pagos toca su nombre (2).")
fig("nomina-lista")
p("En el formulario de la {fig:trabajador-nuevo} elige el tipo de documento y escribe su número, los **nombres** y los **apellidos** (si lo prefieres, escribe el nombre completo y el sistema lo arma solo). Luego completa el **cargo** (1), el tipo de contrato (por defecto, obra o labor), el **salario base** (2) y la fecha de ingreso. La fecha de nacimiento, el sexo, el área, el celular, el teléfono y el correo son opcionales, pero conviene llenarlos: la ficha de seguridad social los usa. Guarda con **Registrar trabajador** (3).")
fig("trabajador-nuevo")
consejo("Después de registrar al trabajador, entra a su ficha de seguridad social y registra sus afiliaciones. Mientras falten, el panel lo marca como pendiente.")
h3("Registrar un pago de nómina")
p("Abre la ficha del trabajador ({fig:trabajador-ficha}). Allí ves sus datos y sus pagos anteriores (período, fecha de pago, novedades y valor pagado). Pulsa **Registrar pago** (1). Con **Editar** (2) corriges sus datos; el número de documento no se cambia, porque es la identidad del trabajador. **Ver en SST** (3) abre su ficha de seguridad y salud, y **Retirar trabajador** (4) registra la fecha y el motivo del retiro: el trabajador no se borra, queda como retirado con todo su historial.")
fig("trabajador-ficha")
p("En el formulario de la {fig:pago-nomina-nuevo} indica el período que se paga, desde (1) hasta (2), la fecha de pago y el medio de pago. El salario base se toma del trabajador en ese momento. Si hay horas extras, bonos o descuentos, pulsa **+ Agregar novedad** (3). Termina con **Registrar pago** (4).")
fig("pago-nomina-nuevo")
h3("Ver el ausentismo del período antes de pagar")
p("Si la persona que registra el pago puede ver los valores de seguridad y salud (el gerente y el administrador), el formulario muestra debajo del período el panel **Ausentismo en este período** ({fig:nomina-ausentismo-periodo}). El sistema busca las incapacidades y licencias del trabajador que caen entre las fechas pagadas (1) y propone la novedad de cada una: un valor a favor del trabajador por los días que pagan la EPS, la ARL o el fondo de pensiones, y un descuento por los días de licencia no remunerada o de ausencia injustificada. Pulsa **Agregar como novedad** (2) y la propuesta pasa a la lista de novedades del pago (3), donde todavía puedes cambiarle el valor o quitarla. Una novedad que ya agregaste aparece como **Ya agregada**.")
fig("nomina-ausentismo-periodo")
importante("La propuesta es una **ayuda de apoyo**: la nómina sigue liquidándose fuera del sistema. Los días que paga el empleador no generan novedad (el sistema lo avisa), y un período de pago no puede pasar de 62 días. Revisa siempre el valor antes de registrar el pago.")

# =====================================================================  16
cap("Seguridad y salud en el trabajo")
p("Este módulo ayuda a cuidar al personal y a tener en orden los papeles de seguridad y salud: a qué entidades está afiliado cada trabajador, qué elementos de protección se le entregaron y cuándo toca reponerlos, qué actividades tiene el plan de trabajo del año, qué capacitaciones se dictaron y qué incapacidades y licencias ha tenido el personal, con quién paga cada día.")
h2("Para qué sirve")
p("Reemplaza las hojas de cálculo y los cuadernos donde hoy se anota todo esto. Cada dato queda con su fecha y con quién lo registró, y el sistema avisa solo cuando algo está por vencerse, para que nada se olvide.")
h2("Quién puede usarlo")
ul("**Gerente y administrador:** ven y trabajan todo el módulo. El administrador también registra las afiliaciones de los trabajadores.",
   "**Contratista SST:** la persona externa que lleva la seguridad y salud de la empresa. Ve el módulo completo y trabaja los elementos de protección, el plan de trabajo, las capacitaciones y las autorizaciones y documentos de cada trabajador. No ve salarios, dinero ni proyectos.",
   "**Consulta:** no ve este módulo.",
   "**Ausentismo (incapacidades y licencias):** el gerente, el administrador y el contratista SST ven los registros y pueden registrar y anular. El **diagnóstico, las observaciones y los certificados** son datos de salud: solo los ven el gerente y el contratista SST, no el administrador. Los **valores en pesos** (liquidación, recobros y novedades) solo los ven el gerente y el administrador, no el contratista SST. Corregir una liquidación o actualizar un recobro exige ver los valores, así que lo hacen el gerente y el administrador.",
   "**Reportes de SST:** los ven quienes ven el módulo; la tabla de valores en pesos solo aparece para quien puede ver valores. **Cargar datos desde Excel:** solo el gerente.",
   "**Parámetros y entidades** (valores legales del año, entidades y clases de riesgo) y **tipos de ausentismo**: solo el gerente los cambia.")
h2("Qué ventajas te da")
ul("Ves de un vistazo qué trabajadores tienen afiliaciones, certificados o autorizaciones por completar.",
   "Sabes qué elementos de protección están por reponerse o vencidos, según su vida útil.",
   "El plan de trabajo del año se ve como un cronograma de colores, y las actividades próximas o vencidas se marcan solas.",
   "Cada capacitación guarda quién asistió, quién firmó y qué calificación sacó, y calcula la cobertura.",
   "El sistema manda avisos por correo cada mañana, una sola vez por estado, para no llenar de mensajes a nadie.",
   "Cada incapacidad o licencia se liquida sola por pagador (empleador, EPS, ARL o fondo de pensiones), mes por mes, y de ahí salen el resumen mensual y las novedades que se llevan a la nómina.",
   "Puedes llevar el seguimiento del cobro a las entidades (recobro) y sacar reportes de ausentismo, EPP, plan y capacitaciones en pantalla, PDF y Excel.",
   "Nada se borra: lo que se hizo por error se anula o se cierra con su motivo, y queda en el historial.")
importante("Esta herramienta **ayuda a llevar el control**, pero no certifica que la empresa cumpla la ley. Los valores legales (salario mínimo, auxilio de transporte, tasas de la ARL) los escribe la empresa y deben ser revisados por su asesor laboral; mientras no estén validados, el sistema lo avisa. Tampoco liquida la nómina, ni reporta nada a la EPS, la ARL o el fondo de pensión, ni transmite incapacidades a esas entidades. Tampoco lleva exámenes médicos ocupacionales, la investigación de accidentes ni la matriz de peligros. Las incapacidades y licencias sí se registran y se liquidan como ayuda de apoyo (ver el apartado de Ausentismo).")
importante("La **autorización de datos de salud** es un dato sensible protegido por la Ley 1581 de 2012. El sistema permite registrar que el trabajador la dio por escrito y adjuntar el documento firmado.")
h2("Paso a paso")
h3("Trabajadores y sus pendientes")
p("La opción **Seguridad y salud** del menú abre la {fig:sst-trabajadores}. Arriba están las pestañas del módulo (1): Trabajadores, EPP, Plan de trabajo, Capacitaciones, Ausentismo, Reportes y Avisos. En las pestañas aparece, con un número amarillo, cuántas cosas hay por atender. Las tarjetas resumen cuántos trabajadores tienen alguna alerta (2): sin afiliación completa, sin certificado de afiliación o sin autorización de datos de salud. Para buscar a una persona escribe su nombre o su documento (3). El botón **Parámetros y entidades** (4) lo ve solo el gerente.")
fig("sst-trabajadores")
p("En la tabla, cada afiliación aparece como una etiqueta: **verde** si el trabajador ya la tiene (EPS, pensión, cesantías, ARL y caja) y **gris** si falta. En la columna **Pendientes** se lee en amarillo lo que hay que completar. Hoy el sistema espera las cinco afiliaciones de todo trabajador activo, salvo en los contratos de prestación de servicios. Toca el nombre de un trabajador para abrir su ficha.")
h3("La ficha de seguridad social")
p("La ficha ({fig:sst-ficha}) reúne todo lo de una persona. Arriba están sus datos (2) y, si tienes permiso, el botón para pasar a su ficha de nómina (1). Más abajo, los **valores legales** del año (3), por ejemplo la tasa de cotización a la ARL según su clase de riesgo, y las **afiliaciones** (4). El aviso amarillo de los valores legales significa que el asesor laboral todavía no ha validado los parámetros del año: tómalos como provisionales.")
fig("sst-ficha")
h3("Registrar, cambiar y cerrar una afiliación")
p("En la sección de afiliaciones ({fig:sst-afiliacion-pendiente}) hay una fila por cada tipo de entidad. Si falta alguna, ves el aviso **Sin afiliación vigente** (1) y el botón **Registrar** (2). Si ya existe, puedes **Cambiar** (3) de entidad o **Cerrar** (4) la afiliación cuando el trabajador sale de ella.")
fig("sst-afiliacion-pendiente")
p("Al pulsar **Registrar** se abre el formulario de la {fig:sst-afiliacion-form}. Elige la entidad de la lista (1), escribe desde qué fecha está afiliado (2) y guarda con **Guardar afiliación** (3). En la ARL, el formulario también pide la **clase de riesgo**, de donde sale la tasa de cotización.")
fig("sst-afiliacion-form")
consejo("Cuando cambias a un trabajador de entidad, la anterior se cierra sola el día antes y queda en el historial. Si registraste una afiliación por error no se borra: ciérrala y registra la correcta.")
h3("Autorización de datos de salud y documentos")
p("En la {fig:sst-autorizacion} están dos secciones. En **Autorización de datos de salud** (1) se registra que el trabajador autorizó por escrito el tratamiento de sus datos de salud; se puede retirar la autorización si él lo pide. En **Documentos** (2) se adjuntan los certificados de afiliación, la autorización firmada y otros soportes, en PDF, PNG o JPG de hasta 10 MB. Los documentos se conservan siempre y solo se descargan con la sesión iniciada y el permiso correspondiente. El contratista SST no ve ni sube contratos.")
fig("sst-autorizacion")
h3("Elementos de protección personal (EPP)")
p("La pestaña **EPP** ({fig:sst-epp}) muestra tres tarjetas: los elementos **vencidos**, los que están **por reponer** (por defecto, con 15 días de anticipación) y los **vigentes**. Debajo, la lista de **Reposiciones** trae la última entrega de cada trabajador y elemento, con su fecha de reposición. El filtro (1) elige qué ver: lo que pide atención, solo vencidos, solo por reponer, solo vigentes o todos. **Registrar entrega de EPP** (2) abre el formulario, y el botón **Reponer** de cada fila lo abre ya con el trabajador y el elemento elegidos.")
fig("sst-epp")
p("En el formulario de la {fig:sst-epp-entrega} elige el **trabajador** (1) y el **elemento** (2); debajo del elemento aparece su vida útil. Escribe la fecha de entrega (no puede ser futura), la cantidad, la talla o referencia y el **motivo** (3): dotación inicial, reposición por vida útil, por daño, por pérdida o por cambio de cargo. Si ya tienes el acta firmada, adjúntala en **Acta firmada** (4); si el trabajador ya firmó el recibido, marca la casilla.")
fig("sst-epp-entrega")
p("Las entregas quedan en la lista de la {fig:sst-epp-entregas} (1), que puedes filtrar por trabajador y elemento. Una entrega **no se edita ni se borra**: si hubo un error, ábrela con **Ver** (3), anúlala con su motivo y registra la correcta. Las anuladas se ven marcando **Incluir anuladas** (2). Dentro de una entrega también puedes adjuntar el acta y marcar que el trabajador firmó el recibido.")
fig("sst-epp-entregas")
p("Al final de la pestaña está el **catálogo de elementos** ({fig:sst-epp-catalogo}). Cada elemento tiene su **vida útil en días**, que el sistema usa para calcular la fecha de reposición. Puedes cambiar los días, agregar elementos nuevos y desactivar los que ya no uses. Cambiar la vida útil no mueve las reposiciones de entregas anteriores: cada entrega guarda la vida útil que tenía el día que se hizo.")
fig("sst-epp-catalogo")
importante("Los elementos y los días de vida útil que trae el catálogo son una **referencia**. Ajústalos con la ficha técnica del fabricante y con la matriz de EPP de la empresa.")
h3("Plan de trabajo anual")
p("La pestaña **Plan de trabajo** ({fig:sst-plan}) muestra el plan del año. Arriba eliges el año y, si quieres, un estado. Las tarjetas dan el **cumplimiento** (1), el avance promedio, las actividades vencidas y las próximas. En la tabla, cada actividad trae su ciclo (planear, hacer, verificar o actuar), el estándar al que aporta, el responsable, las fechas, el estado, el avance y un **cronograma por meses**: azul si está en ejecución, verde si ya se ejecutó, rojo si está vencida y gris si está programada. Con **Editar** y **Detalle** abres cada actividad y adjuntas sus evidencias.")
fig("sst-plan")
p("**Nueva actividad** (2) abre el formulario de la {fig:sst-plan-actividad}. Elige el **ciclo** (1), escribe el estándar o componente, la actividad y una meta que se pueda medir. Indica el responsable y su **correo** (2), porque ahí llegan los recordatorios, y las fechas de inicio y de fin (3), que deben caer dentro del año del plan. Los recursos y el presupuesto son opcionales.")
fig("sst-plan-actividad")
p("Para empezar un año nuevo no hace falta escribir todo otra vez: **Copiar de otro año** (3 en la {fig:sst-plan}) trae las actividades de un año como borrador del siguiente. Solo se puede copiar sobre un año vacío. Una actividad no se borra: si ya no se hará, se pasa a **Cancelada**.")
h3("Capacitaciones")
p("La pestaña **Capacitaciones** ({fig:sst-capacitaciones}) lista las del año con su fecha, su facilitador, su estado y su asistencia. La **cobertura** (1) compara los asistentes reales con los programados en las capacitaciones ya dictadas. Para programar una pulsa **Nueva capacitación** (2) y completa el tema, el objetivo, a quién va dirigida, la modalidad, las horas, la fecha, el facilitador con su correo, quién la ejecuta (la propia empresa, la ARL, un proveedor externo o el SENA) y cuántos asistentes se esperan.")
fig("sst-capacitaciones")
p("Al tocar el tema de una capacitación se abre su detalle ({fig:sst-capacitacion}). La sección **Asistencia** calcula la **cobertura** (2): asistentes reales sobre programados. Cada asistente muestra si firmó el listado y su calificación de 0 a 5. Si alguien quedó anotado por error, **Quitar** (3) anula su asistencia con un motivo, sin borrarla. Para sumar gente pulsa **Agregar asistentes** (1).")
fig("sst-capacitacion")
p("**Agregar asistentes** abre la lista de la {fig:sst-asistentes}. Busca por nombre o documento (1), marca a los trabajadores que asistieron, indica si todos firmaron y pulsa **Registrar** con el número de asistentes. Así se carga una cuadrilla completa de una sola vez, sin repetir a quienes ya estaban. Más abajo se adjunta el **listado de asistencia firmado**, las fotos o la evaluación.")
fig("sst-asistentes")
h3("Ausentismo: incapacidades y licencias")
p("La pestaña **Ausentismo** ({fig:sst-ausentismo-lista}) guarda las incapacidades y las licencias de los trabajadores. Arriba tiene cuatro secciones (1): **Registros**, **Resumen mensual**, **Recobro a entidades** y **Novedades para nómina** (esta última solo la ven quienes pueden ver valores). Los filtros (2) acotan la lista por año, mes, tipo, trabajador y estado. Cada fila muestra cuántos días paga cada uno (4): el empleador, la EPS, la ARL o el fondo de pensiones, y una etiqueta marca las prórrogas (5).")
fig("sst-ausentismo-lista")
importante("La liquidación del ausentismo es una **ayuda de apoyo**: dice quién paga cada día y cuánto, con los parámetros legales que la empresa tiene cargados. **No certifica cumplimiento legal** ni reemplaza a la nómina, y los parámetros y las reglas de cada tramo todavía deben ser validados por el asesor laboral de la empresa. El sistema no transmite nada a la EPS, la ARL ni al fondo de pensiones.")
h3("Registrar una incapacidad o una licencia")
p("Pulsa **Registrar ausentismo** (3 en la {fig:sst-ausentismo-lista}) para abrir el formulario de la {fig:sst-ausentismo-form}. Elige el **trabajador** (1) y el **tipo de ausentismo** (2); debajo del tipo el sistema te dice si exige diagnóstico. Escribe el primer y el último día (3): las fechas no pueden traslaparse con otro ausentismo del mismo trabajador, ni empezar antes de su ingreso. Si la incapacidad continúa otra anterior, marca **Es una prórroga de una incapacidad anterior** (4) y elige cuál continúa, o escribe los días que llevaba si venía de fuera del sistema: esos días cuentan para los tramos de pago. El **diagnóstico CIE-10** (5) se busca por código o por nombre. También puedes escribir el número del certificado, observaciones y adjuntar el certificado (PDF, PNG o JPG de hasta 10 MB). Termina con **Registrar ausentismo**.")
fig("sst-ausentismo-form")
p("La {tabla:tipos-ausentismo} resume quién paga cada día según el tipo de ausentismo que trae el sistema.")
tabla("tipos-ausentismo", "Tipos de ausentismo que trae el sistema y quién paga", ["Tipo", "Quién paga"], [
    ["Enfermedad general", "Los primeros días, el empleador; luego la EPS; y a partir de cierto día, el fondo de pensiones. Exige diagnóstico."],
    ["Accidente de trabajo", "La ARL paga desde el día siguiente al del accidente; el día del accidente se paga como laborado. Exige diagnóstico."],
    ["Enfermedad laboral", "La ARL. Exige diagnóstico."],
    ["Licencia de maternidad o paternidad", "La EPS."],
    ["Licencia por luto, calamidad doméstica o permiso remunerado", "El empleador, que sigue pagando el día."],
    ["Licencia no remunerada y ausencia injustificada", "Nadie paga: son días que se descuentan del pago."],
], [38, 62], "Nota. Los días de cada tramo y los porcentajes son parámetros del año, y los tipos se pueden ajustar en Configuración.")
h3("Ver el detalle, anular y editar")
p("Al tocar un registro se abre su detalle ({fig:sst-ausentismo-detalle}). Allí están los **datos del ausentismo** (2): trabajador, tipo, fechas, número del certificado y, si es una prórroga, de cuál viene. En **Datos de salud** (3) están el diagnóstico, las observaciones y el certificado; solo se muestran a quien tiene permiso, y **cada vez que se abren queda un registro en la auditoría**. Abajo está la **liquidación** (4), mes por mes.")
fig("sst-ausentismo-detalle")
p("Un ausentismo **no se borra ni se cambia de trabajador, tipo o fechas**: si hubo un error en eso, se anula con **Anular** (1), se escribe el motivo, y se registra de nuevo; las fechas anuladas quedan libres. Con **Editar datos** solo se corrigen el número del certificado, el diagnóstico y las observaciones.")
h3("La liquidación por pagador")
p("La sección **Liquidación** ({fig:sst-ausentismo-liquidacion}) reparte cada día entre el empleador, la EPS, la ARL y el fondo de pensiones, y suma lo que paga cada uno por mes. El **valor diario** (1) sale del salario del trabajador dividido entre los días base del mes. Los **parámetros** con que se liquidó (2) quedan guardados en el registro: si después cambian los valores legales del año, lo ya liquidado no se mueve. Si la EPS o la ARL reconocen algo distinto, el gerente o el administrador pulsa **Corregir la liquidación** (3).")
fig("sst-ausentismo-liquidacion")
p("En el formulario de la {fig:sst-ausentismo-correccion} se cambian los **días de cada pagador** (siguen sumando los del mes) y sus **valores**, y se escribe, obligatoriamente, el **motivo** de la corrección (1), por ejemplo lo que la EPS reconoció. Al **guardar la corrección** (2), el registro queda marcado como *corregido a mano*, el cálculo original se conserva y la auditoría guarda el valor anterior y el nuevo.")
fig("sst-ausentismo-correccion")
importante("Estos supuestos de la liquidación **todavía no están validados con el asesor laboral**: que los días del empleador usen el porcentaje del primer tramo, que el fondo de pensiones pague desde el día 181, que haya un piso de un salario mínimo diario solo en las incapacidades, que el día de un accidente de trabajo se pague como laborado, que la base sea el salario dividido entre los días base del mes (la opción de usar el ingreso base de cotización no está construida), que cada valor se redondee a pesos enteros y que un ausentismo que cruza de año use los parámetros del año en que empieza. Todos los valores salen de los parámetros del año y se pueden cambiar.")
h3("Seguimiento del recobro a las entidades")
p("Cuando la EPS, la ARL o el fondo de pensiones deben reconocer días de una incapacidad, la empresa suele cobrárselos a la entidad (a eso se le llama recobro). En el detalle, la sección **Recobro a las entidades** lleva el seguimiento de cada entidad con un estado: **pendiente**, **radicado**, **pagado** o **rechazado**. El formulario ({fig:sst-ausentismo-recobro-form}) pide lo que corresponde a cada estado (2): la fecha de radicación al radicar, la fecha de pago y el valor reconocido al registrar el pago, y el motivo si lo rechazan. Se guarda con **Guardar recobro**.")
fig("sst-ausentismo-recobro-form")
p("La sección **Recobro a entidades** ({fig:sst-ausentismo-recobros}) junta todos los recobros de la empresa. Filtra por estado (1) o por entidad (2) para saber qué falta radicar o cobrar, y mira lo que se espera cobrar y lo que cada entidad reconoció (3). Con **Actualizar** cambias el estado de un recobro.")
fig("sst-ausentismo-recobros")
consejo("El sistema solo lleva el seguimiento del recobro: no radica ni transmite nada a las entidades. Las radicaciones se siguen haciendo por los canales de cada una.")
h3("Resumen mensual y novedades para la nómina")
p("El **Resumen mensual** ({fig:sst-ausentismo-resumen}) muestra el **porcentaje de ausentismo** del año (1): los días de ausentismo sobre los días que se pudo trabajar, calculado con los trabajadores activos. Con las flechas de año (2) cambias de año, y la tabla (3) cuenta, mes por mes, cuántos días paga el empleador, la EPS, la ARL y el fondo de pensiones, y cuántos son descuentos.")
fig("sst-ausentismo-resumen")
p("**Novedades para nómina** ({fig:sst-ausentismo-novedades}) arma, para el mes que elijas (1), la lista de lo que hay que llevar a la nómina: cada incapacidad o licencia con sus días y valores. **Descargar Excel** (2) entrega el archivo con esas mismas columnas. Los valores a cargo de la EPS, la ARL y el fondo de pensiones son lo que esas entidades reconocen, no lo que paga la empresa. Esta sección solo la ven el gerente y el administrador.")
fig("sst-ausentismo-novedades")
h3("Qué ve cada rol en el ausentismo")
p("El **contratista SST** ({fig:sst-ausentismo-contratista}) ve los días y quién paga cada uno, pero ninguna columna de dinero (1): no hay valores, recobros esperados ni la sección de novedades. Sí puede registrar y anular ausentismos y ver los diagnósticos (2). El **administrador** ({fig:sst-ausentismo-administrador}) ve los datos del ausentismo (1) y la liquidación con sus valores, que además puede corregir (2), pero entre ambos **no aparece la sección de datos de salud**: no ve diagnósticos, observaciones ni certificados.")
fig("sst-ausentismo-contratista")
fig("sst-ausentismo-administrador")
importante("El diagnóstico, las observaciones y los certificados médicos son **datos sensibles de salud** (Ley 1581 de 2012). Registra solo lo necesario, no compartas tu cuenta con nadie, y recuerda que cada consulta de un diagnóstico queda en la auditoría, pero la auditoría nunca guarda el diagnóstico mismo.")
h3("Reportes de seguridad y salud")
p("La pestaña **Reportes** ({fig:sst-reportes}) ofrece cinco reportes (1): **Ausentismo: resumen mensual**, **Ausentismo: detalle por registro**, **EPP: entregados y por reponer**, **Plan de trabajo** y **Capacitaciones**. Elige uno, ajusta los filtros (2), que cambian según el reporte (año, mes, fechas, trabajador, tipo o estado), y pulsa **Ver reporte** (3) para verlo en pantalla. Con **Descargar PDF** o **Descargar Excel** (4) lo bajas; cada descarga queda registrada en la auditoría, y verlo en pantalla no.")
fig("sst-reportes")
p("Ningún reporte lleva diagnóstico ni observaciones, para ningún rol. En los de ausentismo, los **valores en pesos** van en una tabla aparte (5) que solo existe para quien puede ver valores; para los demás el reporte llega sin esa tabla. Si una tabla es más ancha que la pantalla, desliza hacia los lados para ver todas sus columnas; el PDF y el Excel las traen completas. Los anulados se listan solo si los pides y no suman. El PDF ({fig:sst-reportes-pdf}) lleva el logo y los datos de la empresa y recorta los textos muy largos; el Excel trae el texto completo.")
fig("sst-reportes-pdf")
h3("Cargar datos de seguridad y salud desde Excel")
p("Si la empresa ya tiene trabajadores, ausentismos, entregas de EPP o asistencias a capacitaciones en un libro de Excel, el gerente puede cargarlos de una vez desde **Importar Excel**, en la pestaña **Seguridad y salud (SST)** (también hay un enlace **Cargar desde Excel** dentro del módulo). Se explica con detalle en el capítulo de Importar desde Excel.")

h3("Avisos por correo")
p("Cada mañana, a las 8:10 (hora de Colombia), el sistema avisa por correo al responsable de cada actividad del plan y de cada capacitación cuando queda **próxima** y cuando se **vence**, y manda un resumen de los EPP por reponer al correo de avisos de SST que se define en Configuración. Cada aviso sale **una sola vez por estado**. En la pestaña **Avisos** ({fig:sst-avisos}) puedes pulsar **Enviar avisos ahora** (1) para no esperar a la mañana, y consultar en el **historial** (2) cada intento con su resultado: enviado, omitido o fallido. El historial no se puede editar.")
fig("sst-avisos")
consejo("Si el correo de la empresa todavía no está configurado, los avisos quedan como **omitidos** y salen solos cuando se configure. Mientras tanto, las alertas se ven en las pestañas y en el panel general.")
h3("Parámetros legales, entidades y clases de riesgo")
p("Solo el gerente entra a **Parámetros y entidades** (también está en Configuración). La primera sección ({fig:sst-parametros}) guarda los valores legales **de cada año**: salario mínimo, auxilio de transporte y su tope, los porcentajes y los días de las incapacidades, y los días base del mes. **Agregar año** (1) crea el del año siguiente. Cada año muestra si está **pendiente de validar** (2). Cuando el asesor laboral confirma los valores, el gerente pulsa **Marcar como validado** (3). Con **Editar** (4) se cambian los valores; si cambias un valor legal, la validación se pierde y hay que volver a confirmarla.")
fig("sst-parametros")
p("La segunda sección ({fig:sst-entidades}) es el catálogo de **entidades**: EPS, fondos de pensión, fondos de cesantías, ARL y cajas de compensación. Abre cada tipo (1) para ver su lista, agrega una escribiendo su nombre (2) y **Desactivar** (3) las que ya no se usen: una entidad desactivada deja de ofrecerse, pero las afiliaciones que la tienen la conservan. La tercera sección guarda las cinco **clases de riesgo de la ARL** con su tasa de cotización en porcentaje.")
fig("sst-entidades")
p("Dos valores del módulo se cambian en Configuración, en la sección **Seguridad y salud en el trabajo** ({fig:config-sst}): los **días de anticipación** de las alertas (1), que por defecto son 15, y el **correo de avisos SST** (2) al que llega el resumen de EPP por reponer. Si dejas el correo vacío, ese resumen solo se ve en el panel.")
fig("config-sst")
h3("Lo que ve el contratista SST")
p("Una persona con el rol Contratista SST entra al sistema y ve solamente la opción **Seguridad y salud** en su menú ({fig:rol-contratista}). Puede consultar a los trabajadores y sus afiliaciones, registrar las autorizaciones de datos de salud, adjuntar documentos y trabajar los elementos de protección, el plan de trabajo, las capacitaciones y el ausentismo. Ve los diagnósticos de las incapacidades, pero no los valores en pesos. No ve salarios, pagos, clientes, ventas ni proyectos. El gerente crea esta cuenta en Usuarios, como se explica en el capítulo 19.")
fig("rol-contratista")

# =====================================================================  17
cap("Auditoría")
p("La auditoría es el registro de todo lo importante que se hace en el sistema: quién lo hizo, cuándo, qué cambió y qué valores tenía antes y después.")
h2("Para qué sirve")
p("Resolver dudas y reclamos con hechos: si alguien pregunta “¿quién anuló ese recibo?” o “¿cuándo cambió el precio de este lote?”, la respuesta está aquí.")
h2("Quién puede usarlo")
p("Solo el gerente.")
h2("Qué ventajas te da")
ul("Cada acción sobre ventas, abonos, recibos, egresos, cierres, nómina, lotes, proyectos, clientes, configuración y usuarios queda registrada.",
   "Nadie puede editar ni borrar un registro de auditoría: solo se consulta.",
   "Puedes filtrar por fechas, persona, tipo de dato y acción, o buscar un texto.")
h2("Paso a paso")
p("En la {fig:auditoria-lista} están los filtros de **usuario** (1), **tipo de registro** (2) y **acción** (3), además de las fechas y un buscador de texto. Cada fila cuenta qué pasó, cuándo y quién lo hizo. Pulsa **Ver cambios** (4) para ver el detalle.")
fig("auditoria-lista")
p("Al abrir **Ver cambios** ({fig:auditoria-cambios}) aparecen, campo por campo, el valor anterior y el valor nuevo. Las contraseñas y el contenido de los archivos nunca se guardan en la auditoría.")
fig("auditoria-cambios")

# =====================================================================  17
cap("Importar desde Excel")
p("Esta opción permite cargar de una sola vez información que hoy está en hojas de cálculo: proyectos, lotes, clientes, ventas con su plan de cuotas y abonos históricos, y, desde la versión 1.2, trabajadores, ausentismos, entregas de EPP y asistencias a capacitaciones de seguridad y salud.")
h2("Para qué sirve")
p("Pasar al sistema la información que la empresa ya tiene, sin volver a digitarla. Se usa, sobre todo, al comenzar.")
h2("Quién puede usarlo")
p("Solo el gerente.")
h2("Qué ventajas te da")
ul("Primero **revisa sin guardar**: el sistema te muestra los errores por hoja y por fila, para que los corrijas antes de cargar nada.",
   "La carga es de **todo o nada**: si algo falla, no se guarda nada a medias.",
   "El mismo archivo no se puede importar dos veces.",
   "Los abonos históricos reciben recibos de una serie propia (con la letra H) y el sistema entrega un reporte de conciliación de saldos.")
h2("Paso a paso")
p("La opción tiene dos pestañas: **Ventas y abonos** y **Seguridad y salud (SST)**. Cada una tiene su propia plantilla y su propio historial. La pantalla de ventas ({fig:importacion}) tiene tres pasos. Primero, **descarga la plantilla** (1): trae una hoja de instrucciones y una hoja por cada tipo de dato. Llénala con los datos de la empresa. Segundo, **sube el archivo** (2) (.xlsx, máximo 5 MB) y pulsa **Revisar sin guardar** (3). Tercero, si todo está bien, confirma la importación. Abajo queda el historial de **importaciones anteriores**.")
fig("importacion")
importante("Antes de importar ventas con abonos por banco, las cuentas bancarias deben estar creadas en Configuración. Las ventas importadas no generan comisión, porque se consideran historia.")
h3("Carga de seguridad y salud")
p("En la pestaña **Seguridad y salud (SST)** ({fig:importacion-sst}) el procedimiento es el mismo. Esta pestaña (1) tiene su propia plantilla (2), con una hoja de instrucciones y cuatro hojas de datos: **Trabajadores**, **Ausentismos**, **Entregas EPP** y **Asistencias**. Puedes dejar vacías las hojas que no uses. Los trabajadores se identifican por su documento, que debe escribirse igual en todas las hojas. Sube el archivo (3) y pulsa **Revisar sin guardar** (4).")
fig("importacion-sst")
p("Cada fila pasa por **las mismas reglas que al digitarla en pantalla**: un ausentismo no puede traslaparse con otro, ni empezar antes del ingreso del trabajador, y necesita los parámetros legales del año en que empieza. La revisión corre la carga completa pero **no guarda nada**. Si hay errores ({fig:importacion-sst-errores}), mientras exista uno solo (1) no se guarda nada, ni siquiera lo que estaba bien; los errores se agrupan por hoja (2) y dicen la fila y la columna para corregirlos en el Excel y volver a subirlo.")
fig("importacion-sst-errores")
p("Cuando el archivo no tiene errores ({fig:importacion-sst-confirmar}), el sistema muestra lo que se cargaría (1) y cuántos trabajadores, ausentismos, entregas y asistencias traería (2). Todavía no se ha guardado nada. Si estás de acuerdo, confirma con **Sí, guardar** (3): entra todo o no entra nada. La carga queda en el historial ({fig:importacion-sst-guardada}) con su resumen (1) y la lista de las cargas anteriores (2).")
fig("importacion-sst-confirmar")
fig("importacion-sst-guardada")
importante("Lo que se carga **no se puede borrar**: si algo quedó mal, se anula con su motivo y se registra el correcto. Además: un trabajador que ya existe con ese documento se reutiliza y no se modifica; los elementos de EPP y las capacitaciones deben existir antes, porque la carga no los crea; el ausentismo se liquida con el salario **actual** del trabajador y los parámetros legales del año en que empieza (hoy solo está cargado 2026); una prórroga necesita los días previos; y los certificados no se cargan por Excel. La plantilla es un borrador que se ajustará al libro real de la empresa.")

# =====================================================================  18
cap("Usuarios y roles")
p("Aquí el gerente crea las cuentas de las personas que usan el sistema y decide qué rol tiene cada una.")
h2("Para qué sirve")
p("Que cada persona tenga su propia cuenta y vea solo lo que le corresponde. Nunca se debe compartir una contraseña: así queda claro quién hizo cada cosa.")
h2("Quién puede usarlo")
p("Solo el gerente.")
h2("Qué ventajas te da")
ul("Cada cuenta tiene un rol: el sistema esconde y bloquea lo que ese rol no puede hacer, no solo los botones.",
   "Un usuario de Consulta se puede limitar a uno o varios proyectos, ideal para un socio.",
   "Desactivar una cuenta quita el acceso sin borrar el historial de lo que hizo.")
h2("Paso a paso")
h3("Ver y crear usuarios")
p("La opción **Usuarios** ({fig:usuarios-lista}) lista las cuentas con su rol, su estado y su último ingreso. Para crear una pulsa **Nuevo usuario** (1). En cada cuenta puedes **Editar** (2) o **Desactivar** (3).")
fig("usuarios-lista")
p("Además del gerente, el administrador y la consulta, hay un rol para la persona externa que lleva la seguridad y salud: el **Contratista SST**. Al crear su cuenta, elígelo en el campo **Rol**. Esa persona ve solo el módulo de Seguridad y salud en el trabajo (capítulo 16), sin salarios, dinero ni proyectos.")
p("En el formulario de la {fig:usuario-nuevo} escribe el nombre, el **correo** (1) con el que ingresará la persona, una **contraseña** de mínimo 8 caracteres (2) y elige el **rol** (3): gerente, administrador, consulta o contratista SST. Entrégale la contraseña por un medio seguro.")
fig("usuario-nuevo")
h3("Cambiar el rol o limitar los proyectos")
p("Al editar un usuario ({fig:usuario-editar}) puedes cambiar su rol; el cambio aplica de inmediato. Si el rol es Consulta, puedes elegir **Solo algunos proyectos** (1) y marcar cuáles ve. Una persona limitada no ve datos de otros proyectos, ni nómina, ni configuración.")
fig("usuario-editar")
h3("Restablecer una contraseña")
p("En la parte de abajo de la misma pantalla, escribe una **contraseña nueva** y pulsa **Restablecer contraseña** (2). Se cierran las sesiones abiertas de esa cuenta y, si estaba bloqueada, se desbloquea. Comparte la contraseña nueva por un medio seguro.")
importante("No compartas tu contraseña con nadie, ni siquiera con tus compañeros. Si alguien necesita acceso, pídele al gerente que le cree su propia cuenta.")

# =====================================================================  19
cap("Configuración")
p("La configuración guarda los datos de la empresa y las reglas del negocio. Lo que cambies aquí se refleja en todo el sistema: recibos, reportes, correos y formularios.")
h2("Para qué sirve")
p("Adaptar el sistema a la empresa sin necesidad de un programador: el nombre, el logo, el porcentaje de la cuota inicial, el plazo máximo, las cuentas bancarias, los medios de pago y las categorías, entre otras cosas.")
h2("Quién puede usarlo")
p("Solo el gerente puede cambiarla.")
h2("Qué ventajas te da")
ul("Las reglas del negocio son **parámetros**, no están fijas: si mañana la cuota inicial cambia de 30 % a 25 %, lo cambias aquí.",
   "El logo y los datos de la empresa aparecen solos en recibos, reportes y correos.",
   "Las cuentas y los medios de pago no se borran: se desactivan, para conservar el historial.")
h2("Paso a paso")
h3("Datos de la empresa")
p("La primera sección ({fig:config-empresa}) guarda los datos de la empresa. Con **Subir logo** (1) cargas el logo (PNG, JPG o WebP de hasta 2 MB). Completa la **razón social** (2), el nombre comercial, el NIT, el correo de contacto, la dirección y los teléfonos. El **color principal** (3) cambia el color de los botones. También defines el prefijo de los recibos (por ejemplo, RC-) y el texto legal que se imprime al pie de cada recibo. Guarda con **Guardar datos de la empresa** (4).")
fig("config-empresa")
h3("Parámetros del negocio")
p("La segunda sección ({fig:config-parametros}) tiene las reglas de venta y cartera: el porcentaje de la **cuota inicial** (1), el **plazo máximo** en meses (2), el interés de financiación, el **interés de mora mensual** (3), los días de gracia antes de cobrar mora y los días de aviso del semáforo amarillo.")
fig("config-parametros")
p("Más abajo están los **avisos a clientes**, la **verificación de pagos** y la **seguridad de la sesión** ({fig:config-avisos} y {fig:config-seguridad}): cuántos días antes se manda el recordatorio, cada cuántos días se repite el aviso de mora, si el recibo se manda solo por correo, cuántos días de espera antes de que un pago sin verificar se ponga en rojo, cuántos intentos fallidos bloquean una cuenta y cuántos minutos de inactividad cierran la sesión. Todo se guarda con **Guardar parámetros**.")
fig("config-avisos")
fig("config-seguridad")
p("En esa misma sección están los parámetros de **Seguridad y salud en el trabajo**: con cuántos días de anticipación se marcan como próximas las reposiciones de EPP, las actividades del plan y las capacitaciones, y el correo al que llega el resumen de EPP por reponer. Se explican, con su imagen, en el capítulo 16. Los valores legales por año (salario mínimo, auxilio de transporte, tasas de la ARL) y las entidades de seguridad social se editan en una pantalla aparte: en Configuración está la sección **Seguridad social**, con el botón **Administrar seguridad social**.")
h3("Tipos de ausentismo y diagnósticos CIE-10")
p("Dentro de **Administrar seguridad social** están dos secciones del ausentismo. En **Tipos de ausentismo** ({fig:config-ausentismo-tipos}) ves los tipos con su regla de pago (1): quién paga el día y con qué porcentaje. La regla y la clave de un tipo no se pueden cambiar una vez creado; si hace falta otra regla, se desactiva el tipo y se crea uno nuevo (2). Los porcentajes sí se pueden ajustar.")
fig("config-ausentismo-tipos")
p("En **Diagnósticos CIE-10** ({fig:config-ausentismo-cie10}) se busca un código por su número o por su nombre (1) y se agregan los que falten. Los códigos que trae el sistema son una **referencia**: si la empresa necesita el listado completo, se amplía aquí.")
fig("config-ausentismo-cie10")

h3("Correo de avisos")
p("La sección **Correo de avisos** ({fig:config-correo}) muestra si el correo de la empresa está configurado. El correo se configura en el servidor, no aquí; en esta pantalla solo compruebas que funciona: escribe una dirección a la que tengas acceso y pulsa **Enviar correo de prueba** (1).")
fig("config-correo")
h3("Cuentas de recaudo y medios de pago")
p("Las **cuentas de recaudo** ({fig:config-cuentas}) son las cuentas bancarias o billeteras donde los clientes consignan o transfieren. Puedes **Agregar cuenta** (1) o **Desactivar** (2) una; no se borran. Más abajo, los **medios de pago** (efectivo, transferencia, consignación, Nequi, Daviplata y otros): los activos son los que aparecen al registrar un abono, y puedes pedir que cada medio se **verifique contra el extracto**.")
fig("config-cuentas")
h3("Categorías, tipos de equipo, comisiones y exportación")
p("Al final de la pantalla están las **categorías de gasto** y de **ingreso** ({fig:config-categorias}), con las que se clasifican los movimientos de Finanzas. Las del sistema, como Nómina y Comisiones, no se pueden quitar. Para agregar una, escríbela en **Nueva categoría** (1).")
fig("config-categorias")
p("Después vienen los **tipos de equipo** de maquinaria y el **valor fijo de las comisiones** de venta según el tipo de vendedor ({fig:config-comisiones}).")
fig("config-comisiones")
p("En la {fig:config-exportar} está el botón **Exportar todos los datos**. Descarga un libro de Excel con todos los datos de la empresa, una hoja por tipo de dato. No incluye contraseñas ni archivos adjuntos, y cada exportación queda registrada en la auditoría. Así la empresa puede llevarse su información cuando lo necesite.")
fig("config-exportar")

# =====================================================================  APÉNDICES
apendice("Qué puede hacer cada rol")
p("La {tabla:permisos} resume los permisos de cada rol. Un guion significa que el rol no tiene esa función.")
SI, NO = "Sí", "—"
tabla("permisos", "Permisos por rol", ["Función", "Gerente", "Administrador", "Consulta", "Contratista SST"], [
    ["Ver panel general, proyectos, ventas, clientes y recibos", SI, SI, SI + " (solo sus proyectos)", NO],
    ["Ver cartera, finanzas y reportes", SI, SI, SI, NO],
    ["Crear proyectos y lotes", SI, SI, NO, NO],
    ["Finalizar o reactivar un proyecto", SI, NO, NO, NO],
    ["Registrar y editar clientes", SI, SI, NO, NO],
    ["Registrar ventas", SI, SI, NO, NO],
    ["Aprobar o rechazar ventas con excepción", SI, NO, NO, NO],
    ["Registrar un desistimiento", SI, NO, NO, NO],
    ["Registrar abonos", SI, SI, NO, NO],
    ["Anular un abono y su recibo", SI, NO, NO, NO],
    ["Verificar pagos contra el extracto", SI, SI, NO, NO],
    ["Generar y cerrar cierres de caja", SI, SI, NO, NO],
    ["Aprobar o devolver un cierre de caja", SI, NO, NO, NO],
    ["Registrar egresos e ingresos", SI, SI, NO, NO],
    ["Anular un egreso o ingreso", SI, NO, NO, NO],
    ["Ver y pagar comisiones", SI, SI, NO, NO],
    ["Anular una comisión", SI, NO, NO, NO],
    ["Ver el historial de notificaciones y enviar avisos", SI, SI, NO, NO],
    ["Trabajadores y pagos de nómina", SI, SI, NO, NO],
    ["Ver Seguridad y salud (trabajadores, EPP, plan, capacitaciones y ausentismo)", SI, SI, NO, SI],
    ["Registrar afiliaciones, editar y retirar trabajadores", SI, SI, NO, NO],
    ["Registrar EPP, plan de trabajo, capacitaciones y autorizaciones de datos de salud", SI, SI, NO, SI],
    ["Registrar y anular incapacidades y licencias (ausentismo)", SI, SI, NO, SI],
    ["Ver diagnósticos, observaciones y certificados del ausentismo", SI, NO, NO, SI],
    ["Ver los valores liquidados, las novedades para nómina y el panel de ausentismo al pagar nómina", SI, SI, NO, NO],
    ["Corregir una liquidación y llevar el seguimiento del recobro", SI, SI, NO, NO],
    ["Ver y descargar los reportes de SST (la tabla de valores solo con permiso de valores)", SI, SI, NO, SI],
    ["Cargar datos de SST desde Excel", SI, NO, NO, NO],
    ["Cambiar parámetros legales, entidades, clases de riesgo y tipos de ausentismo", SI, NO, NO, NO],
    ["Registrar equipos de maquinaria", SI, SI, NO, NO],
    ["Dar de baja un equipo", SI, NO, NO, NO],
    ["Consultar la auditoría", SI, NO, NO, NO],
    ["Importar datos desde Excel", SI, NO, NO, NO],
    ["Exportar todos los datos a Excel", SI, NO, NO, NO],
    ["Crear usuarios y cambiar roles", SI, NO, NO, NO],
    ["Cambiar la configuración", SI, NO, NO, NO],
], [34, 14, 18, 17, 17], "Nota. La opción Configuración no aparece en el menú del administrador, ni en el de Consulta, ni en el del Contratista SST.")
p("Así se ve el menú de cada rol. El administrador ({fig:rol-administrador}) no ve Auditoría, Importar Excel, Usuarios ni Configuración. Un usuario de Consulta limitado a un proyecto ({fig:rol-consulta}) solo ve lo de ese proyecto y no puede cambiar nada. El Contratista SST ({fig:rol-contratista}, en el capítulo 16) solo ve la opción Seguridad y salud.")
fig("rol-administrador")
fig("rol-consulta")

apendice("Glosario")
tabla("glosario", "Palabras que verás en el sistema", ["Palabra", "Qué significa"], [
    ["Abono", "Cualquier pago que hace un cliente: cuota inicial, cuota o pago extra."],
    ["AFP", "Fondo de pensiones al que está afiliado un trabajador."],
    ["Anular", "Dejar sin efecto un registro equivocado, sin borrarlo. Queda a la vista, marcado como anulado, con su motivo."],
    ["ARL", "Administradora de riesgos laborales: la entidad a la que se afilia al trabajador para cubrir accidentes y enfermedades del trabajo. Su tasa de cotización depende de la clase de riesgo (de 1 a 5)."],
    ["Auditoría", "Registro de quién hizo cada cambio importante, cuándo y qué valores tenía antes y después."],
    ["Ausentismo", "Los días en que un trabajador no va a trabajar por una incapacidad o una licencia. El módulo los registra y calcula quién paga cada día."],
    ["Autorización de datos de salud", "Permiso escrito del trabajador para que la empresa trate sus datos de salud. Es un dato sensible protegido por la Ley 1581 de 2012."],
    ["Caja de compensación", "Entidad de subsidio familiar a la que se afilia al trabajador."],
    ["Cartera", "El dinero que los clientes le deben a la empresa."],
    ["CIE-10", "Clasificación internacional de enfermedades: el código que identifica el diagnóstico de una incapacidad (por ejemplo, J06.9). Es un dato de salud."],
    ["Cierre de caja", "Resumen de lo que entró y salió de la caja en un período, con el conteo del efectivo."],
    ["Cuota inicial", "Primer pago de una venta financiada, que se hace al firmar. Se cuenta como la cuota 0."],
    ["Desistimiento", "Cuando el comprador se retira de la compra. Se registra sin borrar los abonos ni los recibos."],
    ["EPP", "Elementos de protección personal: casco, guantes, botas, gafas y demás que se entregan al trabajador. Cada uno tiene una vida útil, al cabo de la cual se repone."],
    ["EPS", "Entidad promotora de salud a la que está afiliado el trabajador."],
    ["Escriturar", "Marcar que el lote ya tiene su escritura firmada."],
    ["Excepción", "Una venta que se sale de las reglas (por ejemplo, cuota inicial menor). Necesita aprobación del gerente."],
    ["Extracto", "El documento del banco que muestra los movimientos de una cuenta."],
    ["Financiada", "Venta en la que la empresa le da plazo al comprador para pagar el saldo."],
    ["Incapacidad", "Tiempo en que un médico ordena que el trabajador no trabaje por una enfermedad o un accidente. Según el origen y los días, la pagan el empleador, la EPS, la ARL o el fondo de pensiones."],
    ["Licencia", "Permiso para no trabajar que no es una incapacidad: por maternidad o paternidad, luto, calamidad doméstica, o no remunerada."],
    ["Liquidación de apoyo", "El cálculo que hace el sistema de quién paga cada día de un ausentismo y cuánto. Ayuda a la nómina, pero no la reemplaza ni certifica cumplimiento legal."],
    ["Lote", "Cada porción del terreno que se vende."],
    ["Mora", "Atraso en el pago de una cuota."],
    ["Novedad", "Un valor extra de un pago de nómina: horas extras, bonos, descuentos o lo que sale de una incapacidad."],
    ["Pagador", "Quien paga un día de ausentismo: el empleador, la EPS, la ARL o el fondo de pensiones."],
    ["PHVA", "Planear, hacer, verificar y actuar: los cuatro ciclos con los que se ordenan las actividades del plan de trabajo de seguridad y salud."],
    ["Prórroga", "Una incapacidad que continúa otra anterior. Sus días se suman a los de la primera para saber en qué tramo de pago va."],
    ["Recibo de caja", "Comprobante numerado que se entrega por cada pago recibido."],
    ["Recobro", "El cobro que la empresa le hace a la EPS, la ARL o el fondo de pensiones por los días de incapacidad que le corresponde pagar a la entidad."],
    ["Semáforo", "Colores de la cartera: verde (al día), amarillo (por vencer) y rojo (en mora)."],
    ["Separar", "Apartar un lote para un cliente interesado, con una fecha límite para formalizar la venta."],
    ["SMMLV", "Salario mínimo mensual legal vigente. Es uno de los valores legales que se guardan por año en el módulo de Seguridad y salud."],
    ["SST", "Seguridad y salud en el trabajo: el módulo que lleva las afiliaciones, los EPP, el plan de trabajo y las capacitaciones del personal."],
    ["Verificar", "Confirmar que un pago hecho por banco aparece en el extracto."],
    ["Vida útil", "Los días que dura un elemento de protección antes de reponerlo. De ella sale la fecha de reposición."],
], [24, 76])

apendice("Preguntas frecuentes")
h3("¿Puedo borrar un abono que registré mal?")
p("No se borra, se anula. Pídele al gerente que lo anule con un motivo y registra uno nuevo con el valor correcto. El recibo anulado se conserva y su número no se reutiliza.")
h3("¿Por qué un cliente que pagó por transferencia aparece “por verificar”?")
p("Porque los pagos por banco quedan pendientes hasta confirmarse contra el extracto. Mientras tanto ya cuentan en su saldo.")
h3("¿Por qué no puedo generar un cierre de caja?")
p("Hay dos causas frecuentes: el cierre anterior todavía no está aprobado, o el período que elegiste no ha terminado. El sistema te muestra el mensaje en la misma pantalla.")
h3("Una venta quedó “pendiente de aprobación”. ¿Qué hago?")
p("Se salió de las reglas (cuota inicial baja o plazo largo). El gerente debe aprobarla o rechazarla desde la lista de ventas.")
h3("¿Cómo sé si el cliente recibió el recibo?")
p("Mira la opción Notificaciones: allí queda cada aviso con su resultado. Si el resultado es “Omitida”, el cliente no tiene correo registrado: usa WhatsApp o edita su ficha.")
h3("¿Puedo usar el sistema desde el celular?")
p("Sí. Las pantallas se adaptan al celular. Registrar un abono y consultar el estado de cuenta funcionan en un Android de gama media.")
h3("¿Por qué un trabajador aparece con afiliaciones pendientes?")
p("Porque todavía no se le ha registrado alguna de las cinco afiliaciones (EPS, pensión, cesantías, ARL y caja), o no tiene el certificado de afiliación o la autorización de datos de salud. Entra a su ficha de seguridad social y complétalo; la alerta desaparece sola.")
h3("¿Puedo borrar una entrega de EPP que registré mal?")
p("No se borra, se anula. Abre la entrega, pulsa **Anular entrega** y escribe el motivo. Luego registra la entrega correcta.")
h3("¿Puedo cambiar las fechas o el tipo de una incapacidad que registré mal?")
p("No se cambian. Abre el registro, pulsa **Anular**, escribe el motivo y registra el correcto: las fechas anuladas quedan libres. Lo que sí se edita es el número del certificado, el diagnóstico y las observaciones.")
h3("¿Por qué no veo el diagnóstico de una incapacidad?")
p("Porque es un dato de salud y solo lo ven el gerente y el contratista SST. El administrador ve el registro y la liquidación, pero no esa sección.")
h3("¿Por qué no veo los valores en pesos del ausentismo?")
p("Porque tu rol no los incluye: los ven el gerente y el administrador. El contratista SST ve los días y quién paga cada uno, sin dinero.")
h3("¿La liquidación del ausentismo es la liquidación de la nómina?")
p("No. Es una ayuda de apoyo que dice quién paga cada día y cuánto, con los parámetros que tiene la empresa. La nómina se liquida fuera del sistema, y los parámetros deben ser validados por el asesor laboral.")
h3("¿Por qué el sistema no me deja agregar una novedad de ausentismo?")
p("Hay tres causas frecuentes: la novedad ya se agregó (aparece como Ya agregada), el período de pago pasa de 62 días, o los días del período los paga el empleador, que no generan novedad.")
h3("¿Por qué la revisión de mi archivo de Excel de SST dice que no se guardó nada?")
p("Porque la revisión nunca guarda: solo muestra lo que pasaría. Si hay errores, corrígelos en el Excel y súbelo otra vez. Solo cuando no hay errores y confirmas con **Sí, guardar** se carga todo.")
h3("¿Por qué los avisos de seguridad y salud salen como “Omitido”?")
p("Porque el correo de la empresa todavía no está configurado. Los avisos se guardan y salen solos cuando se configure. Mientras tanto, las alertas se ven en las pestañas del módulo y en el panel general.")
h3("¿Se pueden recuperar los datos si algo sale mal?")
p("Sí. La información nunca se borra del sistema y el gerente puede exportar todos los datos a Excel desde Configuración en cualquier momento.")

apendice("Si algo no funciona")
tabla("problemas", "Problemas frecuentes y qué hacer", ["Qué ves", "Qué hacer"], [
    ["No puedo ingresar", "Revisa el correo y la contraseña. Si la olvidaste, usa “¿Olvidaste tu contraseña?”. Tras varios intentos fallidos la cuenta se bloquea unos minutos: espera o pide al gerente que te restablezca la contraseña."],
    ["La sesión se cerró sola", "Es normal tras un rato sin usar el sistema. Ingresa de nuevo."],
    ["No me llega el correo de recuperación", "Revisa la carpeta de correo no deseado. Si no está, pide al gerente que restablezca tu contraseña."],
    ["No veo una opción del menú", "Tu rol no la incluye. Consulta el Apéndice A o pregúntale al gerente."],
    ["El sistema dice que la referencia ya existe", "Esa referencia ya se usó en la misma cuenta. Revisa que no estés registrando dos veces el mismo pago."],
    ["Un reporte tarda en abrir", "Los reportes grandes pueden tardar unos segundos. Espera a que termine; si falla, intenta con un rango de fechas más corto."],
    ["No veo la opción Seguridad y salud", "Tu rol no la incluye (el rol Consulta no la ve). Pídele al gerente que revise tu rol."],
    ["No puedo registrar una afiliación", "Solo el gerente y el administrador registran afiliaciones. El contratista SST las consulta, pero no las cambia."],
    ["No puedo registrar un ausentismo: dice que las fechas se traslapan", "El trabajador ya tiene un ausentismo en esas fechas. Revisa la lista: si el otro está equivocado, anúlalo y vuelve a registrar."],
    ["Al registrar el ausentismo dice que faltan los parámetros legales del año", "El gerente debe cargar y validar los valores del año en Configuración → Seguridad social."],
    ["No veo la sección Novedades para nómina ni los valores", "Tu rol no puede ver valores. Los ven el gerente y el administrador."],
    ["Al cargar el Excel de SST aparecen errores por fila", "Corrige la fila y la columna que indica el sistema, guarda el Excel y súbelo otra vez. Mientras haya un error no se guarda nada."],
    ["Un aviso aparece como “Omitida”", "El cliente no tiene correo o el correo de la empresa no está configurado. Usa WhatsApp o completa los datos."],
    ["Algo se ve raro en el celular", "Recarga la página. Si sigue igual, cuéntale al gerente qué pantalla era y qué estabas haciendo."],
], [32, 68])
p("Si el problema continúa, avisa al gerente con tres datos: qué estabas haciendo, qué pantalla era y qué mensaje apareció. Eso permite resolverlo más rápido.")

C.append(("referencias", [
    "American Psychological Association. (2020). *Publication manual of the American Psychological Association* (7.ª ed.). https://doi.org/10.1037/0000165-000",
    "Congreso de la República de Colombia. (2012, 17 de octubre). *Ley 1581 de 2012, por la cual se dictan disposiciones generales para la protección de datos personales*. Diario Oficial n.º 48.587.",
    "Gutierrez Lopez, V. A. (2026). *Sistema de gestión de urbanismo* (versión 1.2) [Software]. Edición para Balder Ingeniería y Mantenimiento SAS.",
]))
