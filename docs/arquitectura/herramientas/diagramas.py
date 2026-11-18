# -*- coding: utf-8 -*-
# Dibuja los diagramas del documento "Arquitectura del sistema" (PNG) con matplotlib.
#   python docs/arquitectura/herramientas/diagramas.py
# Salida: docs/arquitectura/diagramas/*.png
import os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

AQUI = os.path.dirname(os.path.abspath(__file__))
SALIDA = os.path.normpath(os.path.join(AQUI, '..', 'diagramas'))
os.makedirs(SALIDA, exist_ok=True)

for f in ('calibri.ttf', 'calibrib.ttf', 'calibrii.ttf'):
    ruta = os.path.join('C:/Windows/Fonts', f)
    if os.path.exists(ruta):
        font_manager.fontManager.addfont(ruta)
plt.rcParams['font.family'] = 'Calibri'

AZUL = '#1F3A5F'
AZUL_C = '#DCE8F7'
VERDE = '#2E7D5B'
VERDE_C = '#DDF1E7'
NARANJA = '#C46A12'
NARANJA_C = '#FCE9D2'
MORADO = '#6B4C9A'
MORADO_C = '#E9E1F5'
GRIS = '#595959'
GRIS_C = '#EFEFEF'
ROJO = '#B3392F'
ROJO_C = '#F8DEDB'
BLANCO = '#FFFFFF'
ESCALA = 0.072      # pulgadas por unidad del lienzo
FACTOR = 1.12       # aumento general de la letra
PT = 1 / (72 * ESCALA)   # unidades del lienzo por punto tipográfico
import textwrap

PALETA = {
    'azul': (AZUL_C, AZUL), 'verde': (VERDE_C, VERDE), 'naranja': (NARANJA_C, NARANJA),
    'morado': (MORADO_C, MORADO), 'gris': (GRIS_C, GRIS), 'rojo': (ROJO_C, ROJO), 'blanco': (BLANCO, GRIS),
}


def lienzo(ancho, alto):
    """Un lienzo de ESCALA unidades por pulgada: 120 unidades ocupan ~8,6 pulgadas, que luego se ajustan a 6,5 en el documento."""
    fig = plt.figure(figsize=(ancho * ESCALA, alto * ESCALA), dpi=200)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, ancho)
    ax.set_ylim(0, alto)
    ax.axis('off')
    return fig, ax


def _envolver(texto, ancho_unidades, pt):
    """Parte el texto en líneas que quepan en el ancho dado (Calibri: ~0,48 em por letra)."""
    letras = max(6, int(ancho_unidades / (0.50 * pt * PT)))
    salida = []
    for parrafo in texto.split(chr(10)):
        salida += textwrap.wrap(parrafo, width=letras) or ['']
    return salida


def caja(ax, x, y, w, h, titulo, sub=None, color='azul', size=11, subsize=8.6, negrita=True):
    """(x, y) es la esquina inferior izquierda. El texto se parte solo para que quepa en la caja."""
    relleno, borde = PALETA[color]
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle='round,pad=0,rounding_size=1.6', facecolor=relleno, edgecolor=borde, linewidth=1.3))
    size, subsize = size * FACTOR, subsize * FACTOR
    util = w - 2.6
    lineas_t = _envolver(titulo.replace(chr(10), ' '), util, size)
    lh_t, lh_s = size * 1.22 * PT, subsize * 1.22 * PT
    lineas_s = []
    if sub:
        lineas_s = _envolver(' '.join(sub.split(chr(10))), util, subsize)
    alto_total = len(lineas_t) * lh_t + (1.0 + len(lineas_s) * lh_s if lineas_s else 0)
    if alto_total > h - 0.8:
        print('   aviso: texto largo en caja', repr(titulo[:30]), round(alto_total, 1), '>', h)
    y_top = y + h / 2 + alto_total / 2
    for i, l in enumerate(lineas_t):
        ax.text(x + w / 2, y_top - (i + 0.5) * lh_t, l, ha='center', va='center', fontsize=size, fontweight='bold' if negrita else 'normal', color=borde)
    base = y_top - len(lineas_t) * lh_t - 1.0
    for i, l in enumerate(lineas_s):
        ax.text(x + w / 2, base - (i + 0.5) * lh_s, l, ha='center', va='center', fontsize=subsize, color='#333333')
    return (x, y, w, h)


