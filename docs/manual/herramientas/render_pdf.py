# -*- coding: utf-8 -*-
# Arma docs/manual/Manual-de-usuario.pdf (formato APA 7) con reportlab, a partir de contenido.py y las capturas.
#   python docs/manual/herramientas/render_pdf.py
import json, os, re, sys, tempfile
from xml.sax.saxutils import escape
from PIL import Image
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, PageBreak, Image as RLImage,
                                KeepTogether, Table, TableStyle, ListFlowable, ListItem, Flowable, CondPageBreak)
from reportlab.platypus.tableofcontents import TableOfContents

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.normpath(os.path.join(AQUI, '..', '..', '..'))
CAPTURAS = os.path.join(RAIZ, 'docs', 'manual', 'capturas')
SALIDA = os.path.join(RAIZ, 'docs', 'manual', 'Manual-de-usuario.pdf')
sys.path.insert(0, AQUI)
import contenido as K  # noqa: E402
from imagenes import preparar_imagenes  # noqa: E402

for nombre, archivo in [('Arial', 'arial.ttf'), ('Arial-Bold', 'arialbd.ttf'), ('Arial-Italic', 'ariali.ttf'), ('Arial-BoldItalic', 'arialbi.ttf')]:
    pdfmetrics.registerFont(TTFont(nombre, os.path.join('C:/Windows/Fonts', archivo)))
pdfmetrics.registerFontFamily('Arial', normal='Arial', bold='Arial-Bold', italic='Arial-Italic', boldItalic='Arial-BoldItalic')

AZUL = colors.HexColor('#1F3A5F')
GRIS = colors.HexColor('#595959')
LINEA = colors.HexColor('#BFBFBF')
CAJA = colors.HexColor('#EAF1FB')
AVISO = colors.HexColor('#FFF4D6')

MANIFIESTO = json.load(open(os.path.join(CAPTURAS, 'manifiesto.json'), encoding='utf-8'))
IMGS = preparar_imagenes(MANIFIESTO, CAPTURAS)

# ------------------------------------------------------------------ estilos (APA 7: Arial 11, interlineado 1,5)
BASE = dict(fontName='Arial', fontSize=11, leading=16.5, textColor=colors.black)


def E(nombre, **kw):
    return ParagraphStyle(nombre, **{**BASE, **kw})

S = {
    'p': E('p', firstLineIndent=0.5 * inch, spaceAfter=0, alignment=TA_LEFT),
    'psin': E('psin', spaceAfter=0),
    'li': E('li', spaceAfter=2),
    'cap': E('cap', fontName='Arial-Bold', fontSize=12, leading=18, alignment=TA_CENTER, spaceAfter=6),
    'cap2': E('cap2', fontName='Arial-Bold', fontSize=14, leading=20, alignment=TA_CENTER, spaceAfter=14),
    'h2': E('h2', fontName='Arial-Bold', fontSize=12, leading=18, spaceBefore=10, spaceAfter=2, keepWithNext=1),
    'h3': E('h3', fontName='Arial-BoldItalic', fontSize=11, leading=16.5, spaceBefore=8, spaceAfter=2, keepWithNext=1),
    'figt': E('figt', fontName='Arial-Bold', spaceBefore=10, spaceAfter=0, keepWithNext=1, leading=15),
    'figtt': E('figtt', fontName='Arial-Italic', spaceAfter=4, keepWithNext=1, leading=15),
    'leyenda': E('leyenda', fontSize=9.5, leading=13, leftIndent=14, firstLineIndent=-14, spaceAfter=1),
    'nota': E('nota', fontSize=9.5, leading=13, spaceBefore=4, spaceAfter=12, textColor=GRIS),
    'celda': E('celda', fontSize=9.5, leading=12.5),
    'celdab': E('celdab', fontSize=9.5, leading=12.5, fontName='Arial-Bold'),
    'ref': E('ref', leftIndent=0.5 * inch, firstLineIndent=-0.5 * inch, spaceAfter=6),
    'aviso': E('aviso', fontSize=10.5, leading=15),
    'toc0': E('toc0', fontName='Arial-Bold', leading=18, leftIndent=0, spaceBefore=4),
    'toc1': E('toc1', fontSize=10, leading=14, leftIndent=18),
    'portada_t': E('portada_t', fontName='Arial-Bold', fontSize=18, leading=26, alignment=TA_CENTER),
    'portada': E('portada', alignment=TA_CENTER, leading=18),
}


def md(t):
    t = escape(t)
    t = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', t)
    t = re.sub(r'(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)', r'<i>\1</i>', t)
    return t


