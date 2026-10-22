"""Inspect the knowledge-map reference screenshots without viewing them.

Prints dimensions, dominant palette, and high-resolution luminance + hue
maps so the design can be reconstructed from measurable data.
"""
import sys
import colorsys
from PIL import Image

RAMP = " .:-=+*#%@"


def hue_char(r, g, b):
    """Classify a pixel into a coarse hue category letter."""
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    if s < 0.14:                       # desaturated -> greyscale
        if l < 0.14:
            return 'K'
        if l < 0.45:
            return 'k'
        if l < 0.72:
            return '-'
        return 'W'
    deg = h * 360
    if deg < 15 or deg >= 345:
        return 'R'
    if deg < 45:
        return 'O'
    if deg < 70:
        return 'Y'
    if deg < 165:
        return 'G'
    if deg < 200:
        return 'C'
    if deg < 260:
        return 'B'
    return 'P'


def analyze(path, cols=110, rows=48):
    im = Image.open(path).convert("RGB")
    W, H = im.size
    print("=" * 76)
    print("FILE:", path)
    print("SIZE: %d x %d   (aspect %.3f)" % (W, H, W / H))

    q = im.quantize(colors=10, method=Image.MEDIANCUT, dither=Image.Dither.NONE)
    pal = q.getpalette()[: 10 * 3]
    total = W * H
    print("PALETTE (top 10):")
    for cnt, idx in sorted(q.getcolors(), reverse=True):
        r, g, b = pal[idx * 3: idx * 3 + 3]
        print("   #%02X%02X%02X  %5.1f%%" % (r, g, b, 100.0 * cnt / total))

    small = im.resize((cols, rows), Image.LANCZOS)
    px = small.load()

    print("LUMINANCE (%dx%d):" % (cols, rows))
    for y in range(rows):
        s = []
        for x in range(cols):
            r, g, b = px[x, y]
            lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0
            s.append(RAMP[min(len(RAMP) - 1, int(lum * len(RAMP)))])
        print("%2d|%s|" % (y, "".join(s)))

    print("HUE (K/k/-/W greys, R,O,Y,G,C,B,P hues):")
    for y in range(rows):
        s = []
        for x in range(cols):
            r, g, b = px[x, y]
            s.append(hue_char(r, g, b))
        print("%2d|%s|" % (y, "".join(s)))
    print()


if __name__ == "__main__":
    for p in sys.argv[1:]:
        analyze(p)
