# -*- coding: utf-8 -*-
# Arma un documento Word (.docx) a mano (zip + XML), sin librerías, a partir de un módulo de contenido.
#   python docs/arquitectura/herramientas/render.py arquitectura   -> docs/arquitectura/Arquitectura-del-sistema.docx
#   python docs/arquitectura/herramientas/render.py anexo          -> datos-reales/Anexo-Registro-de-credenciales.docx
# Después, postprocesar.ps1 actualiza la tabla de contenido con Word y exporta el PDF.
#
# Bloques del contenido (ver contenido_arquitectura.py):
#   ("h1", t) ("h2", t) ("h3", t)      títulos numerados (1, 1.1)
#   ("p", t)                            párrafo; **negrita**, *cursiva*, `código`; {fig:id} y {tabla:id} -> "Figura N" / "Tabla N"
#   ("simple", t)                       cuadro "En palabras simples"
#   ("aviso", "Importante"|"Consejo", t)
#   ("ul", [..]) ("ol", [..])
#   ("tabla", id, titulo, cols, filas, anchos%)
#   ("fig", id, titulo)                 imagen docs/arquitectura/diagramas/<id>.png
#   ("codigo", texto)                   bloque en letra monoespaciada
#   ("salto",)                          salto de página
#   ("ficha", titulo, [(etiqueta, valor)])   ficha con espacios en blanco para llenar a mano
import datetime, importlib, os, re, sys, zipfile
from xml.sax.saxutils import escape
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.normpath(os.path.join(AQUI, '..', '..', '..'))
DIAGRAMAS = os.path.join(RAIZ, 'docs', 'arquitectura', 'diagramas')
sys.path.insert(0, AQUI)

DESTINOS = {
    'arquitectura': ('contenido_arquitectura', os.path.join(RAIZ, 'docs', 'arquitectura', 'Arquitectura-del-sistema.docx')),
    'anexo': ('contenido_anexo', os.path.join(RAIZ, 'datos-reales', 'Anexo-Registro-de-credenciales.docx')),
}
CLAVE = sys.argv[1] if len(sys.argv) > 1 else 'arquitectura'
K = importlib.import_module(DESTINOS[CLAVE][0])
SALIDA = DESTINOS[CLAVE][1]

AZUL, AZUL2, GRIS, BORDE = '1F3A5F', '2E5C8A', '595959', 'BFBFBF'
FONDO_TABLA, ZEBRA = '1F3A5F', 'F3F6FA'
CAJA_SIMPLE, BORDE_SIMPLE = 'E6F4EC', '2E7D5B'
CAJA_CONSEJO, BORDE_CONSEJO = 'EAF1FB', '2E5C8A'
CAJA_IMPORTANTE, BORDE_IMPORTANTE = 'FFF4D6', 'C58B00'
ANCHO = 9360  # ancho útil en veinteavos de punto (6,5 pulgadas)

listas_num, rels_img = [], []
_dib = [0]
fig_n, tab_n = {}, {}
for b in K.C:
    if b[0] == 'fig': fig_n[b[1]] = len(fig_n) + 1
    elif b[0] == 'tabla': tab_n[b[1]] = len(tab_n) + 1


def esc(s): return escape(s)


def refs(t):
    def f(m):
        d = fig_n if m.group(1) == 'fig' else tab_n
        return ('Figura ' if m.group(1) == 'fig' else 'Tabla ') + str(d[m.group(2)])
    return re.sub(r'\{(fig|tabla):([\w-]+)\}', f, t)


def run(t, b=False, i=False, color=None, size=None, mono=False, fondo=None):
    pr = ''
    if mono: pr += '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>'
    if b: pr += '<w:b/>'
    if i: pr += '<w:i/>'
    if color: pr += f'<w:color w:val="{color}"/>'
    if size: pr += f'<w:sz w:val="{size}"/><w:szCs w:val="{size}"/>'
    if fondo: pr += f'<w:shd w:val="clear" w:color="auto" w:fill="{fondo}"/>'
    pr = f'<w:rPr>{pr}</w:rPr>' if pr else ''
    return f'<w:r>{pr}<w:t xml:space="preserve">{esc(t)}</w:t></w:r>'


