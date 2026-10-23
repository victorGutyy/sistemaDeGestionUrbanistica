# -*- coding: utf-8 -*-
# Arma docs/manual/Manual-de-usuario.docx (versión editable del manual, formato APA 7) a mano (zip + XML), sin librerías.
#   python docs/manual/herramientas/render_docx.py
import json, os, re, sys, zipfile, datetime
from xml.sax.saxutils import escape

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.normpath(os.path.join(AQUI, '..', '..', '..'))
CAPTURAS = os.path.join(RAIZ, 'docs', 'manual', 'capturas')
SALIDA = os.path.join(RAIZ, 'docs', 'manual', 'Manual-de-usuario.docx')
sys.path.insert(0, AQUI)
import contenido as K  # noqa: E402
from imagenes import preparar_imagenes  # noqa: E402

MANIFIESTO = json.load(open(os.path.join(CAPTURAS, 'manifiesto.json'), encoding='utf-8'))
IMGS = preparar_imagenes(MANIFIESTO, CAPTURAS)

AZUL, GRIS, BORDE, CAJA, AVISO = '1F3A5F', '595959', 'BFBFBF', 'EAF1FB', 'FFF4D6'
ANCHO = 9360
listas_num = []  # numId de cada lista numerada
rels_img = []
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


def run(t, b=False, i=False, color=None, size=None):
    pr = ('<w:b/>' if b else '') + ('<w:i/>' if i else '') + (f'<w:color w:val="{color}"/>' if color else '') + (f'<w:sz w:val="{size}"/><w:szCs w:val="{size}"/>' if size else '')
    pr = f'<w:rPr>{pr}</w:rPr>' if pr else ''
    return f'<w:r>{pr}<w:t xml:space="preserve">{esc(t)}</w:t></w:r>'


def rico(t, color=None, size=None, bold=False, italic=False):
    t = refs(t)
    out = ''
    for parte in re.split(r'(\*\*.+?\*\*|(?<!\*)\*(?!\*).+?(?<!\*)\*(?!\*))', t):
        if not parte: continue
        if parte.startswith('**') and parte.endswith('**'): out += run(parte[2:-2], True, italic, color, size)
        elif parte.startswith('*') and parte.endswith('*') and len(parte) > 2: out += run(parte[1:-1], bold, True, color, size)
        else: out += run(parte, bold, italic, color, size)
    return out


def para(t='', estilo=None, align=None, after=None, before=None, keep=False, num=None, indent_first=False, size=None, color=None, bold=False, italic=False,
         runs=None, salto=False, hang=False, shade=None):
    pp = ''
    if estilo: pp += f'<w:pStyle w:val="{estilo}"/>'
    if keep: pp += '<w:keepNext/>'
    if salto: pp += '<w:pageBreakBefore/>'
    if num: pp += f'<w:numPr><w:ilvl w:val="0"/><w:numId w:val="{num}"/></w:numPr>'
    if shade: pp += f'<w:shd w:val="clear" w:color="auto" w:fill="{shade}"/>'
    if before is not None or after is not None:
        pp += '<w:spacing' + (f' w:before="{before}"' if before is not None else '') + (f' w:after="{after}"' if after is not None else '') + '/>'
    if indent_first: pp += '<w:ind w:firstLine="720"/>'
    if hang: pp += '<w:ind w:left="720" w:hanging="720"/>'
    if align: pp += f'<w:jc w:val="{align}"/>'
    pp = f'<w:pPr>{pp}</w:pPr>' if pp else ''
    return f'<w:p>{pp}{runs if runs is not None else rico(t, color, size, bold, italic)}</w:p>'


def imagen(ident, ancho_in):
    ruta, w, h = IMGS[ident]
    rid = f'rIdImg{len(rels_img) + 1}'; rels_img.append((rid, ruta, ident))
    _dib[0] += 1; n = _dib[0]
    cx = int(ancho_in * 914400); cy = int(cx * h / w)
    d = (f'<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="{cx}" cy="{cy}"/>'
         f'<wp:docPr id="{n}" name="Figura {n}" descr="{esc(MANIFIESTO[ident]["titulo"])}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>'
         f'<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="{n}" name="{ident}.jpg"/><pic:cNvPicPr/></pic:nvPicPr>'
         f'<pic:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
         f'<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>')
    return para(runs=f'<w:r>{d}</w:r>', align='center', after=60, keep=True)


def celda(contenido, ancho, shade=None, bold=False, bordes=''):
    if isinstance(contenido, str): contenido = [contenido]
    ps = ''.join(para(c, after=40, before=40, bold=bold, size=19) for c in contenido)
    tc = f'<w:tcW w:w="{ancho}" w:type="dxa"/>' + (f'<w:tcBorders>{bordes}</w:tcBorders>' if bordes else '') + (f'<w:shd w:val="clear" w:color="auto" w:fill="{shade}"/>' if shade else '')
    tc += '<w:tcMar><w:left w:w="90" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tcMar>'
    return f'<w:tc><w:tcPr>{tc}</w:tcPr>{ps}</w:tc>'


