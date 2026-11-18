# -*- coding: utf-8 -*-
# Anexo: Registro de credenciales y accesos. CONFIDENCIAL.
# Se genera en datos-reales/ (carpeta que Git ignora). Los espacios en blanco se llenan a mano en Word.
# Solo se escriben aquí datos que NO son secretos (direcciones, nombres de cuentas ya públicas en el repositorio).

ETIQUETA = "ANEXO A · CONFIDENCIAL · NO COMPARTIR"
TITULO = "Registro de credenciales y accesos"
SUBTITULO = "Sistema de gestión de urbanismo (base Urbanix) · Anexo del documento Arquitectura del sistema"
AUTOR = "Victor Alfonso Gutierrez Lopez"
EDICION = "Edición para Balder Ingeniería y Mantenimiento SAS"
VERSION = "Versión 1.0 (plantilla en blanco)"
FECHA = "Noviembre de 2026"
NOTA_PORTADA = ("Este documento reúne los accesos del sistema. Quien lo tenga puede controlar el servidor, los datos y las copias. "
                "No se envía por correo ni por WhatsApp, no se sube a Git ni a la nube sin cifrar, y se guarda solo en un lugar protegido. "
                "Se llena a mano y se actualiza cada vez que cambie una credencial.")
PIE = "CONFIDENCIAL · Registro de credenciales y accesos"
CON_INDICE = False

C = []


def h1(t): C.append(("h1", t))
def h2(t): C.append(("h2", t))
def p(t): C.append(("p", t))
def ul(*items): C.append(("ul", list(items)))
def ol(*items): C.append(("ol", list(items)))
def tabla(i, titulo, cols, filas, anchos): C.append(("tabla", i, titulo, cols, filas, anchos))
def ficha(titulo, campos): C.append(("ficha", titulo, campos))
def importante(t): C.append(("aviso", "Importante", t))
def consejo(t): C.append(("aviso", "Consejo", t))


# =====================================================================  1
h1("Cómo usar este anexo")
p("Cada servicio tiene su ficha. Los espacios en blanco se llenan **escribiendo directamente en este archivo de Word**. Donde ya hay un dato escrito, es una dirección o un nombre que no es secreto.")
ul("**Guárdalo en `datos-reales/`** (carpeta que Git ignora) o en otro lugar protegido, nunca en `docs/`. Si lo llenas y lo dejas en una carpeta que Git sigue, un `git add` podría subir todas tus contraseñas.",
   "**Una copia de respaldo** en un medio distinto (por ejemplo, una memoria USB guardada bajo llave o un archivo cifrado). Si pierdes este archivo y el gestor de contraseñas, pierdes el acceso a todo.",
   "**Actualízalo** cada vez que cambies una contraseña, y anota la fecha en la ficha y en la tabla de historial del final.",
   "**Si usas un gestor de contraseñas**, aquí basta con anotar *dónde está* cada credencial. Lo importante es que no se pierdan y que más de una persona de confianza sepa cómo recuperarlas.")
importante("Las **dos contraseñas de cifrado de las copias de seguridad** (ficha 11) son las más críticas: no se pueden recuperar. Si se pierden, todas las copias en Backblaze quedan ilegibles para siempre. Anótalas aquí y en el gestor de contraseñas, y entrega un sobre cerrado a una persona de confianza.")
tabla("resumen", "Datos de este registro", ["Dato", "Valor"], [
    ["Fecha de la última revisión completa", ""],
    ["Persona que mantiene este registro", ""],
    ["Persona de respaldo (sabe dónde está)", ""],
    ["Dónde está guardada la copia de respaldo de este archivo", ""],
    ["Gestor de contraseñas que se usa (nombre)", ""],
], [46, 54])