def rico(t, color=None, size=None, bold=False, italic=False):
    t = refs(t)
    out = ''
    for parte in re.split(r'(\*\*.+?\*\*|`.+?`|(?<!\*)\*(?!\*).+?(?<!\*)\*(?!\*))', t):
        if not parte: continue
        if parte.startswith('**') and parte.endswith('**') and len(parte) > 4: out += run(parte[2:-2], True, italic, color, size)
        elif parte.startswith('`') and parte.endswith('`') and len(parte) > 2:
            out += run(parte[1:-1], bold, italic, '7A2E2E', (size or 21) - 2, mono=True, fondo='F2F2F2')
        elif parte.startswith('*') and parte.endswith('*') and len(parte) > 2: out += run(parte[1:-1], bold, True, color, size)
        else: out += run(parte, bold, italic, color, size)
    return out


def para(t='', estilo=None, align=None, after=None, before=None, keep=False, num=None, size=None, color=None, bold=False, italic=False,
         runs=None, salto=False, shade=None, ind_left=None, borde_abajo=None, line=None, keep_lines=False):
    pp = ''
    if estilo: pp += f'<w:pStyle w:val="{estilo}"/>'
    if keep: pp += '<w:keepNext/>'
    if keep_lines: pp += '<w:keepLines/>'
    if salto: pp += '<w:pageBreakBefore/>'
    if num: pp += f'<w:numPr><w:ilvl w:val="0"/><w:numId w:val="{num}"/></w:numPr>'
    if borde_abajo: pp += f'<w:pBdr><w:bottom w:val="single" w:sz="{borde_abajo[1]}" w:space="4" w:color="{borde_abajo[0]}"/></w:pBdr>'
    if shade: pp += f'<w:shd w:val="clear" w:color="auto" w:fill="{shade}"/>'
    if before is not None or after is not None or line is not None:
        pp += '<w:spacing' + (f' w:before="{before}"' if before is not None else '') + (f' w:after="{after}"' if after is not None else '') + (f' w:line="{line}" w:lineRule="auto"' if line is not None else '') + '/>'
    if ind_left is not None: pp += f'<w:ind w:left="{ind_left}"/>'
    if align: pp += f'<w:jc w:val="{align}"/>'
    pp = f'<w:pPr>{pp}</w:pPr>' if pp else ''
    return f'<w:p>{pp}{runs if runs is not None else rico(t, color, size, bold, italic)}</w:p>'


def imagen(ident, ancho_in, alto_max_in=4.7):
    ruta = os.path.join(DIAGRAMAS, ident + '.png')
    w, h = Image.open(ruta).size
    # una figura alta se reduce para que quepa con su leyenda en una página
    ancho_in = min(ancho_in, alto_max_in * w / h)
    rid = f'rIdImg{len(rels_img) + 1}'; rels_img.append((rid, ruta, ident))
    _dib[0] += 1; n = _dib[0]
    cx = int(ancho_in * 914400); cy = int(cx * h / w)
    d = (f'<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="{cx}" cy="{cy}"/>'
         f'<wp:docPr id="{n}" name="Figura {n}" descr="{esc(ident)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>'
         f'<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="{n}" name="{ident}.png"/><pic:cNvPicPr/></pic:nvPicPr>'
         f'<pic:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
         f'<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>')
    return para(runs=f'<w:r>{d}</w:r>', align='center', after=60, before=120, keep=True)


def celda(contenido, ancho, shade=None, bold=False, color=None, bordes='', alto=None, span=None, keep=False):
    lineas = contenido.split('\n') if isinstance(contenido, str) else list(contenido)
    ps = ''.join(para(c, after=20, before=20, bold=bold, color=color, size=18, line=250, keep=keep) for c in lineas) if lineas != [''] else para('', after=20, before=20, size=18, keep=keep)
    tc = f'<w:tcW w:w="{ancho}" w:type="dxa"/>' + (f'<w:gridSpan w:val="{span}"/>' if span else '')
    tc += (f'<w:tcBorders>{bordes}</w:tcBorders>' if bordes else '') + (f'<w:shd w:val="clear" w:color="auto" w:fill="{shade}"/>' if shade else '')
    tc += '<w:tcMar><w:top w:w="30" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="30" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tcMar><w:vAlign w:val="center"/>'
    return f'<w:tc><w:tcPr>{tc}</w:tcPr>{ps}</w:tc>'