def tabla_apa(ident, titulo, cols, filas, anchos, nota):
    anch = [round(ANCHO * a / 100) for a in anchos]; anch[-1] += ANCHO - sum(anch)
    top = '<w:top w:val="single" w:sz="8" w:space="0" w:color="000000"/>'
    bajo = '<w:bottom w:val="single" w:sz="6" w:space="0" w:color="000000"/>'
    grid = ''.join(f'<w:gridCol w:w="{a}"/>' for a in anch)
    x = f'<w:tbl><w:tblPr><w:tblW w:w="{ANCHO}" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>{grid}</w:tblGrid>'
    x += '<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>' + ''.join(celda(c, anch[j], bold=True, bordes=top + bajo) for j, c in enumerate(cols)) + '</w:tr>'
    for i, f in enumerate(filas):
        b = bajo.replace('w:sz="6"', 'w:sz="8"') if i == len(filas) - 1 else ''
        x += '<w:tr><w:trPr><w:cantSplit/></w:trPr>' + ''.join(celda(c, anch[j], bordes=b) for j, c in enumerate(f)) + '</w:tr>'
    x += '</w:tbl>'
    out = para(f'Tabla {tab_n[ident]}', bold=True, keep=True, after=0, before=120) + para(titulo, italic=True, keep=True, after=60) + x
    if nota:
        out += para((nota[6:] if nota.startswith('Nota. ') else nota), size=19, color=GRIS, before=60, after=200, runs=(run('Nota. ', i=True, size=19, color=GRIS) + rico(nota[6:], color=GRIS, size=19)) if nota.startswith('Nota. ') else None)
    else:
        out += para('', after=120)
    return out


def aviso(titulo, texto):
    color = 'C58B00' if titulo == 'Importante' else AZUL
    fondo = AVISO if titulo == 'Importante' else CAJA
    p = para(runs=run(titulo + '. ', b=True, color=color, size=21) + rico(texto, size=21), after=40, before=40)
    tc = (f'<w:tc><w:tcPr><w:tcW w:w="{ANCHO}" w:type="dxa"/><w:tcBorders><w:left w:val="single" w:sz="30" w:space="0" w:color="{color}"/></w:tcBorders>'
          f'<w:shd w:val="clear" w:color="auto" w:fill="{fondo}"/><w:tcMar><w:top w:w="80" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar></w:tcPr>{p}</w:tc>')
    return (f'<w:tbl><w:tblPr><w:tblW w:w="{ANCHO}" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="{ANCHO}"/></w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>{tc}</w:tr></w:tbl>'
            + para('', after=120))


def campo(instr, relleno='1'):
    return (f'<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> {instr} </w:instrText></w:r>'
            f'<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>{esc(relleno)}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>')


def construir():
    cuerpo = []
    # portada
    cuerpo.append(para('', before=1800, after=0))
    cuerpo.append(para(K.TITULO, estilo='Title'))
    cuerpo.append(para(K.SUBTITULO, align='center', before=200, after=1400))
    for t, b in [(K.AUTOR, True), (K.EDICION, False), (K.VERSION, False), (K.FECHA, False)]:
        cuerpo.append(para(t, align='center', bold=b, after=160))
    cuerpo.append(para('Tabla de contenido', estilo='Heading1', salto=True))
    cuerpo.append(para(runs=campo('TOC \\o "1-2" \\h \\z \\u', 'Para ver la tabla de contenido, pulsa Ctrl + A y luego F9 (o clic derecho y “Actualizar campo”).'), indent_first=False))
    cap_n = apend = 0
    letras = 'ABCDEFGHIJ'
    for b in K.C:
        t = b[0]
        if t in ('presentacion', 'cap', 'apendice'):
            if t == 'presentacion': cuerpo.append(para(b[1], estilo='Heading1', salto=True))
            elif t == 'cap':
                cap_n += 1
                cuerpo.append(para(f'Capítulo {cap_n}. {b[1]}', estilo='Heading1', salto=True))
            else:
                cuerpo.append(para(f'Apéndice {letras[apend]}. {b[1]}', estilo='Heading1', salto=True)); apend += 1
        elif t == 'h2': cuerpo.append(para(b[1], estilo='Heading2', keep=True))
        elif t == 'h3': cuerpo.append(para(b[1], estilo='Heading3', keep=True))
        elif t == 'p': cuerpo.append(para(b[1], indent_first=True))
        elif t == 'ul':
            for i in b[1]: cuerpo.append(para(i, num=1, after=60))
        elif t == 'ol':
            nid = 10 + len(listas_num); listas_num.append(nid)
            for i in b[1]: cuerpo.append(para(i, num=nid, after=60))
        elif t == 'fig':
            m = MANIFIESTO[b[1]]; ruta, w, h = IMGS[b[1]]
            ancho = 6.5 if w >= 1000 else (2.6 if w < 900 else 5.2)
            if ancho * h / w > 6.7: ancho = ancho * 6.7 / (ancho * h / w)
            cuerpo.append(para(f'Figura {fig_n[b[1]]}', bold=True, keep=True, after=0, before=120))
            cuerpo.append(para(m['titulo'], italic=True, keep=True, after=60))
            cuerpo.append(imagen(b[1], ancho))
            for it in m.get('leyenda', []):
                cuerpo.append(para(runs=run(f'{it["n"]}. ', b=True, size=19) + rico(it['texto'], size=19), after=20))
            nota = m.get('nota') or 'Captura de pantalla del sistema con datos de demostración.'
            cuerpo.append(para(runs=run('Nota. ', i=True, size=19, color=GRIS) + run(nota + ' Elaboración propia.', size=19, color=GRIS), before=60, after=200))
        elif t == 'tabla': cuerpo.append(tabla_apa(*b[1:]))
        elif t == 'aviso': cuerpo.append(aviso(b[1], b[2]))
        elif t == 'referencias':
            cuerpo.append(para('Referencias', estilo='Heading1', salto=True))
            for r in sorted(b[1], key=lambda x: x.lower()): cuerpo.append(para(r, hang=True, after=120))
    return ''.join(cuerpo)