def grupo(ax, x, y, w, h, titulo, color='gris', size=10):
    _, borde = PALETA[color]
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle='round,pad=0,rounding_size=2.2', facecolor='none', edgecolor=borde, linewidth=1.2, linestyle=(0, (5, 3))))
    ax.text(x + 2, y + h - 1.4, titulo, ha='left', va='top', fontsize=size * FACTOR, fontweight='bold', color=borde)


def flecha(ax, p1, p2, texto=None, color=GRIS, doble=False, curva=0.0, size=8.4, desplazar=(0, 1.6), estilo='-'):
    arrow = FancyArrowPatch(p1, p2, arrowstyle='<|-|>' if doble else '-|>', mutation_scale=11, linewidth=1.3, color=color,
                            connectionstyle=f'arc3,rad={curva}', shrinkA=0, shrinkB=0, linestyle=estilo)
    ax.add_patch(arrow)
    if texto:
        mx, my = (p1[0] + p2[0]) / 2 + desplazar[0], (p1[1] + p2[1]) / 2 + desplazar[1]
        ax.text(mx, my, texto, ha='center', va='center', fontsize=size * FACTOR, color=color, linespacing=1.1,
                bbox=dict(boxstyle='round,pad=0.18', facecolor='white', edgecolor='none', alpha=0.92))


def titulo(ax, ancho, alto, texto):
    ax.text(ancho / 2, alto - 2.4, texto, ha='center', va='top', fontsize=14.5, fontweight='bold', color=AZUL)


def guardar(fig, nombre):
    ruta = os.path.join(SALIDA, nombre + '.png')
    fig.savefig(ruta, dpi=200, facecolor='white')
    plt.close(fig)
    print('ok', nombre)


# ====================================================================== 1. contexto
def d_contexto():
    W, H = 120, 84
    fig, ax = lienzo(W, H)
    titulo(ax, W, H, 'El sistema y quienes se relacionan con él')
    grupo(ax, 2, 10, 28, 62, 'Personas que lo usan', 'azul')
    caja(ax, 5, 58, 22, 9, 'Gerente', 'Control total', 'azul')
    caja(ax, 5, 48, 22, 9, 'Administrador', 'Operación diaria', 'azul')
    caja(ax, 5, 38, 22, 9, 'Consulta', 'Solo lectura', 'azul')
    caja(ax, 5, 28, 22, 9, 'Contratista SST', 'Solo seguridad y salud en el trabajo', 'azul', size=10.5, subsize=8)
    caja(ax, 5, 14, 22, 12, 'Soporte técnico', 'Solo lectura (para el desarrollador)', 'azul', size=10.5, subsize=8)
    grupo(ax, 40, 12, 40, 60, 'Sistema de gestión de urbanismo', 'verde')
    caja(ax, 44, 55, 32, 11, 'Pantallas web', 'React · se usan desde el navegador', 'verde')
    caja(ax, 44, 36, 32, 14, 'Servidor (API)', 'NestJS · reglas de negocio y permisos', 'verde')
    caja(ax, 44, 17, 32, 14, 'Base de datos y archivos', 'PostgreSQL · comprobantes y documentos', 'verde')
    flecha(ax, (60, 55), (60, 50), doble=True)
    flecha(ax, (60, 36), (60, 31), doble=True)
    flecha(ax, (30, 46), (40, 60), 'navegador\n(HTTPS)', doble=True, desplazar=(0, 0), size=7.6)
    caja(ax, 90, 62, 28, 14, 'Cliente comprador', 'No ingresa: recibe recibos, recordatorios y avisos', 'naranja')
    flecha(ax, (76, 46), (90, 66), 'correo\nelectrónico', color=NARANJA, desplazar=(-1, 5))
    grupo(ax, 86, 4, 32, 44, 'Servicios externos', 'morado')
    caja(ax, 89, 35, 26, 8, 'Correo SMTP', 'envía los avisos', 'morado', size=10.5, subsize=8)
    caja(ax, 89, 25.5, 26, 8, 'Backblaze B2', 'copias cifradas', 'morado', size=10.5, subsize=8)
    caja(ax, 89, 14.5, 26, 9.5, 'Vigilancia', 'healthchecks.io · UptimeRobot', 'morado', size=10.5, subsize=8)
    caja(ax, 89, 6.5, 26, 6, "Let's Encrypt", None, 'morado', size=9.5)
    flecha(ax, (76, 43), (89, 39), color=MORADO)
    flecha(ax, (76, 24), (89, 29.5), color=MORADO)
    flecha(ax, (76, 20), (89, 19), color=MORADO, estilo='--')
    guardar(fig, 'd01-contexto')