def borde_fino(color=BORDE):
    return ''.join(f'<w:{l} w:val="single" w:sz="4" w:space="0" w:color="{color}"/>' for l in ('top', 'left', 'bottom', 'right'))


def tabla(ident, titulo, cols, filas, anchos):
    anch = [round(ANCHO * a / 100) for a in anchos]; anch[-1] += ANCHO - sum(anch)
    grid = ''.join(f'<w:gridCol w:w="{a}"/>' for a in anch)
    x = f'<w:tbl><w:tblPr><w:tblW w:w="{ANCHO}" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>{grid}</w:tblGrid>'
    x += '<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>' + ''.join(celda(c, anch[j], shade=FONDO_TABLA, bold=True, color='FFFFFF', bordes=borde_fino(FONDO_TABLA), keep=True) for j, c in enumerate(cols)) + '</w:tr>'
    for i, f in enumerate(filas):
        sh = ZEBRA if i % 2 else None
        x += '<w:tr><w:trPr><w:cantSplit/></w:trPr>' + ''.join(celda(c, anch[j], shade=sh, bordes=borde_fino(), keep=(i == 0)) for j, c in enumerate(f)) + '</w:tr>'
    x += '</w:tbl>'
    return para(f'Tabla {tab_n[ident]}. {titulo}', bold=True, keep=True, after=60, before=200, color=AZUL, size=20) + x + para('', after=160)


def ficha(titulo, campos):
    """Dos columnas: etiqueta y valor (en blanco para llenar a mano). Una fila de encabezado a todo el ancho."""
    a1 = round(ANCHO * 0.30); a2 = ANCHO - a1
    x = f'<w:tbl><w:tblPr><w:tblW w:w="{ANCHO}" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="{a1}"/><w:gridCol w:w="{a2}"/></w:tblGrid>'
    x += '<w:tr><w:trPr><w:cantSplit/></w:trPr>' + celda(titulo, ANCHO, shade=FONDO_TABLA, bold=True, color='FFFFFF', bordes=borde_fino(FONDO_TABLA), span=2, keep=True) + '</w:tr>'
    for i, (etiqueta, valor) in enumerate(campos):
        mantener = i < len(campos) - 1  # toda la ficha en una sola página
        x += ('<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="440" w:hRule="atLeast"/></w:trPr>'
              + celda(etiqueta, a1, shade=ZEBRA, bold=True, bordes=borde_fino(), keep=mantener) + celda(valor, a2, bordes=borde_fino(), keep=mantener) + '</w:tr>')
    x += '</w:tbl>'
    return para('', after=40, keep=True) + x + para('', after=200)


def caja(titulo, texto, fondo, borde, color):
    p = para(runs=run(titulo + '. ', b=True, color=color, size=21) + rico(texto, size=21), after=40, before=40, line=264)
    tc = (f'<w:tc><w:tcPr><w:tcW w:w="{ANCHO}" w:type="dxa"/><w:tcBorders><w:left w:val="single" w:sz="30" w:space="0" w:color="{borde}"/></w:tcBorders>'
          f'<w:shd w:val="clear" w:color="auto" w:fill="{fondo}"/><w:tcMar><w:top w:w="80" w:type="dxa"/><w:left w:w="180" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="140" w:type="dxa"/></w:tcMar></w:tcPr>{p}</w:tc>')
    return (f'<w:tbl><w:tblPr><w:tblW w:w="{ANCHO}" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="{ANCHO}"/></w:tblGrid>'
            f'<w:tr><w:trPr><w:cantSplit/></w:trPr>{tc}</w:tr></w:tbl>' + para('', after=140))


