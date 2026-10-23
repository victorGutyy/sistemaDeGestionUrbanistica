# -*- coding: utf-8 -*-
# Prepara las capturas para el manual: recorta el blanco sobrante de abajo, agrega un borde fino y las comprime.
# Las versiones preparadas se guardan en una carpeta temporal (no en el repositorio).
import os, tempfile
from PIL import Image, ImageDraw

DESTINO = os.path.join(tempfile.gettempdir(), 'manual-imagenes')
MAX_ANCHO = 1500


def _fondo(im):
    w, h = im.size
    return im.getpixel((min(6, w - 1), h - 4))


def _recortar_abajo(im, margen=28, tolerancia=8):
    w, h = im.size
    bg = _fondo(im)
    px = im.load()
    paso = max(1, w // 400)
    ultimo = 0
    for y in range(h - 1, -1, -1):
        fila_vacia = True
        for x in range(0, w, paso):
            p = px[x, y]
            if max(abs(p[0] - bg[0]), abs(p[1] - bg[1]), abs(p[2] - bg[2])) > tolerancia:
                fila_vacia = False
                break
        if not fila_vacia:
            ultimo = y
            break
    return im.crop((0, 0, w, min(h, ultimo + margen)))


def preparar_imagenes(manifiesto, carpeta):
    os.makedirs(DESTINO, exist_ok=True)
    out = {}
    for ident in manifiesto:
        origen = os.path.join(carpeta, ident + '.png')
        destino = os.path.join(DESTINO, ident + '.jpg')
        if not os.path.exists(origen):
            raise FileNotFoundError(origen)
        if (not os.path.exists(destino)) or os.path.getmtime(destino) < os.path.getmtime(origen):
            im = Image.open(origen).convert('RGB')
            im = _recortar_abajo(im)
            if im.width > MAX_ANCHO:
                im = im.resize((MAX_ANCHO, int(im.height * MAX_ANCHO / im.width)), Image.LANCZOS)
            ImageDraw.Draw(im).rectangle([0, 0, im.width - 1, im.height - 1], outline=(191, 191, 191), width=2)
            im.save(destino, 'JPEG', quality=78, optimize=True)
        w, h = Image.open(destino).size
        out[ident] = (destino, w, h)
    return out