# ====================================================================== 2. capas
def d_capas():
    W, H = 120, 86
    fig, ax = lienzo(W, H)
    titulo(ax, W, H, 'Las tres capas del sistema')
    # navegador
    caja(ax, 4, 66, 112, 14, 'Navegador de la persona', 'Computador, tableta o celular (desde 360 px de ancho)', 'gris')
    flecha(ax, (60, 66), (60, 59), 'HTTPS', doble=True)
    # Frontend
    grupo(ax, 4, 38, 112, 21, 'Capa 1 · Pantallas (frontend)', 'azul')
    caja(ax, 8, 41, 24, 11, 'Páginas', '58 pantallas\n(react-router)', 'azul')
    caja(ax, 36, 41, 24, 11, 'Componentes', 'formularios, tablas,\nventanas, tarjetas', 'azul')
    caja(ax, 64, 41, 24, 11, 'Sesión y permisos', 'qué ve cada rol\n(solo comodidad)', 'azul')
    caja(ax, 92, 41, 20, 11, 'lib/api.ts', 'una función por\nllamada al servidor', 'azul')
    flecha(ax, (60, 38), (60, 33), 'API REST (JSON)', doble=True)
    # Backend
    grupo(ax, 4, 14, 112, 19, 'Capa 2 · Servidor (backend NestJS)', 'verde')
    caja(ax, 8, 17, 19, 10, 'Controladores', 'reciben y validan\nla petición', 'verde', size=10.5)
    caja(ax, 32, 17, 19, 10, 'Guardas', 'sesión (JWT) y\npermiso del rol', 'verde', size=10.5)
    caja(ax, 56, 17, 19, 10, 'Servicios', 'reglas de negocio\ny cálculos', 'verde', size=10.5)
    caja(ax, 80, 17, 19, 10, 'Prisma', 'acceso a la base\nde datos', 'verde', size=10.5)
    flecha(ax, (27, 22), (32, 22), color=VERDE)
    flecha(ax, (51, 22), (56, 22), color=VERDE)
    flecha(ax, (75, 22), (80, 22), color=VERDE)
    caja(ax, 102, 17, 12, 10, 'Tareas', 'programadas', 'verde', size=10, subsize=6.6)
    flecha(ax, (89.5, 14), (89.5, 10), doble=True)
    # Datos
    grupo(ax, 4, 1, 112, 9, '', 'naranja')
    caja(ax, 8, 2, 40, 6, 'Capa 3 · Base de datos PostgreSQL 16', None, 'naranja', size=10.5)
    caja(ax, 52, 2, 32, 6, 'Archivos adjuntos', None, 'naranja', size=10.5)
    caja(ax, 88, 2, 24, 6, 'Correo de avisos', None, 'morado', size=10.5)
    guardar(fig, 'd02-capas')


