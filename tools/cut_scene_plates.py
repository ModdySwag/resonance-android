#!/usr/bin/env python3
"""Cut the eight focus-scene plates from their generation URLs into the app's
ui/scene folder, and build a contact sheet for the eye gate.

Usage: python cut_scene_plates.py <urls.json>
urls.json: { "<scene-id>": "<rawUrl>", ... }
"""
import io
import json
import os
import sys
import urllib.request

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.abspath(os.path.join(HERE, ".."))
OUT = os.path.join(PROJECT, "app", "src", "main", "assets", "www", "app", "ui", "scene")
SHEET = os.path.join(HERE, "scene-plates-sheet.png")


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (resonance-assets)"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return Image.open(io.BytesIO(r.read())).convert("RGB")


def cover(im, w, h):
    sw, sh = im.size
    s = max(w / sw, h / sh)
    dw, dh = round(sw * s), round(sh * s)
    im = im.resize((dw, dh), Image.LANCZOS)
    x = (dw - w) // 2
    y = (dh - h) // 2
    return im.crop((x, y, x + w, y + h))


def main():
    urls = json.load(open(sys.argv[1], "r", encoding="utf-8"))
    os.makedirs(OUT, exist_ok=True)
    tiles = []
    for sid, url in urls.items():
        im = fetch(url)
        cut = cover(im, 1280, 720)
        path = os.path.join(OUT, sid + ".webp")
        cut.save(path, "WEBP", quality=80, method=6)
        print("%-12s %s  %6d B  mean=%.1f" % (sid, cut.size, os.path.getsize(path),
                                              sum(cut.convert("L").resize((16, 9)).getdata()) / 144))
        tiles.append((sid, cut.resize((640, 360), Image.LANCZOS)))
    cols, rows = 4, 2
    sheet = Image.new("RGB", (cols * 640, rows * 360 + 24), (10, 10, 10))
    d = ImageDraw.Draw(sheet)
    for i, (sid, tile) in enumerate(tiles):
        x = (i % cols) * 640
        y = (i // cols) * 360
        sheet.paste(tile, (x, y))
        d.text((x + 8, y + 8), sid, fill=(255, 220, 120))
    sheet.save(SHEET)
    print("sheet:", SHEET)


if __name__ == "__main__":
    main()