# =====================================================================  2
h1("Servidor y dominio")
ficha("1. Cuenta de Hostinger (dominio, DNS y servidor VPS)", [
    ("Dirección de ingreso", "hpanel.hostinger.com"),
    ("Correo o usuario de la cuenta", ""),
    ("Contraseña", ""),
    ("Segundo factor (aplicación o teléfono) y códigos de respaldo", ""),
    ("Titular de la cuenta (empresa o desarrollador)", ""),
    ("Dominio", "balderingenieria.com (vence el 27/10/2029)"),
    ("Plataforma del sistema", "sistema.balderingenieria.com"),
    ("Fecha de la última actualización", ""),
    ("Notas", ""),
])
ficha("2. Servidor VPS: acceso de administrador y consola", [
    ("Nombre o identificador del servidor en Hostinger", ""),
    ("Dirección IP", ""),
    ("Contraseña del usuario root (cerrada para ingreso por SSH; sirve para la consola web)", ""),
    ("Cómo se entra a la consola web de emergencia", "Panel de Hostinger, sección del VPS, consola en el navegador"),
    ("Fecha de la última actualización", ""),
])
ficha("3. Servidor: usuario deploy (acceso SSH)", [
    ("Usuario", "deploy"),
    ("Dirección o nombre del servidor", "sistema.balderingenieria.com"),
    ("Puerto SSH", ""),
    ("Archivo de la llave privada (ruta en el computador)", ""),
    ("Frase de paso de la llave", ""),
    ("Dónde hay copia de la llave privada", ""),
    ("Otros computadores con la llave autorizada", ""),
    ("Fecha de la última actualización", ""),
])

# =====================================================================  3
h1("Aplicación y base de datos")
ficha("4. Archivo de secretos del servidor (.env)", [
    ("Ruta en el servidor", "/opt/balder/.env"),
    ("JWT_SECRET (firma de las sesiones)", ""),
    ("Dónde está la copia de este archivo", "Copia cifrada diaria en Backblaze (carpeta env)"),
    ("Fecha de la última actualización", ""),
    ("Notas", ""),
])
ficha("5. Base de datos PostgreSQL de producción", [
    ("Contenedor", "balder-db-1"),
    ("Nombre de la base (POSTGRES_DB)", ""),
    ("Usuario (POSTGRES_USER)", ""),
    ("Contraseña (POSTGRES_PASSWORD)", ""),
    ("Fecha de la última actualización", ""),
    ("Notas", "La base no tiene puertos publicados: solo se alcanza desde dentro del servidor."),
])
ficha("6. Base de datos de desarrollo (computador del desarrollador)", [
    ("Nombre de la base", ""),
    ("Usuario", ""),
    ("Contraseña", ""),
    ("Puerto", ""),
    ("Fecha de la última actualización", ""),
])
ficha("7. Correo de avisos (SMTP)", [
    ("Proveedor del correo", ""),
    ("Cuenta de correo (SMTP_USER)", ""),
    ("Contraseña de la cuenta", ""),
    ("Contraseña de aplicación (SMTP_PASS)", ""),
    ("Servidor SMTP (SMTP_HOST) y puerto (SMTP_PORT)", ""),
    ("Dirección remitente (SMTP_FROM)", ""),
    ("Verificación en dos pasos y códigos de respaldo", ""),
    ("Correo de contacto de la empresa (recibe las respuestas de los clientes)", ""),
    ("Titular de la cuenta", ""),
    ("Fecha de la última actualización", ""),
])