# ====================================================================== 3. contenedores producción
def d_produccion():
    W, H = 120, 92
    fig, ax = lienzo(W, H)
    titulo(ax, W, H, 'Cómo está armado el servidor de producción')
    caja(ax, 3, 58, 24, 12, 'Internet', 'navegadores de\nlas personas', 'gris')
    flecha(ax, (27, 64), (44, 64), 'HTTPS 443\nHTTP 80', doble=True, desplazar=(0, -4.6), size=7.6)
    grupo(ax, 34, 6, 84, 80, 'Servidor VPS (Hostinger) · Ubuntu 26.04 LTS · cortafuegos UFW (solo 22, 80 y 443) · fail2ban', 'gris', size=9.4)
    grupo(ax, 38, 10, 76, 66, 'Docker · red interna: solo el proxy es visible desde afuera', 'azul', size=9.6)
    caja(ax, 44, 56, 30, 14, 'proxy', 'Caddy: certificado HTTPS\nautomático y las pantallas', 'azul')
    caja(ax, 82, 56, 28, 14, 'api', 'NestJS (puerto 3000)\nsolo el proxy la alcanza', 'verde')
    flecha(ax, (74, 63), (82, 63), '/api/*', doble=True, desplazar=(0, 2.4))
    caja(ax, 44, 36, 30, 14, 'Web pública', 'balderingenieria.com\n(proyecto aparte, mismo proxy)', 'morado', size=10.5, subsize=8.2)
    flecha(ax, (59, 56), (59, 50), color=MORADO, estilo='--')
    caja(ax, 82, 36, 28, 14, 'db', 'PostgreSQL 16\nsin puertos publicados', 'naranja')
    flecha(ax, (96, 56), (96, 50), 'SQL', doble=True, desplazar=(4.5, 0))
    caja(ax, 44, 14, 30, 14, 'migrar', 'aplica las migraciones y se apaga;\nla api no arranca sin que termine', 'gris', size=10.5, subsize=8.2)
    flecha(ax, (74, 25), (82, 38), color=GRIS, estilo='--', curva=-0.15)
    grupo(ax, 78, 12, 34, 20, 'Volúmenes (disco del servidor)', 'naranja', size=9)
    caja(ax, 81, 14, 14, 11, 'pgdata', 'la base', 'naranja', size=9.5, subsize=8)
    caja(ax, 97, 14, 13, 11, 'uploads', 'adjuntos', 'naranja', size=9.5, subsize=8)
    caja(ax, 3, 32, 24, 14, 'Copias de seguridad', 'cada noche, cifradas,\nhacia Backblaze B2', 'morado')
    flecha(ax, (27, 39), (34, 39), color=MORADO, estilo='--')
    caja(ax, 3, 12, 24, 14, 'Vigilancia', 'UptimeRobot consulta\n/api/salud desde afuera', 'morado')
    flecha(ax, (27, 19), (34, 19), color=MORADO, estilo='--')
    guardar(fig, 'd03-produccion')