def codigo(texto):
    ps = ''.join(para(runs=run(l if l else ' ', mono=True, size=18, color='222222'), after=0, before=0, shade='F2F2F2', line=240, ind_left=120) for l in texto.split('\n'))
    return ps + para('', after=140)


def campo(instr, relleno='1'):
    return (f'<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> {instr} </w:instrText></w:r>'
            f'<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>{esc(relleno)}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>')


def portada():
    c = []
    c.append(para('', before=1400, after=0))
    c.append(para(K.ETIQUETA, size=22, color=AZUL2, bold=True, after=120, borde_abajo=(AZUL2, 12)))
    c.append(para(K.TITULO, estilo='Title', before=240, after=160))
    c.append(para(K.SUBTITULO, size=28, color=GRIS, after=900, line=300))
    for t, b in [(K.AUTOR, True), (K.EDICION, False), (K.VERSION, False), (K.FECHA, False)]:
        c.append(para(t, bold=b, after=80, size=23, color=AZUL if b else GRIS))
    c.append(para('', after=1400))
    c.append(caja('Nota de confidencialidad', K.NOTA_PORTADA, CAJA_IMPORTANTE, BORDE_IMPORTANTE, BORDE_IMPORTANTE))
    return ''.join(c)


def construir():
    cuerpo = [portada()]
    if getattr(K, 'CON_INDICE', True):
        cuerpo.append(para('Contenido', estilo='TOCTitulo', salto=True))
        cuerpo.append(para(runs=campo('TOC \\o "1-2" \\h \\z \\u', 'Para ver el índice, pulsa Ctrl + A y luego F9 (o clic derecho y "Actualizar campo").')))
    n1 = n2 = 0
    for b in K.C:
        t = b[0]
        if t == 'h1':
            n1 += 1; n2 = 0
            cuerpo.append(para(f'{n1}. {b[1]}', estilo='Heading1', salto=(n1 == 1), before=(0 if n1 == 1 else 520)))
        elif t == 'h2':
            n2 += 1
            cuerpo.append(para(f'{n1}.{n2} {b[1]}', estilo='Heading2', keep=True))
        elif t == 'h3': cuerpo.append(para(b[1], estilo='Heading3', keep=True))
        elif t == 'p': cuerpo.append(para(b[1], after=120))
        elif t == 'simple': cuerpo.append(caja('En palabras simples', b[1], CAJA_SIMPLE, BORDE_SIMPLE, BORDE_SIMPLE))
        elif t == 'aviso':
            imp = b[1] == 'Importante'
            cuerpo.append(caja(b[1], b[2], CAJA_IMPORTANTE if imp else CAJA_CONSEJO, BORDE_IMPORTANTE if imp else BORDE_CONSEJO, BORDE_IMPORTANTE if imp else BORDE_CONSEJO))
        elif t == 'ul':
            for i in b[1]: cuerpo.append(para(i, num=1, after=50))
            cuerpo.append(para('', after=80))
        elif t == 'ol':
            nid = 10 + len(listas_num); listas_num.append(nid)
            for i in b[1]: cuerpo.append(para(i, num=nid, after=50))
            cuerpo.append(para('', after=80))
        elif t == 'tabla': cuerpo.append(tabla(*b[1:]))
        elif t == 'ficha': cuerpo.append(ficha(b[1], b[2]))
        elif t == 'codigo': cuerpo.append(codigo(b[1]))
        elif t == 'salto': cuerpo.append(para('', salto=True, after=0))
        elif t == 'fig':
            cuerpo.append(imagen(b[1], 6.5))
            cuerpo.append(para(runs=run(f'Figura {fig_n[b[1]]}. ', b=True, size=19, color=AZUL) + rico(b[2], size=19, color=GRIS, italic=True), align='center', after=200))
        else: raise ValueError('bloque desconocido: ' + t)
    return ''.join(cuerpo)


NS = ('xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
      'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
      'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"')