# =====================================================================  4
h1("Código, copias y vigilancia")
ficha("8. GitHub (repositorio del código)", [
    ("Dirección del repositorio", "github.com/victorGutyy/sistemaDeGestionUrbanistica"),
    ("Usuario", "victorGutyy"),
    ("Correo de la cuenta", ""),
    ("Contraseña", ""),
    ("Segundo factor y códigos de respaldo", ""),
    ("Token de acceso personal (si se usa)", ""),
    ("Fecha de la última actualización", ""),
])
ficha("9. Backblaze B2 (almacenamiento de las copias)", [
    ("Dirección de ingreso", "backblaze.com"),
    ("Correo de la cuenta", ""),
    ("Contraseña", ""),
    ("Segundo factor y códigos de respaldo", ""),
    ("Nombre del depósito (bucket)", ""),
    ("keyID de la llave de aplicación", ""),
    ("applicationKey (solo se muestra una vez al crearla)", ""),
    ("Titular de la cuenta", ""),
    ("Fecha de la última actualización", ""),
])
ficha("10. Archivo de configuración de rclone en el servidor", [
    ("Ruta en el servidor", "/opt/balder/rclone.conf (permisos 600)"),
    ("Remotos que contiene", "b2 y copias (copias es el remoto cifrado)"),
    ("Dónde está la copia de este archivo", ""),
])
ficha("11. CRÍTICAS: contraseñas de cifrado de las copias (rclone crypt)", [
    ("Contraseña 1 (cifrado del contenido)", ""),
    ("Contraseña 2 (sal o salt)", ""),
    ("Dónde están guardadas además de aquí", ""),
    ("Persona de confianza que tiene un sobre cerrado", ""),
    ("Fecha en que se crearon", ""),
])
ficha("12. healthchecks.io (vigilancia de las copias)", [
    ("Correo de la cuenta", ""),
    ("Contraseña", ""),
    ("Segundo factor y códigos de respaldo", ""),
    ("Dirección de aviso de la copia diaria", ""),
    ("Dirección de aviso de la prueba de restauración", ""),
    ("Correo que recibe las alertas", ""),
    ("Fecha de la última actualización", ""),
])
ficha("13. UptimeRobot (vigilancia del sistema desde afuera)", [
    ("Correo de la cuenta", ""),
    ("Contraseña", ""),
    ("Dirección que vigila", "https://sistema.balderingenieria.com/api/salud"),
    ("Correo que recibe las alertas", ""),
    ("Fecha de la última actualización", ""),
])

# =====================================================================  5
C.append(("salto",))
h1("Usuarios del sistema en producción")
p("Las contraseñas de los usuarios del sistema de la empresa las define cada persona o el gerente. **Aquí solo se anotan las de las cuentas técnicas o de emergencia**; no se escriben las de los empleados.")
ficha("14. Gerente del sistema", [
    ("Nombre", ""),
    ("Correo de ingreso", ""),
    ("Contraseña", ""),
    ("Fecha de la última actualización", ""),
])
ficha("15. Administrador de emergencia (si existe)", [
    ("Nombre", ""),
    ("Correo de ingreso", ""),
    ("Contraseña", ""),
    ("Fecha de la última actualización", ""),
])
ficha("16. Soporte técnico (solo lectura, para el desarrollador)", [
    ("Correo de ingreso", ""),
    ("Contraseña", ""),
    ("Fecha de la última actualización", ""),
])

# =====================================================================  6
h1("Otras cuentas y contactos")
ficha("17. Gestor de contraseñas", [
    ("Nombre del gestor", ""),
    ("Cuenta o correo", ""),
    ("Contraseña maestra (solo si no existe otra forma segura de custodiarla)", ""),
    ("Kit o códigos de emergencia (dónde están)", ""),
    ("Personas con acceso", ""),
])
ficha("18. Cuentas de herramientas de desarrollo", [
    ("Cuenta de Claude / Anthropic (correo)", ""),
    ("Docker Hub (si se usa)", ""),
    ("Otras cuentas", ""),
])
ficha("19. Contactos de emergencia", [
    ("Responsable técnico del sistema (nombre y celular)", ""),
    ("Representante legal de Balder (nombre y celular)", ""),
    ("Soporte de Hostinger (medio de contacto)", ""),
    ("Contador o asesor externo (si necesita acceso a reportes)", ""),
])
C.append(("salto",))
tabla("historial", "Historial de actualizaciones de este registro", ["Fecha", "Qué cambió (ficha y credencial)", "Quién lo cambió"], [
    ["", "", ""], ["", "", ""], ["", "", ""], ["", "", ""], ["", "", ""], ["", "", ""], ["", "", ""], ["", "", ""],
], [18, 62, 20])