# ====================================================================== 4. mapa de módulos
def d_modulos():
    W, H = 120, 112
    fig, ax = lienzo(W, H)
    titulo(ax, W, H, 'Mapa de módulos del servidor, por área de negocio')
    PASO, ALTO = 6.4, 5

    def lista(x, ytop, w, nombre, items, color, cols=2):
        filas = -(-len(items) // cols)
        h = 9 + filas * PASO
        y = ytop - h
        grupo(ax, x, y, w, h, nombre, color, size=10.5)
        ancho = (w - 4 - (cols - 1) * 2) / cols
        for i, it in enumerate(items):
            c, f = i % cols, i // cols
            caja(ax, x + 2 + c * (ancho + 2), ytop - 9 - f * PASO - ALTO + 1.2, ancho, ALTO, it, None, color, size=8.8, negrita=False)
        return y
    y1 = lista(3, 104, 56, 'Venta de lotes y cartera', ['proyectos', 'lotes', 'clientes', 'ventas', 'abonos y recibos', 'cartera (mora)', 'acuerdos-pago', 'comisiones', 'recordatorios', 'notificaciones'], 'azul')
    lista(61, 104, 56, 'Dinero de la empresa', ['finanzas', 'cierres-caja', 'consecutivos', 'dashboard', 'reportes', 'exportacion'], 'verde')
    y3 = lista(3, y1 - 3, 56, 'Personas, nómina y SST', ['trabajadores', 'nomina', 'seguridad-social', 'sst', 'ausentismo', 'reportes-sst'], 'naranja')
    y4 = lista(61, 104 - (9 + 3 * PASO) - 3, 56, 'Maquinaria y datos masivos', ['equipos', 'importacion', 'importacion-sst'], 'morado')
    ax.text(89, y4 - 7, 'Cada módulo = controlador + servicio + reglas puras + pruebas', ha='center', va='center', fontsize=8.8, color=GRIS, style='italic')
    lista(3, min(y3, y4 - 12) - 3, 114, 'Servicios transversales (los usan todos los módulos)', ['auth', 'roles', 'usuarios', 'auditoria', 'configuracion', 'storage', 'email', 'salud', 'prisma', 'common'], 'gris', cols=5)
    guardar(fig, 'd04-modulos')

# ====================================================================== 5. despliegue
def d_despliegue():
    W, H = 120, 66
    fig, ax = lienzo(W, H)
    titulo(ax, W, H, 'Cómo se publica una versión nueva')
    pasos = [
        ('1', 'Computador', 'pruebas y commit\nen Git', 'azul'),
        ('2', 'Paquete', 'git archive →\npaquete.tar.gz', 'azul'),
        ('3', 'Servidor', 'scp al VPS\n(usuario deploy)', 'azul'),
        ('4', 'Respaldo', 'respaldar.sh\nantes de tocar nada', 'naranja'),
        ('5', 'Despliegue', 'desplegar.sh:\nconstruye imágenes', 'verde'),
        ('6', 'Migraciones', 'contenedor migrar\naplica la base', 'verde'),
        ('7', 'API nueva', 'arranca y pasa\nsu chequeo de salud', 'verde'),
        ('8', 'Verificación', 'curl /api/salud\ny la web pública', 'morado'),
    ]
    ancho, sep = 25, 4.5
    for i, (n, t, s, c) in enumerate(pasos):
        fila, col = divmod(i, 4)
        x = 3 + col * (ancho + sep)
        y = 36 if fila == 0 else 10
        caja(ax, x, y, ancho, 18, f'{n}. {t}', s, c, size=11)
        if col < 3:
            flecha(ax, (x + ancho, y + 9), (x + ancho + sep, y + 9))
    flecha(ax, (3 + 3 * (ancho + sep) + ancho / 2, 36), (3 + ancho / 2, 28), curva=0.0, color=GRIS, estilo='--')
    ax.text(78, 30.5, 'sigue en la fila de abajo', ha='center', va='center', fontsize=8.5, color=GRIS, style='italic')
    ax.text(60, 4, 'Si algo falla: se vuelve al código anterior (fuente.anterior) y se restaura la copia del paso 4.', ha='center', va='center', fontsize=9.2, color=ROJO)
    guardar(fig, 'd05-despliegue')


# ====================================================================== 6. copias de seguridad
def d_copias():
    W, H = 120, 78
    fig, ax = lienzo(W, H)
    titulo(ax, W, H, 'Copias de seguridad: qué pasa cada noche y cada mes')
    caja(ax, 3, 52, 26, 14, 'Cada noche', '2:00 a. m. · temporizador systemd\n(hora de Bogotá)', 'gris')
    caja(ax, 37, 52, 26, 14, 'Se reúne', 'base de datos completa +\nadjuntos + archivo .env', 'azul')
    caja(ax, 71, 52, 22, 14, 'Se verifica', 'cada archivo se lee\nentero antes de subir', 'verde')
    caja(ax, 98, 52, 20, 14, 'Se cifra', 'rclone crypt, con\ndos contraseñas', 'naranja')
    for a, b in [(29, 37), (63, 71), (93, 98)]:
        flecha(ax, (a, 59), (b, 59))
    caja(ax, 71, 28, 47, 15, 'Backblaze B2 (bucket privado)', 'solo ve archivos ilegibles · Object Lock\nretención de 30 días por regla de ciclo de vida', 'morado')
    flecha(ax, (108, 52), (100, 43), color=NARANJA)
    caja(ax, 3, 28, 26, 15, 'En el servidor', 'se conservan las\núltimas 3 copias', 'gris')
    flecha(ax, (45, 52), (16, 43), color=GRIS, estilo='--')
    caja(ax, 37, 28, 26, 15, 'Se compara el tamaño', 'lo subido contra lo local;\nsi no coincide, falla', 'verde')
    flecha(ax, (71, 35.5), (63, 35.5), doble=True)
    # prueba mensual
    grupo(ax, 3, 3, 114, 20, 'Cada día 1 del mes, 3:30 a. m. — prueba de restauración', 'azul', size=10)
    caja(ax, 7, 6, 30, 11, 'Descarga la última copia', None, 'azul', size=10)
    caja(ax, 45, 6, 32, 11, 'La restaura en una base temporal', None, 'azul', size=10)
    caja(ax, 85, 6, 28, 11, 'Compara con la real y borra', 'resultado: PRUEBA OK', 'verde', size=10)
    flecha(ax, (37, 11.5), (45, 11.5))
    flecha(ax, (77, 11.5), (85, 11.5))
    ax.text(60, 46.5, 'healthchecks.io recibe un aviso al terminar; si no llega a tiempo, manda un correo', ha='center', va='center', fontsize=8.8, color=MORADO, style='italic')
    guardar(fig, 'd06-copias')


# ====================================================================== 7. flujo de un abono
def d_abono():
    W, H = 120, 78
    fig, ax = lienzo(W, H)
    titulo(ax, W, H, 'Qué ocurre cuando se registra un abono')
    caja(ax, 3, 56, 24, 14, '1. Pantalla', 'se escribe el valor, la fecha\ny el medio; se adjunta el soporte', 'azul', size=10.5, subsize=8.2)
    caja(ax, 33, 56, 24, 14, '2. Guardas', 'sesión válida y permiso\nabonos.crear; alcance\npor proyecto', 'verde', size=10.5, subsize=8.2)
    caja(ax, 63, 56, 24, 14, '3. Validaciones', 'valor en pesos enteros, fecha\nno futura, cuenta si no es\nefectivo, día no cerrado', 'verde', size=10.5, subsize=8)
    caja(ax, 93, 56, 24, 14, '4. Transacción', 'todo o nada: si algo\nfalla, no queda nada', 'naranja', size=10.5, subsize=8.2)
    for a, b in [(27, 33), (57, 63), (87, 93)]:
        flecha(ax, (a, 63), (b, 63))
    grupo(ax, 3, 24, 114, 26, 'Dentro de la transacción (un solo bloque indivisible en la base de datos)', 'naranja', size=10)
    caja(ax, 7, 28, 24, 14, 'Bloquea la venta', 'dos abonos a la vez\nhacen turno', 'naranja', size=10, subsize=8.2)
    caja(ax, 34, 28, 24, 14, 'Reparte el abono', 'a las cuotas pendientes,\npor orden de vencimiento', 'naranja', size=10, subsize=8.2)
    caja(ax, 61, 28, 26, 14, 'Número de recibo', 'consecutivo sin saltos ni\nrepetidos (una sentencia atómica)', 'naranja', size=10, subsize=8)
    caja(ax, 90, 28, 24, 14, 'Auditoría', 'quién, cuándo, qué\ny valores', 'naranja', size=10, subsize=8.2)
    for a, b in [(31, 34), (58, 61), (87, 90)]:
        flecha(ax, (a, 35), (b, 35), color=NARANJA)
    flecha(ax, (105, 56), (102, 50), color=NARANJA)
    caja(ax, 3, 3, 34, 14, 'Recibo en PDF', 'se genera cuando se pide;\nnada de enlaces públicos', 'azul', size=10.5, subsize=8.2)
    caja(ax, 43, 3, 34, 14, 'Correo al cliente', 'solo si está activo en\nConfiguración; queda el historial', 'morado', size=10.5, subsize=8.2)
    caja(ax, 83, 3, 34, 14, 'Caja, cartera y panel', 'se leen de los mismos\nregistros: se actualizan solos', 'verde', size=10.5, subsize=8.2)
    flecha(ax, (60, 24), (20, 17), color=GRIS)
    flecha(ax, (60, 24), (60, 17), color=GRIS)
    flecha(ax, (60, 24), (100, 17), color=GRIS)
    guardar(fig, 'd07-abono')


# ====================================================================== 8. flujo de nómina
def d_nomina():
    W, H = 120, 80
    fig, ax = lienzo(W, H)
    titulo(ax, W, H, 'La nómina por obra y quincena')
    caja(ax, 3, 56, 26, 15, '1. Liquidar quincena', 'se elige la obra y la quincena y\nse agregan los trabajadores', 'azul', size=10.5, subsize=8)
    caja(ax, 36, 56, 26, 15, '2. Se calcula', 'días × valor día + horas extra\n− anticipo − descuento', 'verde', size=10.5, subsize=8.2)
    caja(ax, 69, 56, 22, 15, '3. Se revisa', 'día de caja abierto, obra\nno finalizada, sin repetidos', 'verde', size=10.5, subsize=8)
    caja(ax, 97, 56, 20, 15, '4. Se guarda', 'un pago por trabajador\n(todo o nada)', 'naranja', size=10.5, subsize=8.2)
    for a, b in [(29, 36), (62, 69), (91, 97)]:
        flecha(ax, (a, 63.5), (b, 63.5))
    grupo(ax, 3, 24, 114, 26, 'Lo que se actualiza solo, porque todo se lee de los mismos pagos', 'azul', size=10)
    caja(ax, 7, 28, 24, 14, 'Costo por obra', 'lo devengado entra a\nlas finanzas de la obra', 'azul', size=10, subsize=8.2)
    caja(ax, 34, 28, 24, 14, 'Flujo y cierre de caja', 'lo pagado, en la fecha\nde pago y por medio', 'azul', size=10, subsize=8.2)
    caja(ax, 61, 28, 26, 14, 'Ficha del trabajador', 'sus pagos con la obra\ny los días', 'azul', size=10, subsize=8.2)
    caja(ax, 90, 28, 24, 14, 'Auditoría', 'cada pago queda\nregistrado', 'azul', size=10, subsize=8.2)
    flecha(ax, (107, 56), (102, 50), color=AZUL)
    caja(ax, 3, 3, 52, 14, 'Si algo salió mal: Liquidaciones → Corregir', 'motivo obligatorio · se recalcula · auditoría con lo anterior y lo nuevo', 'naranja', size=10.5, subsize=8.2)
    caja(ax, 62, 3, 55, 14, 'Después del cierre de caja', 'ese día queda bloqueado: ya no se corrige', 'rojo', size=10.5, subsize=8.4)
    flecha(ax, (58, 24), (30, 17), color=GRIS)
    flecha(ax, (86, 24), (88, 17), color=GRIS)
    guardar(fig, 'd08-nomina')


# ====================================================================== 9. recordatorios
def d_recordatorios():
    W, H = 120, 78
    fig, ax = lienzo(W, H)
    titulo(ax, W, H, 'Tareas automáticas de cada mañana (hora de Bogotá)')
    caja(ax, 3, 58, 36, 12, '8:00 a. m. · Recordatorio', 'cuotas que vencen pronto:\naviso al cliente', 'azul', size=10.5, subsize=8.2)
    caja(ax, 43, 58, 36, 12, '8:05 a. m. · Aviso de mora', 'cuotas vencidas:\naviso al cliente', 'naranja', size=10.5, subsize=8.2)
    caja(ax, 83, 58, 34, 12, '8:10 a. m. · Avisos de SST', 'para el equipo, no\npara los clientes', 'verde', size=10.5, subsize=8.2)
    flecha(ax, (21, 58), (21, 50))
    flecha(ax, (61, 58), (61, 50))
    flecha(ax, (100, 58), (100, 50))
    grupo(ax, 3, 24, 76, 26, 'Para cada cuota de un cliente, en este orden', 'azul', size=10)
    caja(ax, 6, 27, 22, 14, '1. Se reclama', 'se marca como avisada\n(nadie la repite)', 'gris', size=10.5, subsize=8)
    caja(ax, 31, 27, 22, 14, '2. Se revisa', 'si la venta tiene un\nacuerdo de pago, se salta', 'morado', size=10.5, subsize=8)
    caja(ax, 56, 27, 20, 14, '3. Se envía', 'queda en el historial\nde notificaciones', 'azul', size=10.5, subsize=8)
    flecha(ax, (28, 34), (31, 34))
    flecha(ax, (53, 34), (56, 34))
    caja(ax, 83, 24, 34, 26, 'Qué hace', 'un correo por estado (próxima\ny vencida) al responsable de cada\nactividad o capacitación, y un\nresumen de EPP por reponer', 'verde', size=10.5, subsize=8.2)
    caja(ax, 3, 4, 114, 14, 'Sin cuenta de correo configurada, el aviso se anota como "omitida" y no se pierde nada: sale cuando exista', None, 'blanco', size=9.5, negrita=False)
    guardar(fig, 'd09-recordatorios')

if __name__ == '__main__':
    for f in (d_contexto, d_capas, d_produccion, d_modulos, d_despliegue, d_copias, d_abono, d_nomina, d_recordatorios):
        f()