def main():
    cuerpo = construir()
    sect = ('<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:footerReference w:type="first" r:id="rIdFooterPrimera"/>'
            '<w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1300" w:right="1440" w:bottom="1300" w:left="1440" w:header="720" w:footer="560" w:gutter="0"/><w:titlePg/></w:sectPr>')
    documento = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document {NS}><w:body>{cuerpo}{sect}</w:body></w:document>'
    estilos = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="es-CO"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="160" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:b/><w:color w:val="{AZUL}"/><w:sz w:val="68"/><w:szCs w:val="68"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="4" w:color="{AZUL2}"/></w:pBdr><w:spacing w:before="0" w:after="240"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="{AZUL}"/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="{AZUL2}"/><w:sz w:val="27"/><w:szCs w:val="27"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="60"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:color w:val="{AZUL}"/><w:sz w:val="23"/><w:szCs w:val="23"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TOCTitulo"><w:name w:val="TOC Heading"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="4" w:color="{AZUL2}"/></w:pBdr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:color w:val="{AZUL}"/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9350"/></w:tabs><w:spacing w:before="100" w:after="30"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TOC2"><w:name w:val="toc 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9350"/></w:tabs><w:spacing w:after="20"/><w:ind w:left="300"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="6" w:color="{BORDE}"/></w:pBdr><w:tabs><w:tab w:val="right" w:pos="9360"/></w:tabs></w:pPr><w:rPr><w:color w:val="{GRIS}"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="{AZUL2}"/></w:rPr></w:style>
</w:styles>'''
    nivel = lambda fmt, txt, fuente=None: (f'<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="{fmt}"/><w:lvlText w:val="{txt}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="540" w:hanging="300"/></w:pPr>'
                                           + (f'<w:rPr><w:rFonts w:ascii="{fuente}" w:hAnsi="{fuente}" w:hint="default"/><w:color w:val="{AZUL2}"/></w:rPr>' if fuente else '') + '</w:lvl>')
    numeracion = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                  f'<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>{nivel("bullet", "•", "Arial")}</w:abstractNum>'
                  f'<w:abstractNum w:abstractNumId="2"><w:multiLevelType w:val="hybridMultilevel"/>{nivel("decimal", "%1.")}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>')
    for nid in listas_num:
        numeracion += f'<w:num w:numId="{nid}"><w:abstractNumId w:val="2"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>'
    numeracion += '</w:numbering>'
    pie = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr {NS}>'
           + para(runs=run(K.PIE) + '<w:r><w:tab/></w:r>' + run('Página ') + campo('PAGE'), estilo='Footer') + '</w:ftr>')
    pie_primera = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr {NS}>' + para('', after=0) + '</w:ftr>'
    ajustes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:updateFields w:val="true"/></w:settings>'
    rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            '<Relationship Id="rIdNum" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>'
            '<Relationship Id="rIdSet" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>'
            '<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>'
            '<Relationship Id="rIdFooterPrimera" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer2.xml"/>')
    for rid, ruta, ident in rels_img:
        rels += f'<Relationship Id="{rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/{ident}.png"/>'
    rels += '</Relationships>'
    tipos = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
             '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>'
             '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
             '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
             '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>'
             '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>'
             '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'
             '<Override PartName="/word/footer2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'
             '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>')
    raiz = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
            '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>')
    ahora = datetime.datetime(2026, 11, 18, 12, 0, 0).strftime('%Y-%m-%dT%H:%M:%SZ')
    core = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" '
            'xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
            f'<dc:title>{esc(K.TITULO)}</dc:title><dc:creator>{esc(K.AUTOR)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">{ahora}</dcterms:created></cp:coreProperties>')
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with zipfile.ZipFile(SALIDA, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', tipos); z.writestr('_rels/.rels', raiz); z.writestr('docProps/core.xml', core)
        z.writestr('word/document.xml', documento); z.writestr('word/styles.xml', estilos); z.writestr('word/numbering.xml', numeracion)
        z.writestr('word/settings.xml', ajustes); z.writestr('word/footer1.xml', pie); z.writestr('word/footer2.xml', pie_primera); z.writestr('word/_rels/document.xml.rels', rels)
        for rid, ruta, ident in rels_img: z.write(ruta, f'word/media/{ident}.png')
    print('listo', SALIDA, os.path.getsize(SALIDA) // 1024, 'KB')


if __name__ == '__main__':
    main()
