"""Crop a region of an image and render it as a high-res luminance/hue map."""
import sys
from inspect_km import hue_char

RAMP = " .:-=+*#%@"


def crop(path, x0, y0, x1, y1, cols=90, rows=42):
    im = Image.open(path).convert("RGB")
    W, H = im.size
    box = (int(x0 * W), int(y0 * H), int(x1 * W), int(y1 * H))
    im = im.crop(box)
    print("CROP %s  region x%.0f%%-%.0f%% y%.0f%%-%.0f%%  -> %dx%d px"
          % (path.split("/")[-1], x0 * 100, x1 * 100, y0 * 100, y1 * 100,
             im.size[0], im.size[1]))
    small = im.resize((cols, rows), Image.LANCZOS)
    px = small.load()
    print("LUMINANCE:")
    for y in range(rows):
        s = []
        for x in range(cols):
            r, g, b = px[x, y]
            lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0
            s.append(RAMP[min(len(RAMP) - 1, int(lum * len(RAMP)))])
        print("%2d|%s|" % (y, "".join(s)))
    print("HUE:")
    for y in range(rows):
        s = [hue_char(*px[x, y]) for x in range(cols)]
        print("%2d|%s|" % (y, "".join(s)))


if __name__ == "__main__":
    from PIL import Image
    p = sys.argv[1]
    a = [float(v) for v in sys.argv[2:6]]
    crop(p, *a)