# ------------------------------------------------------------------ numeración de figuras y tablas
fig_n, tab_n, n = {}, {}, 0
for b in K.C:
    if b[0] == 'fig':
        fig_n[b[1]] = len(fig_n) + 1
    elif b[0] == 'tabla':
        tab_n[b[1]] = len(tab_n) + 1


def refs(t):
    def f(m):
        tipo, ident = m.group(1), m.group(2)
        d = fig_n if tipo == 'fig' else tab_n
        if ident not in d:
            print('  (!) referencia sin destino:', tipo, ident); return '??'
        return ('Figura ' if tipo == 'fig' else 'Tabla ') + str(d[ident])
    return re.sub(r'\{(fig|tabla):([\w-]+)\}', f, t)


def txt(t): return md(refs(t))


# ------------------------------------------------------------------ documento
class Doc(BaseDocTemplate):
    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        marco = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id='f', leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        self.addPageTemplates([PageTemplate(id='p', frames=[marco], onPage=self.encabezado)])
        self.cap_n = 0

    def encabezado(self, canv, doc):
        canv.saveState(); canv.setFont('Arial', 10); canv.setFillColor(GRIS)
        canv.drawRightString(letter[0] - inch, letter[1] - 0.6 * inch, str(doc.page))
        canv.restoreState()

    def afterFlowable(self, fl):
        nivel = getattr(fl, '_toc', None)
        marca = getattr(fl, '_marca', None)
        if nivel is not None:
            texto, clave = fl._toc_texto, fl._toc_clave
            self.notify('TOCEntry', (nivel, texto, self.page, clave))
            self.canv.bookmarkPage(clave); self.canv.addOutlineEntry(texto, clave, level=0, closed=True)
        elif marca is not None:
            texto, clave = fl._toc_texto, fl._toc_clave
            self.canv.bookmarkPage(clave); self.canv.addOutlineEntry(texto, clave, level=1, closed=True)


def titulo(par, nivel, texto, clave):
    if nivel == 0:
        par._toc = nivel
    else:
        par._marca = nivel
    par._toc_texto = texto; par._toc_clave = clave
    return par


def aviso_caja(titulo_, texto):
    color = colors.HexColor('#C58B00') if titulo_ == 'Importante' else AZUL
    fondo = AVISO if titulo_ == 'Importante' else CAJA
    contenido = [Paragraph(f'<b>{titulo_}.</b> {txt(texto)}', S['aviso'])]
    t = Table([[contenido]], colWidths=[6.5 * inch])
    t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), fondo), ('LINEBEFORE', (0, 0), (0, -1), 3, color),
                           ('LEFTPADDING', (0, 0), (-1, -1), 10), ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                           ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 7)]))
    return [Spacer(1, 6), t, Spacer(1, 10)]


def figura(ident):
    m = MANIFIESTO[ident]
    ruta, w, h = IMGS[ident]
    ancho = min(6.5 * inch, w * 0.5 * inch / 96 * 1.0) if False else None
    maxw = 6.5 * inch
    # las capturas de celular son angostas: se muestran más pequeñas
    ancho_pt = maxw if w >= 1000 else (2.6 * inch if w < 900 else 5.2 * inch)
    alto_pt = ancho_pt * h / w
    tope = 6.2 * inch
    if alto_pt > tope:
        ancho_pt = ancho_pt * tope / alto_pt; alto_pt = tope
    partes = [Paragraph(f'Figura {fig_n[ident]}', S['figt']), Paragraph(m['titulo'], S['figtt'])]
    img = RLImage(ruta, width=ancho_pt, height=alto_pt); img.hAlign = 'CENTER'
    partes.append(img)
    if m.get('leyenda'):
        partes.append(Spacer(1, 5))
        for it in m['leyenda']:
            partes.append(Paragraph(f'<b>{it["n"]}.</b> {md(it["texto"])}', S['leyenda']))
    nota = m.get('nota') or 'Captura de pantalla del sistema con datos de demostración.'
    partes.append(Paragraph(f'<i>Nota.</i> {escape(nota)} Elaboración propia.', S['nota']))
    return [KeepTogether(partes)]