NS = ('xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
      'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
      'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"')


def main():
    cuerpo = construir()
    sect = ('<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:pgSz w:w="12240" w:h="15840"/>'
            '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>')
    documento = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document {NS}><w:body>{cuerpo}{sect}</w:body></w:document>'
    estilos = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="es-CO"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="center"/><w:spacing w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:jc w:val="center"/><w:spacing w:before="0" w:after="240"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="60"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="40"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:i/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Header"><w:name w:val="header"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="right"/></w:pPr><w:rPr><w:color w:val="{GRIS}"/><w:sz w:val="20"/></w:rPr></w:style>
</w:styles>'''
    nivel = lambda fmt, txt, fuente=None: (f'<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="{fmt}"/><w:lvlText w:val="{txt}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>'
                                           + (f'<w:rPr><w:rFonts w:ascii="{fuente}" w:hAnsi="{fuente}" w:hint="default"/></w:rPr>' if fuente else '') + '</w:lvl>')
    numeracion = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                  f'<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>{nivel("bullet", "•", "Arial")}</w:abstractNum>'
                  f'<w:abstractNum w:abstractNumId="2"><w:multiLevelType w:val="hybridMultilevel"/>{nivel("decimal", "%1.")}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>')
    for nid in listas_num:
        numeracion += f'<w:num w:numId="{nid}"><w:abstractNumId w:val="2"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>'
    numeracion += '</w:numbering>'
    cabecera = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr {NS}>' + para(runs=campo('PAGE'), estilo='Header') + '</w:hdr>'
    ajustes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:updateFields w:val="true"/></w:settings>'
    rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            '<Relationship Id="rIdNum" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>'
            '<Relationship Id="rIdSet" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>'
            '<Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>')
    for rid, ruta, ident in rels_img:
        rels += f'<Relationship Id="{rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/{ident}.jpg"/>'
    rels += '</Relationships>'
    tipos = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
             '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/>'
             '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
             '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
             '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>'
             '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>'
             '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>'
             '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>')
    raiz = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
            '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>')
    ahora = datetime.datetime(2026, 10, 23, 12, 0, 0).strftime('%Y-%m-%dT%H:%M:%SZ')
    core = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" '
            'xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
            f'<dc:title>{esc(K.TITULO)}</dc:title><dc:creator>{esc(K.AUTOR)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">{ahora}</dcterms:created></cp:coreProperties>')
    with zipfile.ZipFile(SALIDA, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', tipos); z.writestr('_rels/.rels', raiz); z.writestr('docProps/core.xml', core)
        z.writestr('word/document.xml', documento); z.writestr('word/styles.xml', estilos); z.writestr('word/numbering.xml', numeracion)
        z.writestr('word/settings.xml', ajustes); z.writestr('word/header1.xml', cabecera); z.writestr('word/_rels/document.xml.rels', rels)
        for rid, ruta, ident in rels_img: z.write(ruta, f'word/media/{ident}.jpg')
    print('listo', SALIDA, os.path.getsize(SALIDA) // 1024, 'KB')


if __name__ == '__main__':
    main()