def tabla_apa(ident, titulo_, cols, filas, anchos, nota):
    total = 6.5 * inch
    cw = [total * a / 100 for a in anchos]
    datos = [[Paragraph(md(c), S['celdab']) for c in cols]] + [[Paragraph(txt(c), S['celda']) for c in f] for f in filas]
    t = Table(datos, colWidths=cw, repeatRows=1)
    t.setStyle(TableStyle([('LINEABOVE', (0, 0), (-1, 0), 1, colors.black), ('LINEBELOW', (0, 0), (-1, 0), 0.75, colors.black),
                           ('LINEBELOW', (0, -1), (-1, -1), 1, colors.black), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                           ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                           ('LEFTPADDING', (0, 0), (-1, -1), 4), ('RIGHTPADDING', (0, 0), (-1, -1), 4)]))
    cab = [Paragraph(f'Tabla {tab_n[ident]}', S['figt']), Paragraph(escape(titulo_), S['figtt'])]
    pie = [Paragraph((f'<i>Nota.</i> {md(nota[6:])}' if nota and nota.startswith('Nota. ') else (md(nota) if nota else '')), S['nota'])] if nota else [Spacer(1, 10)]
    if len(filas) <= 12:
        return [KeepTogether(cab + [t] + pie)]
    return cab + [t] + pie


def lista(items, ordenada):
    elems = [ListItem(Paragraph(txt(i), S['li']), leftIndent=22) for i in items]
    if ordenada:
        return [ListFlowable(elems, bulletType='1', bulletFormat='%s.', bulletFontName='Arial', bulletFontSize=11, leftIndent=22, bulletDedent=16, spaceAfter=6)]
    return [ListFlowable(elems, bulletType='bullet', start='•', bulletFontName='Arial', bulletFontSize=11, leftIndent=22, bulletDedent=14, spaceAfter=6)]


def portada():
    f = [Spacer(1, 1.6 * inch), Paragraph(escape(K.TITULO), S['portada_t']), Spacer(1, 14),
         Paragraph(escape(K.SUBTITULO), S['portada']), Spacer(1, 1.1 * inch),
         Paragraph(f'<b>{escape(K.AUTOR)}</b>', S['portada']), Spacer(1, 10),
         Paragraph(escape(K.EDICION), S['portada']), Spacer(1, 10),
         Paragraph(escape(K.VERSION), S['portada']), Spacer(1, 10),
         Paragraph(escape(K.FECHA), S['portada']), PageBreak()]
    return f


def construir():
    historia = portada()
    historia.append(Paragraph('Tabla de contenido', S['cap2']))
    toc = TableOfContents(); toc.levelStyles = [S['toc0']]; toc.dotsMinLevel = 0
    historia += [toc, PageBreak()]
    cap_n = 0; apend = 0; clave_n = 0
    letras = 'ABCDEFGHIJ'
    for b in K.C:
        tipo = b[0]
        if tipo in ('presentacion', 'cap', 'apendice'):
            clave_n += 1
            if tipo == 'presentacion':
                rotulo, tx = None, b[1]
            elif tipo == 'cap':
                cap_n += 1; rotulo, tx = f'Capítulo {cap_n}', b[1]
            else:
                rotulo, tx = f'Apéndice {letras[apend]}', b[1]; apend += 1
            if historia and not isinstance(historia[-1], PageBreak) and clave_n > 1:
                historia.append(PageBreak())
            if rotulo:
                historia.append(Paragraph(rotulo, S['cap']))
            par = titulo(Paragraph(escape(tx), S['cap2']), 0, (f'{rotulo}. {tx}' if rotulo else tx), f'k{clave_n}')
            historia.append(par)
        elif tipo == 'h2':
            clave_n += 1
            historia.append(CondPageBreak(1.9 * inch))
            historia.append(titulo(Paragraph(escape(b[1]), S['h2']), 1, b[1], f'k{clave_n}'))
        elif tipo == 'h3':
            historia.append(CondPageBreak(1.7 * inch))
            historia.append(Paragraph(escape(b[1]), S['h3']))
        elif tipo == 'p':
            historia.append(Paragraph(txt(b[1]), S['p']))
        elif tipo == 'ul':
            historia += lista(b[1], False)
        elif tipo == 'ol':
            historia += lista(b[1], True)
        elif tipo == 'fig':
            historia += figura(b[1])
        elif tipo == 'tabla':
            historia += tabla_apa(*b[1:])
        elif tipo == 'aviso':
            historia += aviso_caja(b[1], b[2])
        elif tipo == 'referencias':
            historia.append(PageBreak())
            par = titulo(Paragraph('Referencias', S['cap2']), 0, 'Referencias', 'kref')
            historia.append(par)
            for r in sorted(b[1], key=lambda x: x.lower()):
                historia.append(Paragraph(md(r), S['ref']))
    return historia


def main():
    doc = Doc(SALIDA, pagesize=letter, leftMargin=inch, rightMargin=inch, topMargin=inch, bottomMargin=inch,
              title=K.TITULO, author=K.AUTOR, subject=K.SUBTITULO)
    doc.multiBuild(construir())
    print('listo', SALIDA, os.path.getsize(SALIDA) // 1024, 'KB')


if __name__ == '__main__':
    main()
